      const SECTION_TITLES = {
        scratch: "Scratch Pad",
        sessions: "Session History",
        settings: "Settings",
      };

      document.querySelectorAll(".nav-item").forEach((el) => {
        el.addEventListener("click", () => {
          document
            .querySelectorAll(".nav-item")
            .forEach((n) => n.classList.remove("active"));
          document
            .querySelectorAll(".pane")
            .forEach((p) => p.classList.remove("active"));
          el.classList.add("active");
          document
            .getElementById("pane-" + el.dataset.tab)
            .classList.add("active");
          document.getElementById("section-now").textContent =
            SECTION_TITLES[el.dataset.tab];
          if (el.dataset.tab === "sessions") renderSessions();
        });
      });

      window.mainApp.onTheme((theme) => applyTheme(theme));

      document.getElementById("winMinimize").addEventListener("click", () => {
        console.log("[titlebar] minimize clicked");
        window.mainApp.minimize();
      });
      document.getElementById("winMaximize").addEventListener("click", () => {
        console.log("[titlebar] maximize clicked");
        window.mainApp.toggleMaximize();
      });
      document.getElementById("winClose").addEventListener("click", () => {
        console.log("[titlebar] close clicked");
        window.mainApp.closeWindow();
      });

      // ---- Scratch pad ----
      const scratchBox = document.getElementById("scratch-box");
      const scratchStatus = document.getElementById("scratch-status");
      const scratchCounts = document.getElementById("scratch-counts");
      let scratchSaveTimer = null;

      function updateCounts() {
        const val = scratchBox.value;
        const words = val.trim() ? val.trim().split(/\s+/).length : 0;
        scratchCounts.textContent = `${words} words · ${val.length} chars`;
      }

      window.mainApp.getScratch().then((text) => {
        scratchBox.value = text || "";
        updateCounts();
      });
      scratchBox.addEventListener("input", () => {
        updateCounts();
        scratchStatus.textContent = "saving...";
        clearTimeout(scratchSaveTimer);
        scratchSaveTimer = setTimeout(() => {
          window.mainApp.saveScratch(scratchBox.value);
          scratchStatus.textContent = "saved";
        }, 300);
      });

      // ---- Session history ----
      async function renderSessions() {
        const listEl = document.getElementById("sessions-list");
        const detailEl = document.getElementById("sess-detail");
        const items = await window.mainApp.listSessions();
        const decided = items.filter(
          (s) => s.status !== "active" && s.won + s.lost > 0 && s.won !== s.lost,
        );
        const wins = decided.filter((s) => s.won > s.lost).length;
        const losses = decided.filter((s) => s.lost > s.won).length;
        const live = items.filter((s) => s.status === "active").length;
        const undecided = items.length - wins - losses - live;
        document.getElementById("sess-count").textContent =
          `${items.length} session${items.length === 1 ? "" : "s"}`;
        const tally = [];
        tally.push(`<span style="color:var(--win)">${wins}W</span>`);
        tally.push(`<span style="color:var(--loss)">${losses}L</span>`);
        if (live) tally.push(`${live} live`);
        if (undecided) tally.push(`${undecided} undecided`);
        document.getElementById("sess-wl").innerHTML = items.length
          ? tally.join(" · ")
          : "";

        if (!items.length) {
          listEl.innerHTML = "";
          detailEl.innerHTML =
            '<div id="sess-empty">No sessions yet — start playing and hit Alt+N.</div>';
          return;
        }
        listEl.innerHTML = "";
        for (const s of items) {
          const date = new Date(s.startedAt).toLocaleString();
          const total = s.won + s.lost;
          const isActive = s.status === "active";
          const result =
            !isActive && total > 0 && s.won !== s.lost
              ? s.won > s.lost ? "W" : "L"
              : null;
          const tag = isActive
            ? `<span class="result-tag" style="background:var(--accent); color:white;">LIVE</span>`
            : result
              ? `<span class="result-tag ${result === "W" ? "win" : "loss"}">${result}</span>`
              : `<span class="result-tag" style="background:var(--muted); color:var(--muted-foreground);">—</span>`;
          const div = document.createElement("div");
          div.className = "sess-row";
          div.innerHTML = `
              <div class="top">
                <span class="left">${tag}<span class="date">Session</span></span>

                <span class="session-row-actions">
                  <span class="score">${s.won}-${s.lost}</span>

                  <button
                    class="session-menu-btn"
                    type="button"
                    aria-label="Session options"
                    title="Session options"
                  >
                    ⋮
                  </button>
                </span>
              </div>

              <div class="sub">
                ${date} · ${s.roundCount} round${s.roundCount === 1 ? "" : "s"} noted
              </div>
            `;

          const menuBtn = div.querySelector(".session-menu-btn");

          menuBtn.addEventListener("click", (event) => {
            event.stopPropagation();

            const existingMenu = div.querySelector(".session-menu");

            // Si este menú ya está abierto, cerrarlo.
            if (existingMenu) {
              existingMenu.remove();
              return;
            }

            // Cerrar cualquier otro menú abierto.
            document.querySelectorAll(".session-menu").forEach((menu) => {
              menu.remove();
            });

            const menu = document.createElement("div");
            menu.className = "session-menu";

            menu.innerHTML = `
              <button type="button" class="edit-session-btn">
                Edit Details
              </button>

              <button
                type="button"
                class="delete-session-btn"
                ${isActive ? 'disabled title="End this session before deleting it"' : ""}
              >
                Delete Session
              </button>
            `;

            menu.addEventListener("click", (event) => {
              event.stopPropagation();
            });

            menu
              .querySelector(".edit-session-btn")
              .addEventListener("click", (event) => {
                event.stopPropagation();
                menu.remove();

                openSessionEditor(s.id);
              });

            menu
              .querySelector(".delete-session-btn")
              .addEventListener("click", async (event) => {
                event.stopPropagation();

                menu.remove();

                const confirmed = window.confirm(
                  "Are you sure you want to delete this session?\n\nThis action cannot be undone.",
                );

                if (!confirmed) return;

                const deleted = await window.mainApp.deleteSession(s.id);

                if (!deleted) {
                  window.alert("Unable to delete this session.");
                  return;
                }

                // Si estábamos viendo esta sesión, limpiar el panel de detalles.
                const detailEl = document.getElementById("sess-detail");
                detailEl.innerHTML =
                  '<div id="sess-empty">Select a session to view its details.</div>';

                // Volver a cargar la lista y los contadores.
                await renderSessions();
              });

            div.appendChild(menu);
          });

          div.addEventListener("click", () => selectSession(s.id));
          listEl.appendChild(div);
        }
      }

      document.addEventListener("click", () => {
        document.querySelectorAll(".session-menu").forEach((menu) => {
          menu.remove();
        });
      });

      // ---- Settings (embedded) ----
      // Same shared form as the overlay's floating settings panel -- this
      // adapter is the only part that's specific to being inside the main
      // window instead of a popup.

      async function openSessionEditor(id) {
        const detailEl = document.getElementById("sess-detail");
        const session = await window.mainApp.getSession(id);

        if (!session) {
          detailEl.innerHTML =
            '<div id="sess-empty">Unable to load this session.</div>';
          return;
        }

        const details = await window.mainApp.getSessionDetails(id);

        if (!details) {
          detailEl.innerHTML =
            '<div id="sess-empty">Unable to load session details.</div>';
          return;
        }

        detailEl.innerHTML = `
    <div class="session-detail-inner session-editor">

      <div class="session-detail-header">
        <div>
          <div class="section-label">Session History</div>
          <h2>Edit Session</h2>
          <div class="session-detail-meta">
            ${new Date(session.startedAt).toLocaleString()}
          </div>
        </div>

        <button type="button" class="session-editor-back" id="session-editor-back">
          ← Back
        </button>
      </div>

      <div class="session-editor-form">

        <div class="editor-field">
          <label for="history-session-map">Map</label>
          <select id="history-session-map">
            <option value="">Not set</option>
            <option value="Abyss">Abyss</option>
            <option value="Ascent">Ascent</option>
            <option value="Bind">Bind</option>
            <option value="Breeze">Breeze</option>
            <option value="Corrode">Corrode</option>
            <option value="Fracture">Fracture</option>
            <option value="Haven">Haven</option>
            <option value="Icebox">Icebox</option>
            <option value="Lotus">Lotus</option>
            <option value="Pearl">Pearl</option>
            <option value="Split">Split</option>
            <option value="Sunset">Sunset</option>
          </select>
        </div>

        <div class="editor-field">
          <label for="history-session-agent">Agent</label>
          <select id="history-session-agent">
            <option value="">Not set</option>
            <option value="Astra">Astra</option>
            <option value="Breach">Breach</option>
            <option value="Brimstone">Brimstone</option>
            <option value="Chamber">Chamber</option>
            <option value="Clove">Clove</option>
            <option value="Cypher">Cypher</option>
            <option value="Deadlock">Deadlock</option>
            <option value="Fade">Fade</option>
            <option value="Gekko">Gekko</option>
            <option value="Harbor">Harbor</option>
            <option value="Iso">Iso</option>
            <option value="Jett">Jett</option>
            <option value="KAY/O">KAY/O</option>
            <option value="Killjoy">Killjoy</option>
            <option value="Neon">Neon</option>
            <option value="Omen">Omen</option>
            <option value="Phoenix">Phoenix</option>
            <option value="Raze">Raze</option>
            <option value="Reyna">Reyna</option>
            <option value="Sage">Sage</option>
            <option value="Skye">Skye</option>
            <option value="Sova">Sova</option>
            <option value="Tejo">Tejo</option>
            <option value="Viper">Viper</option>
            <option value="Vyse">Vyse</option>
            <option value="Waylay">Waylay</option>
            <option value="Yoru">Yoru</option>
          </select>
        </div>

        <div class="editor-field">
          <label for="history-session-mode">Game Mode</label>
          <select id="history-session-mode">
            <option value="">Not set</option>
            <option value="Competitive">Competitive</option>
            <option value="Unrated">Unrated</option>
            <option value="Swiftplay">Swiftplay</option>
            <option value="Premier">Premier</option>
            <option value="Deathmatch">Deathmatch</option>
            <option value="Team Deathmatch">Team Deathmatch</option>
            <option value="Spike Rush">Spike Rush</option>
            <option value="Escalation">Escalation</option>
          </select>
        </div>

        <div class="editor-field">
          <label for="history-session-side">First Half Side</label>
          <select id="history-session-side">
            <option value="">Not set</option>
            <option value="attack">Attack</option>
            <option value="defense">Defense</option>
          </select>
        </div>

        <div class="editor-stats">
          <div class="editor-field">
            <label for="history-session-kills">Kills</label>
            <input id="history-session-kills" type="number" min="0">
          </div>

          <div class="editor-field">
            <label for="history-session-deaths">Deaths</label>
            <input id="history-session-deaths" type="number" min="0">
          </div>

          <div class="editor-field">
            <label for="history-session-assists">Assists</label>
            <input id="history-session-assists" type="number" min="0">
          </div>
        </div>

        <div class="editor-field">
          <label for="history-session-rank">Rank</label>
          <div class="editor-field">
            <label>Rank</label>

            <div class="rank-editor">
              <select id="history-session-rank">
                <option value="">Not set</option>
                <option value="Iron">Iron</option>
                <option value="Bronze">Bronze</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold</option>
                <option value="Platinum">Platinum</option>
                <option value="Diamond">Diamond</option>
                <option value="Ascendant">Ascendant</option>
                <option value="Immortal">Immortal</option>
                <option value="Radiant">Radiant</option>
              </select>

              <select id="history-session-rank-tier" hidden>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>
        </div>

        <div class="editor-field">
          <label for="history-session-comment">General Comment</label>
          <textarea
            id="history-session-comment"
            rows="5"
            placeholder="Add a general comment about this session..."
          ></textarea>
        </div>

        <div class="session-editor-status">
          <span id="history-session-save-status">All changes saved</span>
        </div>

      </div>
    </div>
  `;

        const map = document.getElementById("history-session-map");
        const agent = document.getElementById("history-session-agent");
        const mode = document.getElementById("history-session-mode");
        const side = document.getElementById("history-session-side");
        const kills = document.getElementById("history-session-kills");
        const deaths = document.getElementById("history-session-deaths");
        const assists = document.getElementById("history-session-assists");
        const rank = document.getElementById("history-session-rank");
        const rankTier = document.getElementById("history-session-rank-tier");
        const comment = document.getElementById("history-session-comment");
        const saveStatus = document.getElementById(
          "history-session-save-status",
        );

        map.value = details.map || "";
        agent.value = details.agent || "";
        mode.value = details.gameMode || "";
        side.value = details.firstHalfSide || "";
        kills.value = details.kills ?? "";
        deaths.value = details.deaths ?? "";
        assists.value = details.assists ?? "";
        rank.value = details.rank || "";

        const rankMatch = (details.rank || "").match(
          /^(Iron|Bronze|Silver|Gold|Platinum|Diamond|Ascendant|Immortal) ([123])$/,
        );

        if (rankMatch) {
          rank.value = rankMatch[1];
          rankTier.value = rankMatch[2];
        }

        rankTier.hidden = !rank.value || rank.value === "Radiant";

        comment.value = details.generalComment || "";

        let saveTimer = null;

        function updateRankTierVisibility() {
          rankTier.hidden = !rank.value || rank.value === "Radiant";
        }
        rank.addEventListener("change", updateRankTierVisibility);

        async function saveHistoryDetails() {
          saveStatus.textContent = "Saving…";

          clearTimeout(saveTimer);

          saveTimer = setTimeout(async () => {
            await window.mainApp.updateClosedSessionDetails(id, {
              map: map.value,
              agent: agent.value,
              gameMode: mode.value,
              firstHalfSide: side.value,
              kills: kills.value,
              deaths: deaths.value,
              assists: assists.value,
              rank: !rank.value
                ? null
                : rank.value === "Radiant"
                  ? "Radiant"
                  : `${rank.value} ${rankTier.value}`,
              generalComment: comment.value,
            });

            saveStatus.textContent = "✓ Auto-saved";
          }, 400);
        }

        [map, agent, mode, side, kills, deaths, assists, rank, comment].forEach(
          (input) => {
            input.addEventListener("input", saveHistoryDetails);
            input.addEventListener("change", saveHistoryDetails);
          },
        );

        document
          .getElementById("session-editor-back")
          .addEventListener("click", () => {
            selectSession(id);
          });
      }

      async function selectSession(id) {
        const detailEl = document.getElementById("sess-detail");
        const session = await window.mainApp.getSession(id);

        if (!session) {
          detailEl.innerHTML =
            '<div id="sess-empty">Unable to load this session.</div>';
          return;
        }

        const details = await window.mainApp.getSessionDetails(id);

        const sessionDetails = details || {};

        const displayValue = (value) => {
          return value !== null && value !== undefined && value !== ""
            ? value
            : "Not set";
        };

        const displayKDA =
          sessionDetails.kills !== null &&
          sessionDetails.kills !== undefined &&
          sessionDetails.deaths !== null &&
          sessionDetails.deaths !== undefined &&
          sessionDetails.assists !== null &&
          sessionDetails.assists !== undefined
            ? `${sessionDetails.kills} / ${sessionDetails.deaths} / ${sessionDetails.assists}`
            : "Not set";

        const displaySide = sessionDetails.firstHalfSide
          ? sessionDetails.firstHalfSide.toLowerCase() === "attack"
            ? "Attack"
            : sessionDetails.firstHalfSide.toLowerCase() === "defense"
              ? "Defense"
              : sessionDetails.firstHalfSide
          : "Not set";

        const rounds = Object.entries(session.rounds || {})
          .map(([number, round]) => ({
            number: Number(number),
            ...round,
          }))
          .sort((a, b) => a.number - b.number);

        const notesCount = rounds.filter((r) => r.note && r.note.trim()).length;

        const score = rounds.reduce(
          (acc, round) => {
            if (round.outcome === "won") acc.won++;
            if (round.outcome === "lost") acc.lost++;
            return acc;
          },
          { won: 0, lost: 0 },
        );

        const started = session.startedAt
          ? new Date(session.startedAt).toLocaleString()
          : "Unknown";

        const ended = session.endedAt
          ? new Date(session.endedAt).toLocaleString()
          : "Active";

        detailEl.innerHTML = `
    <div class="session-detail-inner">

      <div class="session-detail-header">
        <div>
          <div class="section-label">VOD Review</div>
          <h2>Session</h2>
          <div class="session-detail-meta">
            ${started}
          </div>
        </div>

        <div class="session-detail-score">
          ${score.won}-${score.lost}
        </div>
      </div>

      <div class="session-detail-stats session-match-details">

        <div class="detail-stat">
          <span>MAP</span>
          <strong>${displayValue(sessionDetails.map)}</strong>
        </div>

        <div class="detail-stat">
          <span>AGENT</span>
          <strong>${displayValue(sessionDetails.agent)}</strong>
        </div>

        <div class="detail-stat">
          <span>MODE</span>
          <strong>${displayValue(sessionDetails.gameMode)}</strong>
        </div>

        <div class="detail-stat">
          <span>RANK</span>
          <strong>${displayValue(sessionDetails.rank)}</strong>
        </div>

        <div class="detail-stat">
          <span>K / D / A</span>
          <strong>${displayKDA}</strong>
        </div>

        <div class="detail-stat">
          <span>FIRST HALF</span>
          <strong>${displaySide}</strong>
        </div>

        <div class="detail-stat">
          <span>ROUNDS</span>
          <strong>${rounds.length}</strong>
        </div>

        <div class="detail-stat">
          <span>NOTES</span>
          <strong>${notesCount}</strong>
        </div>

      </div>

      ${
        sessionDetails.generalComment && sessionDetails.generalComment.trim()
          ? `
      <div class="session-general-comment">
        <div class="section-label">General Comment</div>
        <div class="session-general-comment-body">
          ${sessionDetails.generalComment}
        </div>
      </div>
    `
          : ""
      }

      <div class="round-review">
        <div class="section-label">Round-by-Round Review</div>

        ${
          rounds.length
            ? rounds
                .map(
                  (round) => `
              <article class="history-round">
                <div class="history-round-head">
                  <strong>R${round.number}</strong>
                  ${
                    round.outcome
                      ? `<span class="${round.outcome === "won" ? "win" : "loss"}">
                          ${round.outcome.toUpperCase()}
                        </span>`
                      : ""
                  }
                </div>

                <div class="history-round-note">
                  ${
                    round.note && round.note.trim()
                      ? round.note
                      : '<span class="muted">No note</span>'
                  }
                </div>
              </article>
            `,
                )
                .join("")
            : '<div class="muted">No rounds recorded.</div>'
        }

      </div>

    </div>
  `;
      }
      initSettingsForm({
        load: (cb) => {
          window.mainApp.getSettings().then(cb); // first paint
          window.mainApp.onSettingsPush(cb); // stay in sync if changed via the overlay
        },
        save: (data) => window.mainApp.saveSettings(data),
        close: null, // nothing to "close" -- this pane just stays open
        previewTheme: (theme) => window.mainApp.previewTheme(theme),
      });
    