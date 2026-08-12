// Shared settings-form behavior. Both the floating overlay settings panel
// (settings.html) and the embedded Settings tab in the main window
// (main-window.html) load this same script and call initSettingsForm()
// with a tiny adapter that speaks to their own preload bridge. Everything
// else -- hotkey capture, size/position presets, quick-nav between
// sections -- lives here once so the two UIs can never drift apart.
//
// adapter shape:
//   load(cb)   -- calls cb(settingsObject) as soon as data is available,
//                 and again any time settings change elsewhere
//   save(data) -- persists the edited settings object
//   close()    -- optional. Omit (or pass null) to hide the Close button,
//                 for hosts (like the embedded tab) that have nothing to
//                 "close" -- the pane just stays open.
function initSettingsForm(adapter) {
  const HOTKEY_IDS = ['toggle', 'manualRound', 'newSession', 'prevRound', 'nextRound', 'toolbar', 'scratch', 'sessions'];
  let current = null;
  let listeningKey = null;

  // ---- Hotkey capture ----
  const SPECIAL_KEYS = {
    ' ': 'Space', 'Spacebar': 'Space',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Delete': 'Delete', 'Backspace': 'Backspace', 'Tab': 'Tab',
    'Enter': 'Return', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown', 'Insert': 'Insert'
  };

  function keyEventToAccelerator(e) {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null;
    if (e.key === 'Tab') return null;
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    let keyName;
    if (SPECIAL_KEYS[e.key]) keyName = SPECIAL_KEYS[e.key];
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) keyName = e.key;
    else if (e.key.length === 1) keyName = e.key.toUpperCase();
    else return null;

    parts.push(keyName);
    return parts.join('+');
  }

  document.querySelectorAll('.hk-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hk-btn').forEach(b => b.classList.remove('listening'));
      listeningKey = btn.dataset.key;
      btn.classList.add('listening');
      btn.textContent = 'Press a key...';
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!listeningKey) return;
    e.preventDefault();
    const btn = document.querySelector(`.hk-btn[data-key="${listeningKey}"]`);
    if (e.key === 'Escape') {
      btn.textContent = current.hotkeys[listeningKey];
      btn.classList.remove('listening');
      listeningKey = null;
      return;
    }
    const accel = keyEventToAccelerator(e);
    if (!accel) return;
    current.hotkeys[listeningKey] = accel;
    btn.textContent = accel;
    btn.classList.remove('listening');
    listeningKey = null;
  });

  // ---- Size/position preset UI helpers (shared between every window) ----
  function wireSizePresets(prefix, windowId) {
    const row = document.getElementById(`${prefix}-size-presets`);
    const customRow = document.getElementById(`${prefix}-size-custom-row`);
    row.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        current[windowId].size.mode = preset === 'custom' ? 'custom' : 'preset';
        if (preset !== 'custom') current[windowId].size.preset = preset;
        customRow.style.display = preset === 'custom' ? 'flex' : 'none';
      });
    });
  }

  function wirePositionPresets(prefix, windowId) {
    const row = document.getElementById(`${prefix}-pos-presets`);
    row.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        current[windowId].position.mode = 'preset';
        current[windowId].position.preset = btn.dataset.preset;
      });
    });
  }
  wireSizePresets('np', 'notepad');
  wireSizePresets('tb', 'toolbar');
  wireSizePresets('sc', 'scratch');
  wireSizePresets('ss', 'sessions');
  wirePositionPresets('np', 'notepad');
  wirePositionPresets('tb', 'toolbar');
  wirePositionPresets('sc', 'scratch');
  wirePositionPresets('ss', 'sessions');

  function applyWindowUiState(prefix, windowId) {
    const w = current[windowId];
    const sizeRow = document.getElementById(`${prefix}-size-presets`);
    sizeRow.querySelectorAll('button').forEach(b => {
      const isActive = w.size.mode === 'custom' ? b.dataset.preset === 'custom' : b.dataset.preset === w.size.preset;
      b.classList.toggle('active', isActive);
    });
    document.getElementById(`${prefix}-size-custom-row`).style.display = w.size.mode === 'custom' ? 'flex' : 'none';
    document.getElementById(`${prefix}-customWidth`).value = w.size.width || '';
    document.getElementById(`${prefix}-customHeight`).value = w.size.height || '';

    const posRow = document.getElementById(`${prefix}-pos-presets`);
    posRow.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', w.position.mode === 'preset' && b.dataset.preset === w.position.preset);
    });
  }

  // ---- Load settings into the UI (called on first load AND every time
  // the adapter reports settings changed elsewhere, e.g. edited from the
  // overlay while the main window's embedded tab is also open) ----
  function applyLoadedSettings(data) {
    current = JSON.parse(JSON.stringify(data));
    applyTheme(current.theme);
    HOTKEY_IDS.forEach(k => {
      document.querySelector(`.hk-btn[data-key="${k}"]`).textContent = current.hotkeys[k];
    });
    document.getElementById('theme').value = current.theme;
    document.getElementById('np-opacity').value = current.notepad.opacity;
    document.getElementById('np-textSize').value = current.notepad.textSize;
    document.getElementById('tabCapture').checked = !!current.tabCapture.enabled;
    document.getElementById('np-showOnOpen').checked = !!current.notepad.showOnOpen;
    document.getElementById('tb-showOnOpen').checked = !!current.toolbar.showOnOpen;
    document.getElementById('sc-showOnOpen').checked = !!current.scratch.showOnOpen;
    document.getElementById('ss-showOnOpen').checked = !!current.sessions.showOnOpen;

    applyWindowUiState('np', 'notepad');
    applyWindowUiState('tb', 'toolbar');
    applyWindowUiState('sc', 'scratch');
    applyWindowUiState('ss', 'sessions');
  }

  adapter.load(applyLoadedSettings);

  // Live-preview the theme toggle immediately, same as every other window.
  document.getElementById('theme').addEventListener('change', (e) => {
  const theme = e.target.value;
  applyTheme(theme);
  if (adapter.previewTheme) adapter.previewTheme(theme);
});

  document.getElementById('saveBtn').addEventListener('click', () => {
    if (!current) return; // settings haven't loaded yet -- nothing to save
    if (listeningKey) {
      const btn = document.querySelector(`.hk-btn[data-key="${listeningKey}"]`);
      btn.textContent = current.hotkeys[listeningKey];
      btn.classList.remove('listening');
      listeningKey = null;
    }
    current.theme = document.getElementById('theme').value;
    current.notepad.opacity = parseFloat(document.getElementById('np-opacity').value);
    current.notepad.textSize = parseInt(document.getElementById('np-textSize').value, 10);
    if (current.notepad.size.mode === 'custom') {
      current.notepad.size.width = parseInt(document.getElementById('np-customWidth').value, 10) || 420;
      current.notepad.size.height = parseInt(document.getElementById('np-customHeight').value, 10) || 360;
    }
    if (current.toolbar.size.mode === 'custom') {
      current.toolbar.size.width = parseInt(document.getElementById('tb-customWidth').value, 10) || 320;
      current.toolbar.size.height = parseInt(document.getElementById('tb-customHeight').value, 10) || 56;
    }
    if (current.scratch.size.mode === 'custom') {
      current.scratch.size.width = parseInt(document.getElementById('sc-customWidth').value, 10) || 360;
      current.scratch.size.height = parseInt(document.getElementById('sc-customHeight').value, 10) || 420;
    }
    if (current.sessions.size.mode === 'custom') {
      current.sessions.size.width = parseInt(document.getElementById('ss-customWidth').value, 10) || 380;
      current.sessions.size.height = parseInt(document.getElementById('ss-customHeight').value, 10) || 460;
    }
    current.notepad.showOnOpen = document.getElementById('np-showOnOpen').checked;
    current.toolbar.showOnOpen = document.getElementById('tb-showOnOpen').checked;
    current.scratch.showOnOpen = document.getElementById('sc-showOnOpen').checked;
    current.sessions.showOnOpen = document.getElementById('ss-showOnOpen').checked;
    current.tabCapture.enabled = document.getElementById('tabCapture').checked;
    adapter.save(current);

    const savedFlag = document.getElementById('savedFlag');
    if (savedFlag) {
      savedFlag.classList.add('show');
      clearTimeout(savedFlag._hideTimer);
      savedFlag._hideTimer = setTimeout(() => savedFlag.classList.remove('show'), 1600);
    }
  });

  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) {
    if (adapter.close) closeBtn.addEventListener('click', () => adapter.close());
    else closeBtn.style.display = 'none';
  }

  // ---- Quick-nav between sections ----
  // Works the same way in both hosts: a row/column of buttons with
  // data-goto="<section id>", scrolling #settings-scroll and highlighting
  // whichever section is currently in view.
  const scrollHost = document.getElementById('settings-scroll');
  const navBtns = document.querySelectorAll('.qn-btn');
  if (scrollHost && navBtns.length) {
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.toggle('active', b === btn));
        const target = document.getElementById(btn.dataset.goto);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    navBtns[0].classList.add('active'); // sensible default before any scroll/click happens
    const sections = Array.from(navBtns).map(b => document.getElementById(b.dataset.goto)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navBtns.forEach(b => b.classList.toggle('active', b.dataset.goto === entry.target.id));
        }
      });
    }, { root: scrollHost, rootMargin: '-10% 0px -70% 0px', threshold: 0 });
    sections.forEach(s => observer.observe(s));
  }
}