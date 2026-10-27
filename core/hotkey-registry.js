"use strict";

/**
 * Registers user-configured global accelerators.
 * A bad accelerator should be skipped without taking down the app.
 */
function registerConfiguredHotkeys({ globalShortcut, hotkeys, handlers, logger = console }) {
  globalShortcut.unregisterAll();

  for (const [key, handler] of Object.entries(handlers)) {
    const accelerator = hotkeys[key];
    if (!accelerator) continue;

    try {
      const registered = globalShortcut.register(accelerator, handler);
      if (!registered) {
        logger.error(
          'Failed to register hotkey "' + accelerator + '" (' + key +
          ") -- it may already be in use by another app.",
        );
      }
    } catch (err) {
      logger.error(
        'Hotkey "' + accelerator + '" (' + key + ") is invalid and was skipped:",
        err.message,
      );
    }
  }
}

module.exports = { registerConfiguredHotkeys };
