"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SessionArchiveStore } = require("../../../core/session-archive-store");

function makeStore(t) {
  const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "valorant-vod-notes-"));
  t.after(() => fs.rmSync(notesDir, { recursive: true, force: true }));
  return {
    notesDir,
    store: new SessionArchiveStore(notesDir),
  };
}

function writeJson(dir, filename, value) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(value, null, 2));
}

test("listSessions summarizes results and sorts newest first", (t) => {
  const { notesDir, store } = makeStore(t);
  writeJson(notesDir, "session-older.json", {
    id: "older",
    status: "closed",
    startedAt: 100,
    rounds: { 1: { outcome: "lost" } },
  });
  writeJson(notesDir, "session-newer.json", {
    id: "newer",
    status: "closed",
    startedAt: 200,
    rounds: {
      1: { outcome: "won" },
      2: { outcome: "lost" },
      3: { outcome: null },
    },
  });
  fs.writeFileSync(path.join(notesDir, "session-broken.json"), "{not json");

  assert.deepEqual(store.listSessions(), [
    {
      id: "newer",
      status: "closed",
      mdFile: "session-newer.md",
      roundCount: 3,
      startedAt: 200,
      won: 1,
      lost: 1,
    },
    {
      id: "older",
      status: "closed",
      mdFile: "session-older.md",
      roundCount: 1,
      startedAt: 100,
      won: 0,
      lost: 1,
    },
  ]);
});

test("getSession returns parsed data or null for missing files", (t) => {
  const { notesDir, store } = makeStore(t);
  const session = { id: "example", rounds: { 1: { note: "retake" } } };
  writeJson(notesDir, "session-example.json", session);

  assert.deepEqual(store.getSession("example"), session);
  assert.equal(store.getSession("missing"), null);
  assert.equal(store.getSession(""), null);
});

test("updateClosedSessionDetails updates only provided fields", (t) => {
  const { notesDir, store } = makeStore(t);
  writeJson(notesDir, "session-example.json", {
    id: "example",
    map: "Ascent",
    agent: "Sova",
    gameMode: "Competitive",
    kills: 4,
    deaths: 6,
    assists: 3,
    rank: "Diamond",
    generalComment: "old note",
    firstHalfSide: "defense",
    rounds: {},
  });

  assert.equal(
    store.updateClosedSessionDetails("example", {
      map: "",
      agent: "Jett",
      kills: "12",
      deaths: "5",
      assists: "2",
      generalComment: "good game",
      firstHalfSide: "attack",
    }),
    true,
  );

  const updated = store.getSession("example");
  assert.equal(updated.map, null);
  assert.equal(updated.agent, "Jett");
  assert.equal(updated.gameMode, "Competitive");
  assert.equal(updated.kills, 12);
  assert.equal(updated.deaths, 5);
  assert.equal(updated.assists, 2);
  assert.equal(updated.rank, "Diamond");
  assert.equal(updated.generalComment, "good game");
  assert.equal(updated.firstHalfSide, "attack");
  assert.deepEqual(updated.rounds, {});

  assert.equal(store.updateClosedSessionDetails("missing", { map: "Haven" }), false);
  assert.equal(store.updateClosedSessionDetails("example", null), false);
});

test("deleteSession removes the JSON and Markdown files", (t) => {
  const { notesDir, store } = makeStore(t);
  fs.writeFileSync(path.join(notesDir, "session-example.json"), "{}");
  fs.writeFileSync(path.join(notesDir, "session-example.md"), "# Review");

  assert.equal(store.deleteSession("example"), true);
  assert.equal(fs.existsSync(path.join(notesDir, "session-example.json")), false);
  assert.equal(fs.existsSync(path.join(notesDir, "session-example.md")), false);
  assert.equal(store.deleteSession(""), false);
});

test("getSessionDetails supports active and archived sessions", (t) => {
  const { notesDir, store } = makeStore(t);
  const active = {
    active: true,
    map: "Ascent",
    agent: "Jett",
    gameMode: "Competitive",
    kills: 15,
    deaths: 12,
    assists: 4,
    rank: "Ascendant",
    generalComment: "Improve attack-side decisions",
    firstHalfSide: "attack",
  };

  assert.deepEqual(store.getSessionDetails(null, active), {
    map: "Ascent",
    agent: "Jett",
    gameMode: "Competitive",
    kills: 15,
    deaths: 12,
    assists: 4,
    rank: "Ascendant",
    generalComment: "Improve attack-side decisions",
    firstHalfSide: "attack",
  });
  assert.equal(store.getSessionDetails(null, { active: false }), null);

  writeJson(notesDir, "session-archived.json", {
    map: "Icebox",
    agent: "",
    gameMode: "Unrated",
    kills: 0,
    deaths: 2,
    assists: 3,
    rank: "",
    generalComment: "",
    firstHalfSide: null,
  });
  assert.deepEqual(store.getSessionDetails("archived", null), {
    map: "Icebox",
    agent: null,
    gameMode: "Unrated",
    kills: 0,
    deaths: 2,
    assists: 3,
    rank: null,
    generalComment: "",
    firstHalfSide: null,
  });
  assert.equal(store.getSessionDetails("missing", null), null);
});


test("store rejects unsafe IDs and refuses to mutate or delete an active session", (t) => {
  const { notesDir, store } = makeStore(t);
  writeJson(notesDir, "session-live.json", {
    id: "live",
    status: "active",
    startedAt: 300,
    map: "Ascent",
    rounds: {},
  });

  assert.equal(store.getSession("../outside"), null);
  assert.equal(store.updateClosedSessionDetails("../outside", { map: "Haven" }), false);
  assert.equal(store.deleteSession("../outside"), false);
  assert.equal(store.getSessionDetails("../outside", null), null);

  assert.equal(store.updateClosedSessionDetails("live", { map: "Haven" }), false);
  assert.equal(store.deleteSession("live"), false);
  assert.equal(store.getSession("live").map, "Ascent");
  assert.equal(fs.existsSync(path.join(notesDir, "session-live.json")), true);
});


test("listSessions excludes pre-match round zero from the tracked-round count", (t) => {
  const { notesDir, store } = makeStore(t);
  writeJson(notesDir, "session-new.json", {
    id: "new",
    status: "active",
    startedAt: 300,
    rounds: {
      0: { note: "", stats: null },
      1: { note: "", outcome: null },
      2: { note: "Baited the retake", outcome: "won" },
    },
  });

  assert.equal(store.listSessions()[0].roundCount, 2);
});
