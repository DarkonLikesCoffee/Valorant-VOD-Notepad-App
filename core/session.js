const fs = require("fs");
const path = require("path");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function mmss(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Owns one VOD-review session at a time.
 *
 * Sessions are deliberately manual: starting/stopping the session is the
 * user's decision. VALORANT opening, closing, crashing, losing connection,
 * etc. never starts or ends a session automatically.
 *
 * The current session is persisted after every note/round change. If the app
 * is closed while a session is ACTIVE, the same session is recovered on the
 * next launch instead of creating a new one.
 */
class SessionManager {
  constructor(notesDir) {
    this.notesDir = notesDir;
    if (!fs.existsSync(this.notesDir))
      fs.mkdirSync(this.notesDir, { recursive: true });
    this._resetEmpty();
    this._recoverActive();
  }

  _resetEmpty() {
    this.id = null;
    this.startedAt = null;
    this.endedAt = null;
    this.status = "closed";
    this.round = 0;
    this.rounds = {};
    this.viewingRound = null;

    this.map = null;
    this.agent = null;
    this.gameMode = null;
    this.kills = null;
    this.deaths = null;
    this.assists = null;
    this.rank = null;
    this.generalComment = "";
    this.firstHalfSide = null;

    this.jsonPath = null;
    this.mdPath = null;
  }

  get active() {
    return this.status === "active";
  }

  start() {
    if (this.active) return false;

    const id = timestamp();
    this.id = id;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.status = "active";
    this.round = 0;
    this.rounds = {
      0: { note: "", roundStartedAt: this.startedAt, stats: null },
    };
    this.map = null;
    this.agent = null;
    this.gameMode = null;
    this.kills = null;
    this.deaths = null;
    this.assists = null;
    this.rank = null;
    this.generalComment = "";
    this.firstHalfSide = null;
    this.viewingRound = null;
    this.jsonPath = path.join(this.notesDir, `session-${id}.json`);
    this.mdPath = path.join(this.notesDir, `session-${id}.md`);
    this.saveToDisk();
    return true;
  }

  end() {
    if (!this.active) return false;
    this.endedAt = Date.now();
    this.status = "closed";
    this.viewingRound = null;
    this.saveToDisk();
    return true;
  }

  _loadFromFile(file) {
    try {
      const jsonPath = path.join(this.notesDir, file);
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (data.status !== "active") return false;

      this.id = data.id;
      this.startedAt = data.startedAt;
      this.endedAt = null;
      this.status = "active";
      this.round = Number(data.round) || 0;
      this.rounds =
        data.rounds && typeof data.rounds === "object" ? data.rounds : {};
      this.map = data.map ?? null;
      this.agent = data.agent ?? null;
      this.gameMode = data.gameMode ?? null;
      this.kills = data.kills ?? null;
      this.deaths = data.deaths ?? null;
      this.assists = data.assists ?? null;
      this.rank = data.rank ?? null;
      this.generalComment = data.generalComment ?? "";
      this.firstHalfSide = data.firstHalfSide ?? null;
      this.viewingRound = null;
      this.jsonPath = jsonPath;
      this.mdPath = path.join(this.notesDir, file.replace(/\.json$/, ".md"));
      return true;
    } catch (err) {
      console.error("session: failed to recover", file, err.message);
      return false;
    }
  }

  _recoverActive() {
    const files = fs
      .readdirSync(this.notesDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files) {
      if (this._loadFromFile(file)) {
        console.log(`[session] recovered active session ${this.id}`);
        return;
      }
    }
  }

  newRound(roundNumber, stats = null) {
    if (!this.active || roundNumber === this.round) return;
    this.round = roundNumber;
    this.rounds[roundNumber] = this.rounds[roundNumber] || {
      note: "",
      roundStartedAt: Date.now(),
      stats,
    };
    this.saveToDisk();
  }

  openForViewing() {
    if (!this.active) return;
    this.viewingRound = this.round;
  }

  closeViewing() {
    this.viewingRound = null;
  }

  _sortedRoundNumbers() {
    return Object.keys(this.rounds)
      .map(Number)
      .sort((a, b) => a - b);
  }

  navigate(direction) {
    if (!this.active || this.viewingRound === null) return;
    const nums = this._sortedRoundNumbers();
    const idx = nums.indexOf(this.viewingRound);
    if (idx === -1) return;
    if (direction === "prev" && idx > 0) this.viewingRound = nums[idx - 1];
    if (direction === "next" && idx < nums.length - 1)
      this.viewingRound = nums[idx + 1];
  }

  _targetRound() {
    return this.viewingRound !== null ? this.viewingRound : this.round;
  }

  saveNote(text) {
    if (!this.active) return;
    const target = this._targetRound();
    if (!this.rounds[target]) {
      this.rounds[target] = {
        note: "",
        roundStartedAt: Date.now(),
        stats: null,
      };
    }
    this.rounds[target].note = text;
    this.saveToDisk();
  }

  setRoundOutcome(roundNumber, outcome) {
    if (!this.active || !this.rounds[roundNumber]) return;
    this.rounds[roundNumber].outcome = outcome;
    this.saveToDisk();
  }

  attachScoreboard(filePath) {
    if (!this.active) return;
    const r = this.rounds[this.round];
    if (!r) return;
    r.scoreboardPath = filePath;
    this.saveToDisk();
  }

  currentRoundPayload() {
    if (!this.active) return null;
    const target = this._targetRound();
    const r = this.rounds[target];
    if (!r) return null;
    const nums = this._sortedRoundNumbers();
    const idx = nums.indexOf(target);
    return {
      round: target,
      elapsed: mmss(r.roundStartedAt - this.startedAt),
      note: r.note,
      stats: r.stats,
      outcome: r.outcome || null,
      isLive: target === this.round,
      hasPrev: idx > 0,
      hasNext: idx !== -1 && idx < nums.length - 1,
    };
  }

  updateDetails(details = {}) {
    if (!this.active) return false;

    if ("map" in details) this.map = details.map || null;
    if ("agent" in details) this.agent = details.agent || null;
    if ("gameMode" in details) this.gameMode = details.gameMode || null;
    if ("kills" in details)
      this.kills = details.kills === "" ? null : Number(details.kills);
    if ("deaths" in details)
      this.deaths = details.deaths === "" ? null : Number(details.deaths);
    if ("assists" in details)
      this.assists = details.assists === "" ? null : Number(details.assists);
    if ("rank" in details) this.rank = details.rank || null;
    if ("generalComment" in details)
      this.generalComment = details.generalComment || "";
    if ("firstHalfSide" in details)
      this.firstHalfSide = details.firstHalfSide || null;

    this.saveToDisk();
    return true;
  }

  updateClosedSessionDetails(sessionId, details = {}) {
    const files = fs
      .readdirSync(this.notesDir)
      .filter((file) => file.endsWith(".json"));

    const file = files.find((file) => {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(this.notesDir, file), "utf8"),
        );
        return data.id === sessionId;
      } catch {
        return false;
      }
    });

    if (!file) return false;

    const jsonPath = path.join(this.notesDir, file);

    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      if ("map" in details) data.map = details.map || null;
      if ("agent" in details) data.agent = details.agent || null;
      if ("gameMode" in details) data.gameMode = details.gameMode || null;

      if ("kills" in details)
        data.kills = details.kills === "" ? null : Number(details.kills);

      if ("deaths" in details)
        data.deaths = details.deaths === "" ? null : Number(details.deaths);

      if ("assists" in details)
        data.assists = details.assists === "" ? null : Number(details.assists);

      if ("rank" in details) data.rank = details.rank || null;

      if ("generalComment" in details)
        data.generalComment = details.generalComment || "";

      if ("firstHalfSide" in details)
        data.firstHalfSide = details.firstHalfSide || null;

      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

      return true;
    } catch (err) {
      console.error(
        "session: failed to update closed session",
        sessionId,
        err.message,
      );
      return false;
    }
  }

  saveToDisk() {
    if (!this.jsonPath || !this.mdPath) return;
    fs.writeFileSync(this.jsonPath, JSON.stringify(this, null, 2));

    const roundNums = this._sortedRoundNumbers();
    const tally = roundNums.reduce(
      (acc, n) => {
        const o = this.rounds[n].outcome;
        if (o === "won") acc.won += 1;
        if (o === "lost") acc.lost += 1;
        return acc;
      },
      { won: 0, lost: 0 },
    );

    const lines = [
      `# Valorant VOD review notes — ${this.id}`,
      "",
      `**Status: ${this.status === "active" ? "Active" : "Closed"}**`,
      `**Started: ${new Date(this.startedAt).toLocaleString()}**`,
      this.endedAt
        ? `**Ended: ${new Date(this.endedAt).toLocaleString()}**`
        : "",
      `**Current score: ${tally.won}-${tally.lost}**`,
      "",
    ].filter(Boolean);

    for (const n of roundNums) {
      const r = this.rounds[n];
      const elapsed = mmss(r.roundStartedAt - this.startedAt);
      const outcomeLabel =
        r.outcome === "won" ? " — WON" : r.outcome === "lost" ? " — LOST" : "";
      lines.push(`## Round ${n}${outcomeLabel}  (${elapsed} into session)`);
      if (r.stats) lines.push(`_${JSON.stringify(r.stats)}_`);
      if (r.scoreboardPath)
        lines.push(`📸 Scoreboard: \`${r.scoreboardPath}\``);
      lines.push(r.note.trim() ? r.note.trim() : "_(no note)_");
      lines.push("");
    }
    fs.writeFileSync(this.mdPath, lines.join("\n"));
  }
}

module.exports = { SessionManager };
