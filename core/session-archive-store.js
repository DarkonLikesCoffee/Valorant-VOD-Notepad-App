"use strict";

const fs = require("fs");
const path = require("path");

function isSafeSessionId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Reads and updates session files that are stored on disk.
 *
 * The active session's in-memory lifecycle stays in SessionManager. This
 * class owns the file operations needed by the session-history interface.
 */
class SessionArchiveStore {
  constructor(notesDir) {
    this.notesDir = notesDir;
  }

  listSessions() {
    if (!fs.existsSync(this.notesDir)) return [];

    const files = fs.readdirSync(this.notesDir).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const data = JSON.parse(
            fs.readFileSync(path.join(this.notesDir, f), "utf-8"),
          );
          const rounds = data.rounds || {};
          // Keep this tally aligned with the score shown in the session detail view.
          const tally = Object.values(rounds).reduce(
            (acc, round) => {
              if (round.outcome === "won") acc.won += 1;
              if (round.outcome === "lost") acc.lost += 1;
              return acc;
            },
            { won: 0, lost: 0 },
          );

          return {
            id: data.id,
            status: data.status || "closed",
            mdFile: f.replace(/\.json$/, ".md"),
            roundCount: Object.keys(rounds).filter((roundNumber) => Number(roundNumber) > 0).length,
            startedAt: data.startedAt,
            won: tally.won,
            lost: tally.lost,
          };
        } catch {
          // One damaged session file should not prevent the rest of history loading.
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  getSession(id) {
    if (!isSafeSessionId(id)) return null;

    const filePath = path.join(this.notesDir, "session-" + id + ".json");
    if (!fs.existsSync(filePath)) return null;

    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  updateClosedSessionDetails(id, details) {
    if (!isSafeSessionId(id) || !details) return false;

    const filePath = path.join(this.notesDir, "session-" + id + ".json");
    if (!fs.existsSync(filePath)) return false;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (data.status === "active") return false;

      if ("map" in details) data.map = details.map || null;
      if ("agent" in details) data.agent = details.agent || null;
      if ("gameMode" in details) data.gameMode = details.gameMode || null;

      if ("kills" in details) {
        data.kills = details.kills === "" ? null : Number(details.kills);
      }

      if ("deaths" in details) {
        data.deaths = details.deaths === "" ? null : Number(details.deaths);
      }

      if ("assists" in details) {
        data.assists = details.assists === "" ? null : Number(details.assists);
      }

      if ("rank" in details) data.rank = details.rank || null;

      if ("generalComment" in details) {
        data.generalComment = details.generalComment || "";
      }

      if ("firstHalfSide" in details) {
        data.firstHalfSide = details.firstHalfSide || null;
      }

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      console.error("[sessions] failed to update session details:", err.message);
      return false;
    }
  }

  deleteSession(id) {
    if (!isSafeSessionId(id)) return false;

    const jsonPath = path.join(this.notesDir, "session-" + id + ".json");
    const mdPath = path.join(this.notesDir, "session-" + id + ".md");

    try {
      if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        if (data.status === "active") return false;
        fs.unlinkSync(jsonPath);
      }
      if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);

      console.log("[sessions] deleted session " + id);
      return true;
    } catch (err) {
      console.error(
        "[sessions] failed to delete session " + id + ":",
        err.message,
      );
      return false;
    }
  }

  getSessionDetails(sessionId, activeSession) {
    if (sessionId && !isSafeSessionId(sessionId)) return null;
    if (
      !sessionId ||
      (activeSession && activeSession.active && activeSession.id === sessionId)
    ) {
      if (!activeSession || !activeSession.active) return null;

      return {
        map: activeSession.map,
        agent: activeSession.agent,
        gameMode: activeSession.gameMode,
        kills: activeSession.kills,
        deaths: activeSession.deaths,
        assists: activeSession.assists,
        rank: activeSession.rank,
        generalComment: activeSession.generalComment,
        firstHalfSide: activeSession.firstHalfSide,
      };
    }

    const filePath = path.join(this.notesDir, "session-" + sessionId + ".json");
    if (!fs.existsSync(filePath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      return {
        map: data.map || null,
        agent: data.agent || null,
        gameMode: data.gameMode || null,
        kills: data.kills ?? null,
        deaths: data.deaths ?? null,
        assists: data.assists ?? null,
        rank: data.rank || null,
        generalComment: data.generalComment || "",
        firstHalfSide: data.firstHalfSide || null,
      };
    } catch (err) {
      console.error("[sessions] failed to load session details:", err.message);
      return null;
    }
  }
}

module.exports = { SessionArchiveStore };
