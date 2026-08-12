const fs = require('fs');
const path = require('path');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mmss(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * SessionManager owns the round/notes data model, autosave, and markdown
 * export. It has no idea where round numbers come from — that's a
 * provider's job (see providers/standalone or providers/overwolf). It just
 * exposes newRound() / saveNote() and persists everything to disk.
 *
 * It also owns the "viewing round" concept: the notepad window can be
 * looking at a round that isn't necessarily the live one (browsing back
 * with prev/next, or staying locked on the round you're mid-sentence on
 * while a new round starts in the background). `round` is always the true
 * live round; `viewingRound` is what's currently shown in the notepad, or
 * null when nothing has it locked (i.e. the notepad is closed).
 */
class SessionManager {
  constructor(notesDir) {
    this.notesDir = notesDir;
    if (!fs.existsSync(this.notesDir)) fs.mkdirSync(this.notesDir, { recursive: true });
    this.start();
  }

  start() {
    const id = timestamp();
    this.id = id;
    this.startedAt = Date.now();
    this.round = 0;
    this.rounds = { 0: { note: '', roundStartedAt: this.startedAt, stats: null } };
    this.viewingRound = null; // null = notepad closed / not locked to anything
    this.jsonPath = path.join(this.notesDir, `session-${id}.json`);
    this.mdPath = path.join(this.notesDir, `session-${id}.md`);
    this.saveToDisk();
  }

  // Move the LIVE round forward. `stats` is optional — a provider with
  // richer data (like the future Overwolf/GEP provider) can pass it here;
  // the standalone provider just passes null. This never moves the
  // notepad's viewingRound — if it's locked to an earlier round (open and
  // being typed in), it stays there until the notepad is closed and
  // reopened. See openForViewing()/closeViewing().
  newRound(roundNumber, stats = null) {
    if (roundNumber === this.round) return; // no-op, nothing changed
    this.round = roundNumber;
    this.rounds[roundNumber] = this.rounds[roundNumber] || {
      note: '',
      roundStartedAt: Date.now(),
      stats
    };
    this.saveToDisk();
  }

  // Call when the notepad window is shown. Locks viewingRound to whatever
  // is live right now, so the notepad doesn't yank itself to a new round
  // out from under you mid-sentence if one starts while it's open.
  openForViewing() {
    this.viewingRound = this.round;
  }

  // Call when the notepad window is hidden/closed. Unlocks, so the next
  // time it's opened it snaps to whatever's live at that moment.
  closeViewing() {
    this.viewingRound = null;
  }

  _sortedRoundNumbers() {
    return Object.keys(this.rounds).map(Number).sort((a, b) => a - b);
  }

  // Move the viewing round to the previous/next round that has an entry.
  // Only meaningful while the notepad is open (viewingRound locked) —
  // a no-op otherwise.
  navigate(direction) {
    if (this.viewingRound === null) return;
    const nums = this._sortedRoundNumbers();
    const idx = nums.indexOf(this.viewingRound);
    if (idx === -1) return;
    if (direction === 'prev' && idx > 0) this.viewingRound = nums[idx - 1];
    if (direction === 'next' && idx < nums.length - 1) this.viewingRound = nums[idx + 1];
  }

  _targetRound() {
    return this.viewingRound !== null ? this.viewingRound : this.round;
  }

  saveNote(text) {
    this.rounds[this._targetRound()].note = text;
    this.saveToDisk();
  }

  // Records whether a round was won or lost. `outcome` is 'won' | 'lost'.
  // Called by the round-watcher once it sees the score change (the round
  // that just concluded is known at that point, not the new live one).
  setRoundOutcome(roundNumber, outcome) {
    if (!this.rounds[roundNumber]) return;
    this.rounds[roundNumber].outcome = outcome;
    this.saveToDisk();
  }

  // Attaches a scoreboard screenshot's file path to the currently LIVE
  // round (not necessarily whatever the notepad is viewing) -- used by
  // the optional Tab-triggered capture feature.
  attachScoreboard(filePath) {
    const r = this.rounds[this.round];
    if (!r) return;
    r.scoreboardPath = filePath;
    this.saveToDisk();
  }

  currentRoundPayload() {
    const target = this._targetRound();
    const r = this.rounds[target];
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
      hasNext: idx !== -1 && idx < nums.length - 1
    };
  }

  saveToDisk() {
    fs.writeFileSync(this.jsonPath, JSON.stringify(this, null, 2));

    const roundNums = this._sortedRoundNumbers();
    const tally = roundNums.reduce((acc, n) => {
      const o = this.rounds[n].outcome;
      if (o === 'won') acc.won += 1;
      if (o === 'lost') acc.lost += 1;
      return acc;
    }, { won: 0, lost: 0 });

    const lines = [
      `# Valorant VOD review notes — ${this.id}`,
      '',
      `**Current score: ${tally.won}-${tally.lost}**`,
      ''
    ];
    for (const n of roundNums) {
      const r = this.rounds[n];
      const elapsed = mmss(r.roundStartedAt - this.startedAt);
      const outcomeLabel = r.outcome === 'won' ? ' — WON' : r.outcome === 'lost' ? ' — LOST' : '';
      lines.push(`## Round ${n}${outcomeLabel}  (${elapsed} into session)`);
      if (r.stats) lines.push(`_${JSON.stringify(r.stats)}_`);
      if (r.scoreboardPath) lines.push(`📸 Scoreboard: \`${r.scoreboardPath}\``);
      lines.push(r.note.trim() ? r.note.trim() : '_(no note)_');
      lines.push('');
    }
    fs.writeFileSync(this.mdPath, lines.join('\n'));
  }
}

module.exports = { SessionManager };
