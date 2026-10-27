"use strict";

/**
 * Owns overlay visibility and panel membership. Electron window creation
 * and panel-specific setup remain injected by the main process.
 */
class OverlayController {
  constructor({
    state,
    panelIds,
    getSettings,
    getPanelWindow,
    showPanelWindow,
    hidePanelWindow,
    showBackdrop,
    showExistingBackdrop,
    hideBackdrop,
    isGameFocused,
    showAndFocus,
    onPersistChange = () => {},
  }) {
    this.state = state;
    this.panelIds = panelIds;
    this.getSettings = getSettings;
    this.getPanelWindow = getPanelWindow;
    this.showPanelWindow = showPanelWindow;
    this.hidePanelWindow = hidePanelWindow;
    this.showBackdrop = showBackdrop;
    this.showExistingBackdrop = showExistingBackdrop;
    this.hideBackdrop = hideBackdrop;
    this.isGameFocused = isGameFocused;
    this.showAndFocus = showAndFocus;
    this.onPersistChange = onPersistChange;
  }

  openOverlay() {
    this.state.overlayWantsOpen = true;
    const settings = this.getSettings();
    this.state.visiblePanels = new Set(
      this.panelIds.filter((id) => settings[id] && settings[id].showOnOpen),
    );
    this.showBackdrop();
    this.state.visiblePanels.forEach((id) => this.showPanelWindow(id));
    this.state.overlayOpen = true;
  }

  closeOverlay({ hidePersistent = false, alreadyHidden = null } = {}) {
    this.state.overlayWantsOpen = false;
    this.panelIds.forEach((id) => {
      if (id === alreadyHidden) return;
      if (!hidePersistent && this.state.persistentPanels.has(id)) return;
      this.hidePanelWindow(id);
    });
    this.hideBackdrop();
    this.state.visiblePanels.clear();
    this.state.overlayOpen = false;
  }

  closePanel(id) {
    this.hidePanelWindow(id);
    this.state.visiblePanels.delete(id);

    // An explicit close overrides "keep visible when overlay closes".
    if (this.state.persistentPanels.delete(id)) {
      this.onPersistChange(id);
    }

    // A pinned panel can be visible without belonging to this overlay set.
    // Always close an otherwise empty overlay after an explicit panel close.
    if (this.state.overlayOpen && this.state.visiblePanels.size === 0) {
      this.closeOverlay({ alreadyHidden: id });
    }
  }

  hideOverlayForFocusLoss() {
    this.state.panelsHiddenForFocusLoss = new Set(
      this.panelIds.filter((id) => {
        const win = this.getPanelWindow(id);
        return win && win.isVisible();
      }),
    );
    this.panelIds.forEach((id) => this.hidePanelWindow(id));
    this.hideBackdrop();
    this.state.overlayOpen = false;
  }

  restoreAfterFocusGain() {
    if (this.state.overlayWantsOpen) {
      this.showExistingBackdrop();
      this.state.visiblePanels.forEach((id) => this.showPanelWindow(id));
      this.state.overlayOpen = true;
    }

    this.state.panelsHiddenForFocusLoss.forEach((id) => {
      if (
        this.state.persistentPanels.has(id) &&
        !this.state.visiblePanels.has(id)
      ) {
        this.showPanelWindow(id);
      }
    });
    this.state.panelsHiddenForFocusLoss.clear();
  }

  toggleOverlay() {
    if (this.state.overlayOpen) {
      this.closeOverlay();
    } else if (this.isGameFocused()) {
      this.openOverlay();
    }
  }

  ensurePanelShown(id) {
    if (!this.state.overlayOpen) {
      if (!this.isGameFocused()) return;
      this.openOverlay();
    }

    if (!this.state.visiblePanels.has(id)) {
      this.state.visiblePanels.add(id);
      this.showPanelWindow(id);
    } else {
      this.showAndFocus(this.getPanelWindow(id));
    }
  }

  togglePanel(id) {
    if (!this.state.overlayOpen) {
      if (!this.isGameFocused()) return;
      this.openOverlay();
      if (!this.state.visiblePanels.has(id)) {
        this.state.visiblePanels.add(id);
        this.showPanelWindow(id);
      }
      return;
    }

    if (this.state.visiblePanels.has(id)) {
      this.hidePanelWindow(id);
      this.state.visiblePanels.delete(id);
      if (this.state.visiblePanels.size === 0) this.closeOverlay();
    } else {
      this.state.visiblePanels.add(id);
      this.showPanelWindow(id);
    }
  }
}

module.exports = { OverlayController };
