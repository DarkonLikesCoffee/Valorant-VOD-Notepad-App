"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Reads and writes the freeform scratchpad.
 * The file remains in Documents/ValorantVODNotes/scratchpad.md.
 */
class ScratchStore {
  constructor(notesDir) {
    this.notesDir = notesDir;
    this.filePath = path.join(notesDir, "scratchpad.md");
  }

  load() {
    return fs.existsSync(this.filePath)
      ? fs.readFileSync(this.filePath, "utf-8")
      : "";
  }

  save(text) {
    if (!fs.existsSync(this.notesDir)) {
      fs.mkdirSync(this.notesDir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, text);
  }
}

module.exports = { ScratchStore };
