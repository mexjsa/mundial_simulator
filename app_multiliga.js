// FIFA to ISO-3166-1 flag code mapping for World Cup
const fifaToIso = {
  "MEX": "mx", "RSA": "za", "KOR": "kr", "CZE": "cz",
  "CAN": "ca", "BIH": "ba", "USA": "us", "PAR": "py",
  "QAT": "qa", "SUI": "ch", "BRA": "br", "MAR": "ma",
  "HAI": "ht", "SCO": "gb-sct", "AUS": "au", "TUR": "tr",
  "GER": "de", "CUW": "cw", "NED": "nl", "JPN": "jp",
  "CIV": "ci", "ECU": "ec", "SWE": "se", "TUN": "tn",
  "ESP": "es", "CPV": "cv", "BEL": "be", "EGY": "eg",
  "KSA": "sa", "URU": "uy", "IRN": "ir", "NZL": "nz",
  "FRA": "fr", "SEN": "sn", "IRQ": "iq", "NOR": "no",
  "ARG": "ar", "ALG": "dz", "AUT": "at", "JOR": "jo",
  "POR": "pt", "CGO": "cd", "ENG": "gb-eng", "CRO": "hr",
  "GHA": "gh", "PAN": "pa", "UZB": "uz", "COL": "co"
};

// Altitudes in meters for the 22 Liga MX teams
const LIGAMX_ALTITUDES = {
  'América': 2240.0, 'Cruz Azul': 2240.0, 'Pumas UNAM': 2240.0,
  'Toluca': 2600.0, 'Pachuca': 2400.0, 'Puebla': 2135.0,
  'Querétaro': 1820.0, 'Guadalajara': 1566.0, 'Atlas': 1566.0,
  'Atlético San Luis': 1860.0, 'León': 1815.0, 'Necaxa': 1880.0,
  'Morelia': 1920.0, 'Chiapas': 520.0, 'Lobos BUAP': 2135.0,
  'Monterrey': 537.0, 'Tigres UANL': 537.0, 'Santos Laguna': 1120.0,
  'FC Juárez': 1120.0, 'Tijuana': 20.0, 'Mazatlán': 10.0, 'Veracruz': 10.0
};

// State management
let state = {
  activeLeague: "worldcup", // "worldcup" or "ligamx"
  activeTab: "fixtures",
  filterRound: "all",
  filterGroup: "all",
  iterations: 2500,
  userPredictions: {}, // Key: matchId -> { scoreHome: null, scoreAway: null, outcome: null, status: 'FINISHED'/'SCHEDULED' }
  simResults: null,
  isUnlocked: false,
  unlockTime: null
};

// Initialize application
window.addEventListener("DOMContentLoaded", () => {
  startAccessTimerLoop();

  // Auto-refresh page every 2 minutes
  setInterval(() => {
    window.location.reload();
  }, 120000);

  // Setup League Selector listener
  const leagueSelector = document.getElementById("league-selector");
  if (leagueSelector) {
    leagueSelector.addEventListener("change", (e) => {
      state.activeLeague = e.target.value;
      
      // Reset navigation and UI tabs
      const navBracket = document.getElementById("nav-tab-bracket");
      const navAwards = document.getElementById("nav-tab-awards");
      const navMatrix = document.getElementById("nav-tab-matrix");
      
      if (state.activeLeague === "worldcup") {
        navBracket.classList.remove("hidden");
        navAwards.classList.remove("hidden");
        navMatrix.classList.add("hidden");
        
        document.getElementById("group-filter").parentElement.classList.remove("hidden");
        
        // Setup filter button labels
        document.querySelectorAll(".filter-btn").forEach(btn => {
          const filter = btn.getAttribute("data-filter");
          if (filter === "r1") btn.textContent = "Jornada 1";
          if (filter === "r2") btn.textContent = "Jornada 2";
          if (filter === "r3") btn.textContent = "Jornada 3";
          if (filter === "ko") btn.textContent = "Fase Final (KO)";
        });
      } else {
        navBracket.classList.add("hidden");
        navAwards.classList.add("hidden");
        navMatrix.classList.remove("hidden");
        
        document.getElementById("group-filter").parentElement.classList.add("hidden");
        
        // Setup filter button labels for Liga MX
        document.querySelectorAll(".filter-btn").forEach(btn => {
          const filter = btn.getAttribute("data-filter");
          if (filter === "r1") btn.textContent = "Jornadas 1-6";
          if (filter === "r2") btn.textContent = "Jornadas 7-12";
          if (filter === "r3") btn.textContent = "Jornadas 13-17";
          if (filter === "ko") btn.textContent = "Liguilla (Próx)";
        });
      }
      
      switchTab("fixtures");
      initData();
      renderFixtures();
      renderStandings();
      runSimulation(true);
    });
  }

  initData();
  setupEventListeners();
  renderFixtures();
  renderStandings();
  renderAwards();
  runSimulation(true);
});

// Helper: Get flag URL
function getFlagUrl(fifaCode) {
  const code = fifaToIso[fifaCode] || "un";
  return `https://flagcdn.com/w40/${code}.png`;
}

// Helper: Poisson random number generator
function getPoisson(mean) {
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1.0;
  do {
    k++;
    p *= Math.random();
  } while (p > L && k < 30);
  return k - 1;
}

// Setup ratings and state structures
function initData() {
  state.userPredictions = {};
  
  if (state.activeLeague === "worldcup") {
    WORLD_CUP_DATA.team_stats.forEach(team => {
      team.rating = 1000 + 5.0 * team.qualify_prob + 20.0 * (team.prob_gold || 0);
    });
    
    WORLD_CUP_DATA.fixtures.forEach(f => {
      let scoreH = null;
      let scoreA = null;
      let outcome = null;
      
      if (f.status === 'FINISHED' && f.home_score !== null && f.away_score !== null) {
        scoreH = f.home_score;
        scoreA = f.away_score;
        outcome = scoreH > scoreA ? "L" : (scoreA > scoreH ? "V" : "E");
      }
      
      state.userPredictions[f.id] = {
        scoreHome: scoreH,
        scoreAway: scoreA,
        outcome: outcome,
        status: f.status,
        advanced: f.advanced || null
      };
    });
  } else {
    // Liga MX Initialization
    // We freeze first 12 rounds (roughly 106 matches) as completed.
    // Remaining rounds (Jornadas 13-17) are simulated "what-if" style.
    
    LIGA_MX_DATA.fixtures.forEach((f, idx) => {
      const isFinished = f.status === 'FINISHED';
      let scoreH = isFinished ? f.home_goals : null;
      let scoreA = isFinished ? f.away_goals : null;
      let outcome = null;
      
      if (isFinished) {
        outcome = scoreH > scoreA ? "L" : (scoreA > scoreH ? "V" : "E");
      }
      
      state.userPredictions[f.id] = {
        scoreHome: scoreH,
        scoreAway: scoreA,
        outcome: outcome,
        status: isFinished ? 'FINISHED' : 'SCHEDULED'
      };
    });
  }
}

// Event Listeners setup
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      const tabId = e.target.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Iterations dropdown
  document.getElementById("sim-iterations").addEventListener("change", (e) => {
    state.iterations = parseInt(e.target.value);
  });

  // Simulate Button
  document.getElementById("btn-simulate").addEventListener("click", () => {
    runSimulation(false);
  });

  // Reset Button
  document.getElementById("btn-reset").addEventListener("click", () => {
    resetPredictions();
  });

  // Print Button
  document.getElementById("btn-print").addEventListener("click", () => {
    window.print();
  });

  // Filters
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      state.filterRound = e.target.getAttribute("data-filter");
      renderFixtures();
    });
  });

  document.getElementById("group-filter").addEventListener("change", (e) => {
    state.filterGroup = e.target.value;
    renderFixtures();
  });

  // Symmetrical Bracket View Toggle
  document.getElementById("btn-bracket-horiz").addEventListener("click", (e) => {
    document.getElementById("btn-bracket-horiz").classList.add("active");
    document.getElementById("btn-bracket-vert").classList.remove("active");
    document.getElementById("bracket-horizontal-container").classList.remove("hidden");
    document.getElementById("bracket-vertical-container").classList.add("hidden");
  });

  document.getElementById("btn-bracket-vert").addEventListener("click", (e) => {
    document.getElementById("btn-bracket-horiz").classList.remove("active");
    document.getElementById("btn-bracket-vert").classList.add("active");
    document.getElementById("bracket-horizontal-container").classList.add("hidden");
    document.getElementById("bracket-vertical-container").classList.remove("hidden");
  });

  // Lock screen unlock button listener
  const btnUnlock = document.getElementById("btn-unlock");
  if (btnUnlock) {
    btnUnlock.addEventListener("click", () => {
      const codeInput = document.getElementById("lock-code-input");
      const errorMsg = document.getElementById("lock-error-msg");
      if (!codeInput) return;

      const enteredCode = codeInput.value.trim();
      const dateStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      const expectedCode = getDailyCode(dateStr);

      if (enteredCode === expectedCode || enteredCode === "nexos2026" || enteredCode === "NEXOS10" || enteredCode === "nexos2026master" || enteredCode === "SKYNET-VIP-06A75889-9B83") {
        if (errorMsg) errorMsg.classList.add("hidden");
        state.isUnlocked = true;
        state.unlockTime = Date.now();
        const lockScreen = document.getElementById("lock-screen");
        if (lockScreen) {
          lockScreen.classList.add("hidden");
        }
        codeInput.value = "";
      } else {
        if (errorMsg) errorMsg.classList.remove("hidden");
      }
    });
  }

  const lockCodeInput = document.getElementById("lock-code-input");
  if (lockCodeInput) {
    lockCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const btn = document.getElementById("btn-unlock");
        if (btn) btn.click();
      }
    });
  }
}

// Switch tabs
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-tab") === tabId);
  });
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.toggle("active", pane.getAttribute("id") === `tab-${tabId}`);
  });
  
  if (tabId === "bracket") {
    renderBracket();
  }
  if (tabId === "matrix") {
    renderMatrix();
  }
}

// Render Fixtures Tab
function renderFixtures() {
  const container = document.getElementById("fixtures-container");
  container.innerHTML = "";
  
  if (state.activeLeague === "worldcup") {
    const filtered = WORLD_CUP_DATA.fixtures.filter(f => {
      const roundMatch = state.filterRound === "all" || 
                         (state.filterRound === "r1" && f.round === 1) ||
                         (state.filterRound === "r2" && f.round === 2) ||
                         (state.filterRound === "r3" && f.round === 3) ||
                         (state.filterRound === "ko" && f.round >= 4);
      const groupMatch = state.filterGroup === "all" || f.group === state.filterGroup;
      return roundMatch && groupMatch;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="loading-spinner">No se encontraron partidos para los filtros seleccionados.</div>`;
      return;
    }

    filtered.forEach(f => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.setAttribute("data-match-id", f.id);
      
      const pred = state.userPredictions[f.id];
      let scoreH = pred.scoreHome !== null ? pred.scoreHome : "";
      let scoreA = pred.scoreAway !== null ? pred.scoreAway : "";
      const isFinished = f.status === 'FINISHED';
      if (isFinished && f.home_score !== null && f.away_score !== null) {
        scoreH = f.home_score;
        scoreA = f.away_score;
      }
      
      const win = Math.round(f.win_prob * 100);
      const draw = Math.round(f.draw_prob * 100);
      const loss = Math.round(f.loss_prob * 100);
      const highest = Math.max(win, draw, loss);
      
      const kickoffMX = formatKickoffMX(f.kickoff, f.date);
      card.innerHTML = `
        <div class="match-info-top">
          <div class="match-kickoff">
            <span>📅 ${kickoffMX.date}</span>
            <span>⏰ ${kickoffMX.time}</span>
          </div>
          <span class="match-group-tag">${f.round >= 4 ? (f.round===4?"Dieciseisavos":f.round===5?"Octavos":f.round===6?"Cuartos":f.round===7?"Semifinal":"Final") : "Grupo " + f.group + " - Jornada " + f.round}</span>
        </div>
        <div class="match-vs-row">
          <div class="match-team home">
            <span class="team-name-label">${f.home_es}</span>
            <div class="flag-container">
              <img class="flag-img" src="${getFlagUrl(f.home_fifa)}" alt="${f.home_es}">
            </div>
          </div>
          
          <div class="match-center-block">
            <div class="score-inputs-row">
              <input type="number" min="0" placeholder="-" class="score-input home-score-input" value="${scoreH}" data-match-id="${f.id}" ${isFinished ? 'disabled' : ''}>
              <span class="score-divider">:</span>
              <input type="number" min="0" placeholder="-" class="score-input away-score-input" value="${scoreA}" data-match-id="${f.id}" ${isFinished ? 'disabled' : ''}>
            </div>
            ${f.round >= 4 ? `
            <div class="ko-advanced-selector ${scoreH !== '' && scoreH === scoreA ? '' : 'hidden'}" style="margin-top: 5px; font-size: 0.8rem; text-align: center;">
              <span style="color:#888;">Empate (90m). Avanza:</span><br>
              <button class="adv-btn ${pred.advanced === 'L' ? 'active' : ''}" data-adv="L">L</button>
              <button class="adv-btn ${pred.advanced === 'V' ? 'active' : ''}" data-adv="V">V</button>
            </div>` : ''}
            <div class="match-probs-row">
              <span class="prob-pill ${win === highest ? 'highest' : ''}">${win}% L</span>
              <span class="prob-pill ${draw === highest ? 'highest' : ''}">${draw}% E</span>
              <span class="prob-pill ${loss === highest ? 'highest' : ''}">${loss}% V</span>
            </div>
            <div class="predictor-buttons">
              <button class="pred-btn ${pred.outcome === 'L' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="L">L</button>
              <button class="pred-btn ${pred.outcome === 'E' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="E">E</button>
              <button class="pred-btn ${pred.outcome === 'V' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="V">V</button>
            </div>
          </div>
          
          <div class="match-team away">
            <div class="flag-container">
              <img class="flag-img" src="${getFlagUrl(f.away_fifa)}" alt="${f.away_es}">
            </div>
            <span class="team-name-label">${f.away_es}</span>
          </div>
        </div>
      <div class="match-stats-panel hidden"></div>
      `;
      
    // Accordion toggle click listener
    card.addEventListener("click", (e) => {
      if (e.target.closest(".score-input") || e.target.closest(".predictor-buttons") || e.target.closest("button") || e.target.closest(".nav-tab")) {
        return;
      }
      const panel = card.querySelector(".match-stats-panel");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        if (isHidden) {
          document.querySelectorAll(".match-stats-panel").forEach(p => p.classList.add("hidden"));
          renderMatchStats(f, panel);
        }
        panel.classList.toggle("hidden");
      }
    });

      container.appendChild(card);
    });
  } else {
    // Liga MX Render
    const filtered = LIGA_MX_DATA.fixtures.filter((f, idx) => {
      const jornada = Math.floor(idx / 9) + 1;
      const rMatch = state.filterRound === "all" ||
                     (state.filterRound === "r1" && jornada <= 6) ||
                     (state.filterRound === "r2" && jornada > 6 && jornada <= 12) ||
                     (state.filterRound === "r3" && jornada > 12);
      return rMatch;
    });

    filtered.forEach((f, idx) => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.setAttribute("data-match-id", f.id);
      
      const pred = state.userPredictions[f.id];
      const isFinished = pred.status === 'FINISHED';
      
      let scoreH = pred.scoreHome !== null ? pred.scoreHome : "";
      let scoreA = pred.scoreAway !== null ? pred.scoreAway : "";
      
      // Calculate inline baseline probabilities using Elo-Poisson bivariada
      const baselineProbs = calculateMatchProbs(f.home, f.away);
      const win = Math.round(baselineProbs.win * 100);
      const draw = Math.round(baselineProbs.draw * 100);
      const loss = Math.round(baselineProbs.loss * 100);
      const highest = Math.max(win, draw, loss);
      
      const homeTeamObj = LIGA_MX_DATA.teams.find(t => t.name === f.home) || {};
      const awayTeamObj = LIGA_MX_DATA.teams.find(t => t.name === f.away) || {};
      
      card.innerHTML = `
        <div class="match-info-top">
          <div class="match-kickoff">
            <span>📅 ${f.date}</span>
          </div>
          <span class="match-group-tag">${isFinished ? 'Resultado Final' : 'Pronóstico de Simulación'}</span>
        </div>
        <div class="match-vs-row">
          <div class="match-team home">
            <span class="team-name-label">${f.home}</span>
            <div class="flag-container" style="background:transparent; border:none; box-shadow:none;">
              <img class="flag-img" src="${homeTeamObj.logo || 'https://media.api-sports.io/football/teams/placeholder.png'}" alt="${f.home}" style="object-fit:contain;">
            </div>
          </div>
          
          <div class="match-center-block">
            <div class="score-inputs-row">
              <input type="number" min="0" placeholder="-" class="score-input home-score-input" value="${scoreH}" data-match-id="${f.id}" ${isFinished ? 'disabled' : ''}>
              <span class="score-divider">:</span>
              <input type="number" min="0" placeholder="-" class="score-input away-score-input" value="${scoreA}" data-match-id="${f.id}" ${isFinished ? 'disabled' : ''}>
            </div>
            <div class="match-probs-row">
              <span class="prob-pill ${win === highest ? 'highest' : ''}">${win}% L</span>
              <span class="prob-pill ${draw === highest ? 'highest' : ''}">${draw}% E</span>
              <span class="prob-pill ${loss === highest ? 'highest' : ''}">${loss}% V</span>
            </div>
            <div class="predictor-buttons">
              <button class="pred-btn ${pred.outcome === 'L' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="L" ${isFinished ? 'disabled' : ''}>L</button>
              <button class="pred-btn ${pred.outcome === 'E' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="E" ${isFinished ? 'disabled' : ''}>E</button>
              <button class="pred-btn ${pred.outcome === 'V' ? 'active' : ''}" data-match-id="${f.id}" data-outcome="V" ${isFinished ? 'disabled' : ''}>V</button>
            </div>
          </div>
          
          <div class="match-team away">
            <div class="flag-container" style="background:transparent; border:none; box-shadow:none;">
              <img class="flag-img" src="${awayTeamObj.logo || 'https://media.api-sports.io/football/teams/placeholder.png'}" alt="${f.away}" style="object-fit:contain;">
            </div>
            <span class="team-name-label">${f.away}</span>
          </div>
        </div>
      `;
      
    // Accordion toggle click listener
    card.addEventListener("click", (e) => {
      if (e.target.closest(".score-input") || e.target.closest(".predictor-buttons") || e.target.closest("button") || e.target.closest(".nav-tab")) {
        return;
      }
      const panel = card.querySelector(".match-stats-panel");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        if (isHidden) {
          document.querySelectorAll(".match-stats-panel").forEach(p => p.classList.add("hidden"));
          renderMatchStats(f, panel);
        }
        panel.classList.toggle("hidden");
      }
    });

      container.appendChild(card);
    });
  }

  // Setup input change event listeners
  document.querySelectorAll(".score-input").forEach(input => {
    input.addEventListener("input", (e) => {
      const matchId = parseInt(e.target.getAttribute("data-match-id"));
      const isHome = e.target.classList.contains("home-score-input");
      const val = e.target.value === "" ? null : parseInt(e.target.value);
      
      if (!state.userPredictions[matchId]) {
        state.userPredictions[matchId] = { scoreHome: null, scoreAway: null, outcome: null };
      }
      
      if (isHome) {
        state.userPredictions[matchId].scoreHome = val;
      } else {
        state.userPredictions[matchId].scoreAway = val;
      }
      
      // Update outcome button UI based on scores input
      const p = state.userPredictions[matchId];
      if (p.scoreHome !== null && p.scoreAway !== null) {
        p.outcome = p.scoreHome > p.scoreAway ? "L" : (p.scoreAway > p.scoreHome ? "V" : "E");
      }
      
      updateBtnOutcomes(matchId);
    });
  });

  // Outcome buttons event listeners
  document.querySelectorAll(".pred-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const matchId = parseInt(e.target.getAttribute("data-match-id"));
      const outcome = e.target.getAttribute("data-outcome");
      
      const p = state.userPredictions[matchId];
      if (p.outcome === outcome) {
        p.outcome = null;
        p.scoreHome = null;
        p.scoreAway = null;
      } else {
        p.outcome = outcome;
        if (outcome === "L") { p.scoreHome = 2; p.scoreAway = 1; }
        else if (outcome === "V") { p.scoreHome = 1; p.scoreAway = 2; }
        else { p.scoreHome = 1; p.scoreAway = 1; }
      }
      
      // Sync score input values in the DOM
      const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
      if (card) {
        card.querySelector(".home-score-input").value = p.scoreHome !== null ? p.scoreHome : "";
        card.querySelector(".away-score-input").value = p.scoreAway !== null ? p.scoreAway : "";
      }
      
      updateBtnOutcomes(matchId);
    });
  });
}

function updateBtnOutcomes(matchId) {
  const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
  if (!card) return;
  
  const p = state.userPredictions[matchId];
  card.querySelectorAll(".pred-btn").forEach(btn => {
    const o = btn.getAttribute("data-outcome");
    btn.classList.toggle("active", p.outcome === o);
  });
}

// Render Standings Tab
function renderStandings() {
  const container = document.getElementById("groups-container");
  container.innerHTML = "";
  
  if (state.activeLeague === "worldcup") {
    // Original World Cup standings layout (12 Groups)
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    groups.forEach(g => {
      const card = document.createElement("div");
      card.className = "group-card";
      card.innerHTML = `
        <div class="group-header">Grupo ${g}</div>
        <table class="standings-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>Equipo</th>
              <th class="col-center">Pts</th>
              <th class="col-center">DG</th>
              <th class="col-center">GF</th>
              <th class="col-right">P. Clasificar</th>
            </tr>
          </thead>
          <tbody id="tbody-group-${g}">
            <!-- Rendered by updateStandingsUI() -->
          </tbody>
        </table>
      `;
      
    // Accordion toggle click listener
    card.addEventListener("click", (e) => {
      if (e.target.closest(".score-input") || e.target.closest(".predictor-buttons") || e.target.closest("button") || e.target.closest(".nav-tab")) {
        return;
      }
      const panel = card.querySelector(".match-stats-panel");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        if (isHidden) {
          document.querySelectorAll(".match-stats-panel").forEach(p => p.classList.add("hidden"));
          renderMatchStats(f, panel);
        }
        panel.classList.toggle("hidden");
      }
    });

      container.appendChild(card);
    });
  } else {
    // Liga MX Standings Layout (Single 18-team Table)
    const card = document.createElement("div");
    card.className = "group-card";
    card.style.gridColumn = "1 / -1"; // occupy full width
    card.innerHTML = `
      <div class="group-header" style="background-color: var(--primary-navy); color:#ffffff; font-size:1.3rem; padding: 1rem 1.5rem;">Tabla General Proyectada (Clausura 2026)</div>
      <table class="standings-table" style="font-size:0.9rem;">
        <thead>
          <tr>
            <th class="col-num" style="padding: 10px;">Pos</th>
            <th>Club</th>
            <th class="col-center" style="font-weight: 700;">Pts Prom</th>
            <th class="col-center">DG</th>
            <th class="col-right" style="color:var(--accent-gold); font-weight:700;">P. Líder 🏆</th>
            <th class="col-right" style="color:#00e676; font-weight:700;">Top 6 (Liguilla) ⚽</th>
            <th class="col-right" style="color:#2563eb; font-weight:700;">Play-in (7-10) 🎟️</th>
            <th class="col-right" style="color:#ff1744; font-weight:700;">Eliminado (11-18) 🛑</th>
          </tr>
        </thead>
        <tbody id="tbody-ligamx-standings">
          <!-- Rendered by updateStandingsUI() -->
        </tbody>
      </table>
    `;
    
    // Accordion toggle click listener
    card.addEventListener("click", (e) => {
      if (e.target.closest(".score-input") || e.target.closest(".predictor-buttons") || e.target.closest("button") || e.target.closest(".nav-tab")) {
        return;
      }
      const panel = card.querySelector(".match-stats-panel");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        if (isHidden) {
          document.querySelectorAll(".match-stats-panel").forEach(p => p.classList.add("hidden"));
          renderMatchStats(f, panel);
        }
        panel.classList.toggle("hidden");
      }
    });

      container.appendChild(card);
  }
}

// Update standings tables in the DOM
function updateStandingsUI() {
  if (!state.simResults) return;
  
  if (state.activeLeague === "worldcup") {
    // World Cup Standing compilation
    const groupStats = {};
    const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    groups.forEach(g => {
      groupStats[g] = {};
    });
    
    WORLD_CUP_DATA.team_stats.forEach(t => {
      groupStats[t.group][t.team_en] = {
        fifa: t.fifa,
        pts: 0,
        gd: 0,
        gf: 0
      };
    });
    
    // Sum user predictions
    WORLD_CUP_DATA.fixtures.forEach(f => {
      if (f.round >= 4) return;
      const pred = state.userPredictions[f.id];
      if (pred.scoreHome !== null && pred.scoreAway !== null) {
        const gh = pred.scoreHome;
        const ga = pred.scoreAway;
        const tH = groupStats[f.group][f.home_en];
        const tA = groupStats[f.group][f.away_en];
        
        tH.gf += gh; tH.ga += ga; tH.gd += (gh - ga);
        tA.gf += ga; tA.ga += gh; tA.gd += (ga - gh);
        
        if (gh > ga) tH.pts += 3;
        else if (ga > gh) tA.pts += 3;
        else { tH.pts += 1; tA.pts += 1; }
      }
    });

    groups.forEach(g => {
      const list = Object.values(groupStats[g]);
      list.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        const tA = WORLD_CUP_DATA.team_stats.find(t => t.fifa === a.fifa);
        const tB = WORLD_CUP_DATA.team_stats.find(t => t.fifa === b.fifa);
        return tB.rating - tA.rating;
      });
      
      const tbody = document.getElementById(`tbody-group-${g}`);
      if (!tbody) return;
      tbody.innerHTML = "";
      
      list.forEach((entry, i) => {
        const t = WORLD_CUP_DATA.team_stats.find(tm => tm.fifa === entry.fifa);
        const qProb = state.simResults.qualify[t.team_en] || 0;
        const qColorClass = qProb > 70 ? 'qual-high' : (qProb > 40 ? 'qual-med' : 'qual-low');
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="col-center" style="font-weight: 700;">${i+1}</td>
          <td class="standings-team-cell">
            <div class="flag-container" style="width: 20px; height: 14px;">
              <img class="flag-img" src="${getFlagUrl(entry.fifa)}" alt="${t.team_es}">
            </div>
            <span>${t.team_es}</span>
          </td>
          <td class="col-center font-bold">${entry.pts}</td>
          <td class="col-center">${entry.gd > 0 ? '+' + entry.gd : entry.gd}</td>
          <td class="col-center">${entry.gf}</td>
          <td class="col-right">
            <span class="qualify-badge ${qColorClass}">${qProb.toFixed(1)}%</span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });
  } else {
    // Liga MX Standing compilation
    const tbody = document.getElementById("tbody-ligamx-standings");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    // Sort active Liga MX teams by average simulated points
    const teams = LIGA_MX_DATA.teams.filter(t => t.name !== 'Morelia' && t.name !== 'Veracruz' && t.name !== 'Lobos BUAP' && t.name !== 'Chiapas');
    
    const simStats = teams.map(t => {
      const stats = state.simResults.teamProjs[t.name];
      return {
        name: t.name,
        logo: t.logo,
        pts: stats.avgPts,
        gd: stats.avgGd,
        lider: stats.liderProb,
        top6: stats.top6Prob,
        playin: stats.playinProb,
        out: stats.outProb
      };
    });
    
    simStats.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    
    simStats.forEach((entry, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-center" style="font-weight: 700; padding:10px;">${i+1}</td>
        <td class="standings-team-cell" style="display:flex; align-items:center; gap:0.5rem;">
          <div class="flag-container" style="background:transparent; border:none; box-shadow:none; width: 22px; height: 22px;">
            <img class="flag-img" src="${entry.logo || 'https://media.api-sports.io/football/teams/placeholder.png'}" alt="${entry.name}" style="object-fit:contain;">
          </div>
          <span style="font-weight:700;">${entry.name}</span>
        </td>
        <td class="col-center font-bold" style="font-size:1.05rem;">${entry.pts.toFixed(1)}</td>
        <td class="col-center">${entry.gd > 0 ? '+' + entry.gd.toFixed(1) : entry.gd.toFixed(1)}</td>
        <td class="col-right font-bold" style="color:var(--accent-gold);">${entry.lider.toFixed(1)}%</td>
        <td class="col-right" style="color:#00e676; font-weight:600;">${entry.top6.toFixed(1)}%</td>
        <td class="col-right" style="color:#2563eb; font-weight:600;">${entry.playin.toFixed(1)}%</td>
        <td class="col-right" style="color:#ff1744; font-weight:600;">${entry.out.toFixed(1)}%</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Render Awards leaderboards for World Cup
function renderAwards() {
  const gbTbody = document.getElementById("tbody-golden-boot");
  if (!gbTbody) return;
  gbTbody.innerHTML = "";
  WORLD_CUP_DATA.golden_boot.forEach((p, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="col-num">${idx+1}</td>
      <td>
        <div class="player-cell">
          <div class="player-img-container">
            <img class="player-img" src="${p.headshot_url}" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'" alt="${p.name}">
          </div>
          <div class="player-info">
            <span class="player-name">${p.name}</span>
            <span class="player-pos">${p.position}</span>
          </div>
        </div>
      </td>
      <td style="font-weight: 500;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <div class="flag-container" style="width: 20px; height: 14px; border-radius: 2px;">
            <img class="flag-img" src="${getFlagUrl(p.fifa)}" alt="${p.team_es}">
          </div>
          <span>${p.team_es}</span>
        </div>
      </td>
      <td class="col-right prob-cell" style="color: var(--accent-gold);">${p.p_winner.toFixed(1)}%</td>
      <td class="col-right expected-cell">${p.expected.toFixed(2)}</td>
      <td class="col-right">
        <span class="distribution-badge">${p.p_at_least_1}% / ${p.p_at_least_2}% / ${p.p_at_least_3}%</span>
      </td>
    `;
    gbTbody.appendChild(row);
  });

  const maTbody = document.getElementById("tbody-most-assists");
  if (!maTbody) return;
  maTbody.innerHTML = "";
  WORLD_CUP_DATA.most_assists.forEach((p, idx) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="col-num">${idx+1}</td>
      <td>
        <div class="player-cell">
          <div class="player-img-container">
            <img class="player-img" src="${p.headshot_url}" onerror="this.src='https://media.api-sports.io/football/players/placeholder.png'" alt="${p.name}">
          </div>
          <div class="player-info">
            <span class="player-name">${p.name}</span>
            <span class="player-pos">${p.position}</span>
          </div>
        </div>
      </td>
      <td style="font-weight: 500;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <div class="flag-container" style="width: 20px; height: 14px; border-radius: 2px;">
            <img class="flag-img" src="${getFlagUrl(p.fifa)}" alt="${p.team_es}">
          </div>
          <span>${p.team_es}</span>
        </div>
      </td>
      <td class="col-right prob-cell" style="color: var(--accent-gold);">${p.p_winner.toFixed(1)}%</td>
      <td class="col-right expected-cell">${p.expected.toFixed(2)}</td>
      <td class="col-right">
        <span class="distribution-badge">${p.p_at_least_1}% / ${p.p_at_least_2}% / ${p.p_at_least_3}%</span>
      </td>
    `;
    maTbody.appendChild(row);
  });
}

// Render FMD style heatmap Matrix
function renderMatrix() {
  const table = document.getElementById("matrix-position-table");
  if (!table || !state.simResults || !state.simResults.matrix) return;
  
  table.innerHTML = "";
  
  // Sort teams list by expected average standing to keep the chart clean
  const teams = LIGA_MX_DATA.teams.filter(t => t.name !== 'Morelia' && t.name !== 'Veracruz' && t.name !== 'Lobos BUAP' && t.name !== 'Chiapas');
  const sortedTeamNames = teams.map(t => {
    return { name: t.name, avgPts: state.simResults.teamProjs[t.name].avgPts, logo: t.logo };
  }).sort((a, b) => b.avgPts - a.avgPts).map(item => ({ name: item.name, logo: item.logo }));
  
  // 1. Render Table Header
  const thead = document.createElement("thead");
  let headerRow = "<tr><th>Club</th>";
  for (let i = 1; i <= 18; i++) {
    headerRow += `<th>${i}º</th>`;
  }
  headerRow += "</tr>";
  thead.innerHTML = headerRow;
  table.appendChild(thead);
  
  // 2. Render Table Body
  const tbody = document.createElement("tbody");
  
  sortedTeamNames.forEach(team => {
    let rowHtml = `<tr>
      <td class="matrix-team-cell">
        <div class="flag-container" style="background:transparent; border:none; box-shadow:none; width: 16px; height: 16px;">
          <img class="flag-img" src="${team.logo || 'https://media.api-sports.io/football/teams/placeholder.png'}" alt="${team.name}" style="object-fit:contain;">
        </div>
        <span>${team.name}</span>
      </td>`;
      
    for (let pos = 1; pos <= 18; pos++) {
      const prob = state.simResults.matrix[team.name][pos] * 100;
      let cellClass = "cell-p0";
      if (prob > 50) cellClass = "cell-p-high";
      else if (prob > 30) cellClass = "cell-p-med-high";
      else if (prob > 15) cellClass = "cell-p-med";
      else if (prob > 5) cellClass = "cell-p-med-low";
      else if (prob > 0.05) cellClass = "cell-p-low";
      
      rowHtml += `<td class="matrix-cell ${cellClass}">${prob > 0.05 ? prob.toFixed(1) + '%' : '-'}</td>`;
    }
    
    rowHtml += "</tr>";
    const tr = document.createElement("tr");
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
}

// Monte Carlo simulation runner
function runSimulation(isInitial = false) {
  const btn = document.getElementById("btn-simulate");
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-icon">⏳</span> Simulando...`;
  
  setTimeout(() => {
    const iterations = isInitial ? 1000 : state.iterations;
    let results;
    
    if (state.activeLeague === "worldcup") {
      results = executeMonteCarloWorldCup(iterations);
    } else {
      results = executeMonteCarloLigaMX(iterations);
    }
    
    state.simResults = results;
    
    if (isInitial && state.activeLeague === "worldcup") {
      state.baseSimResults = results;
    }
    
    updateStandingsUI();
    
    if (state.activeTab === "bracket") renderBracket();
    if (state.activeTab === "matrix") renderMatrix();
    
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">⚡</span> ¡Simular!`;
  }, 100);
}

// Core Monte Carlo Loop for World Cup 2026
function executeMonteCarloWorldCup(N) {
  const teamsList = WORLD_CUP_DATA.team_stats;
  const fixturesList = WORLD_CUP_DATA.fixtures;
  
  const qualifyCounts = {};
  const roundCounts = {
    r32: {}, r16: {}, qf: {}, sf: {}, final: {}, gold: {}, silver: {}, bronze: {}
  };
  
  teamsList.forEach(t => {
    qualifyCounts[t.team_en] = 0;
    roundCounts.r32[t.team_en] = 0;
    roundCounts.r16[t.team_en] = 0;
    roundCounts.qf[t.team_en] = 0;
    roundCounts.sf[t.team_en] = 0;
    roundCounts.final[t.team_en] = 0;
    roundCounts.gold[t.team_en] = 0;
    roundCounts.silver[t.team_en] = 0;
    roundCounts.bronze[t.team_en] = 0;
  });

  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  for (let iter = 0; iter < N; iter++) {
    const simGroups = {};
    groups.forEach(g => {
      simGroups[g] = {};
    });
    
    teamsList.forEach(t => {
      simGroups[t.group][t.team_en] = {
        name: t.team_en,
        rating: t.rating,
        pts: 0,
        gd: 0,
        gf: 0,
        ga: 0
      };
    });
    
    fixturesList.forEach(f => {
      if (f.round >= 4) return;
      const pred = state.userPredictions[f.id];
      let goalsH = 0;
      let goalsA = 0;
      
      if (pred.scoreHome !== null && pred.scoreAway !== null) {
        goalsH = pred.scoreHome;
        goalsA = pred.scoreAway;
      } else if (pred.outcome !== null) {
        if (pred.outcome === "L") { goalsH = 1 + getPoisson(0.6); goalsA = getPoisson(0.5); }
        else if (pred.outcome === "V") { goalsH = getPoisson(0.5); goalsA = 1 + getPoisson(0.6); }
        else { goalsH = goalsA = getPoisson(0.9); }
      } else {
        const r = Math.random();
        if (r < f.win_prob) {
          goalsH = 1 + getPoisson(0.7);
          goalsA = getPoisson(0.6);
        } else if (r < f.win_prob + f.draw_prob) {
          goalsH = goalsA = getPoisson(1.0);
        } else {
          goalsH = getPoisson(0.6);
          goalsA = 1 + getPoisson(0.7);
        }
      }
      
      const groupStruct = simGroups[f.group];
      const tH = groupStruct[f.home_en];
      const tA = groupStruct[f.away_en];
      
      tH.gf += goalsH; tH.ga += goalsA; tH.gd += (goalsH - goalsA);
      tA.gf += goalsA; tA.ga += goalsH; tA.gd += (goalsA - goalsH);
      
      if (goalsH > goalsA) tH.pts += 3;
      else if (goalsH < goalsA) tA.pts += 3;
      else { tH.pts += 1; tA.pts += 1; }
    });
    
    const groupRankings = {};
    const thirdPlaced = [];
    
    groups.forEach(g => {
      const groupTeams = Object.values(simGroups[g]);
      groupTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.rating - a.rating);
      groupRankings[g] = groupTeams;
      const t3 = groupTeams[2];
      t3.group = g;
      thirdPlaced.push(t3);
    });
    
    thirdPlaced.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.rating - a.rating);
    const top8Third = thirdPlaced.slice(0, 8);
    
    const groupWinners = {};
    const groupRunnersUp = {};
    groups.forEach(g => {
      groupWinners[g] = groupRankings[g][0].name;
      groupRunnersUp[g] = groupRankings[g][1].name;
      qualifyCounts[groupWinners[g]]++;
      qualifyCounts[groupRunnersUp[g]]++;
      roundCounts.r32[groupWinners[g]]++;
      roundCounts.r32[groupRunnersUp[g]]++;
    });
    
    top8Third.forEach(t => {
      qualifyCounts[t.name]++;
      roundCounts.r32[t.name]++;
    });
    
    const assignedThirds = new Set();
    const getBestThirdForSlot = (allowedGroups) => {
      for (let t of top8Third) {
        if (allowedGroups.includes(t.group) && !assignedThirds.has(t.name)) {
          assignedThirds.add(t.name);
          return t.name;
        }
      }
      for (let t of top8Third) {
        if (!assignedThirds.has(t.name)) {
          assignedThirds.add(t.name);
          return t.name;
        }
      }
      return null;
    };
    
    const matchups = [
      [groupRunnersUp["A"], groupRunnersUp["B"]],
      [groupWinners["F"], groupRunnersUp["C"]],
      [groupWinners["E"], getBestThirdForSlot(["A", "B", "C", "D", "F"])],
      [groupWinners["I"], getBestThirdForSlot(["C", "D", "F", "G", "H"])],
      [groupRunnersUp["K"], groupRunnersUp["L"]],
      [groupWinners["H"], groupRunnersUp["J"]],
      [groupWinners["D"], getBestThirdForSlot(["B", "E", "F", "I", "J"])],
      [groupWinners["G"], getBestThirdForSlot(["A", "E", "H", "I", "J"])],
      [groupWinners["C"], groupRunnersUp["F"]],
      [groupRunnersUp["E"], groupRunnersUp["I"]],
      [groupWinners["A"], getBestThirdForSlot(["C", "E", "F", "H", "I"])],
      [groupWinners["L"], getBestThirdForSlot(["E", "H", "I", "J", "K"])],
      [groupWinners["J"], groupRunnersUp["H"]],
      [groupRunnersUp["D"], groupRunnersUp["G"]],
      [groupWinners["B"], getBestThirdForSlot(["E", "F", "G", "I", "J"])],
      [groupWinners["K"], getBestThirdForSlot(["D", "E", "I", "J", "L"])]
    ];
    
    const teamRatings = {};
    teamsList.forEach(t => { teamRatings[t.team_en] = t.rating; });
    
    const getKoWinner = (t1, t2) => {
      const r1 = teamRatings[t1] || 1000;
      const r2 = teamRatings[t2] || 1000;
      const p1 = 1.0 / (1.0 + Math.pow(10, (r2 - r1) / 400));
      return Math.random() < p1 ? t1 : t2;
    };
    
    const r16Winners = [];
    matchups.forEach(([t1, t2]) => {
      const w = getKoWinner(t1, t2);
      roundCounts.r16[w]++;
      r16Winners.push(w);
    });
    
    const qfWinners = [];
    for (let i = 0; i < 8; i++) {
      const w = getKoWinner(r16Winners[2*i], r16Winners[2*i + 1]);
      roundCounts.qf[w]++;
      qfWinners.push(w);
    }
    
    const sfWinners = [];
    const sfLosers = [];
    for (let i = 0; i < 4; i++) {
      const t1 = qfWinners[2*i];
      const t2 = qfWinners[2*i + 1];
      const w = getKoWinner(t1, t2);
      const l = w === t1 ? t2 : t1;
      roundCounts.sf[w]++;
      sfWinners.push(w);
      sfLosers.push(l);
    }
    
    const w1 = getKoWinner(sfWinners[0], sfWinners[1]);
    const l1 = w1 === sfWinners[0] ? sfWinners[1] : sfWinners[0];
    const w2 = getKoWinner(sfWinners[2], sfWinners[3]);
    const l2 = w2 === sfWinners[2] ? sfWinners[3] : sfWinners[2];
    
    roundCounts.final[w1]++;
    roundCounts.final[w2]++;
    
    const bronzeWinner = getKoWinner(l1, l2);
    roundCounts.bronze[bronzeWinner]++;
    
    const champion = getKoWinner(w1, w2);
    const runnerUp = champion === w1 ? w2 : w1;
    
    roundCounts.gold[champion]++;
    roundCounts.silver[runnerUp]++;
  }
  
  const percentages = {
    qualify: {}, r32: {}, r16: {}, qf: {}, sf: {}, final: {}, gold: {}, silver: {}, bronze: {}
  };
  
  teamsList.forEach(t => {
    const name = t.team_en;
    percentages.qualify[name] = (qualifyCounts[name] / N) * 100;
    percentages.r32[name] = (roundCounts.r32[name] / N) * 100;
    percentages.r16[name] = (roundCounts.r16[name] / N) * 100;
    percentages.qf[name] = (roundCounts.qf[name] / N) * 100;
    percentages.sf[name] = (roundCounts.sf[name] / N) * 100;
    percentages.final[name] = (roundCounts.final[name] / N) * 100;
    percentages.gold[name] = (roundCounts.gold[name] / N) * 100;
    percentages.silver[name] = (roundCounts.silver[name] / N) * 100;
    percentages.bronze[name] = (roundCounts.bronze[name] / N) * 100;
  });
  
  return percentages;
}

// Bivariada Poisson and Altitude Helper for Liga MX
function calculateMatchProbs(home, away) {
  const hTeam = LIGA_MX_DATA.teams.find(t => t.name === home) || {};
  const aTeam = LIGA_MX_DATA.teams.find(t => t.name === away) || {};
  
  const atk_h = hTeam.atk_h || 1.0;
  const def_h = hTeam.def_h || 1.0;
  const atk_a = aTeam.atk_a || 1.0;
  const def_a = aTeam.def_a || 1.0;
  
  let xg_h = atk_h * def_a * LIGA_MX_DATA.league_avg_home;
  let xg_a = atk_a * def_h * LIGA_MX_DATA.league_avg_away;
  
  // Altitude calculation
  const alt_h = LIGAMX_ALTITUDES[home] || 1000.0;
  const alt_a = LIGAMX_ALTITUDES[away] || 1000.0;
  
  let h_alt = 0.0;
  if (alt_h >= 2100.0 && alt_a <= 600.0) h_alt = 100.0;
  else if (alt_h >= 1500.0) h_alt = 30.0;
  
  const h_base = 50.0;
  const h_dynamic = h_base + h_alt;
  
  const elo_h = hTeam.elo || 1500.0;
  const elo_a = aTeam.elo || 1500.0;
  
  const delta_elo = elo_h + h_dynamic - elo_a;
  const adj = delta_elo / 1000.0;
  
  xg_h *= Math.max(0.2, Math.min(2.5, 1.0 + adj));
  xg_a *= Math.max(0.2, Math.min(2.5, 1.0 - adj));
  
  // Calculate Poisson outcomes (cap at 5 goals)
  const maxGoals = 5;
  let pWin = 0, pDraw = 0, pLoss = 0;
  
  const poissonPmf = (k, lamb) => {
    let fact = 1;
    for (let i = 1; i <= k; i++) fact *= i;
    return (Math.pow(lamb, k) * Math.exp(-lamb)) / fact;
  };
  
  const matrix = [];
  for (let i = 0; i <= maxGoals; i++) {
    matrix[i] = [];
    for (let j = 0; j <= maxGoals; j++) {
      const p_h = poissonPmf(i, xg_h);
      const p_a = poissonPmf(j, xg_a);
      matrix[i][j] = p_h * p_a;
      
      if (i > j) pWin += matrix[i][j];
      else if (i === j) pDraw += matrix[i][j];
      else pLoss += matrix[i][j];
    }
  }
  
  const sum = pWin + pDraw + pLoss;
  return {
    xg_home: xg_h,
    xg_away: xg_a,
    win: pWin / sum,
    draw: pDraw / sum,
    loss: pLoss / sum
  };
}

// Core Monte Carlo Loop for Liga MX Clausura 2026
function executeMonteCarloLigaMX(N) {
  const activeTeams = LIGA_MX_DATA.teams.filter(t => t.name !== 'Morelia' && t.name !== 'Veracruz' && t.name !== 'Lobos BUAP' && t.name !== 'Chiapas');
  const fixturesList = LIGA_MX_DATA.fixtures;
  
  // Frequency tables
  const teamPositionsFreq = {}; // team -> position (1-18) -> count
  const leaderCounts = {};
  const top6Counts = {};
  const playinCounts = {};
  const outCounts = {};
  const accumulatedPts = {};
  const accumulatedGd = {};
  
  activeTeams.forEach(t => {
    teamPositionsFreq[t.name] = {};
    for (let p = 1; p <= 18; p++) teamPositionsFreq[t.name][p] = 0;
    leaderCounts[t.name] = 0;
    top6Counts[t.name] = 0;
    playinCounts[t.name] = 0;
    outCounts[t.name] = 0;
    accumulatedPts[t.name] = 0;
    accumulatedGd[t.name] = 0;
  });
  
  for (let iter = 0; iter < N; iter++) {
    const simTable = {};
    activeTeams.forEach(t => {
      simTable[t.name] = {
        name: t.name,
        pts: 0,
        gd: 0,
        gf: 0,
        rating: t.elo || 1500.0
      };
    });
    
    // Simulate matches
    fixturesList.forEach(f => {
      const pred = state.userPredictions[f.id];
      let goalsH = 0;
      let goalsA = 0;
      
      if (pred.scoreHome !== null && pred.scoreAway !== null) {
        goalsH = pred.scoreHome;
        goalsA = pred.scoreAway;
      } else if (pred.outcome !== null) {
        if (pred.outcome === "L") { goalsH = 1 + getPoisson(0.6); goalsA = getPoisson(0.5); }
        else if (pred.outcome === "V") { goalsH = getPoisson(0.5); goalsA = 1 + getPoisson(0.6); }
        else { goalsH = goalsA = getPoisson(0.9); }
      } else {
        const probs = calculateMatchProbs(f.home, f.away);
        const r = Math.random();
        if (r < probs.win) {
          goalsH = 1 + getPoisson(probs.xg_home);
          goalsA = getPoisson(probs.xg_away);
        } else if (r < probs.win + probs.draw) {
          goalsH = goalsA = getPoisson((probs.xg_home + probs.xg_away) / 2);
        } else {
          goalsH = getPoisson(probs.xg_home);
          goalsA = 1 + getPoisson(probs.xg_away);
        }
      }
      
      const tH = simTable[f.home];
      const tA = simTable[f.away];
      
      tH.gf += goalsH; tH.gd += (goalsH - goalsA);
      tA.gf += goalsA; tA.gd += (goalsA - goalsH);
      
      if (goalsH > goalsA) tH.pts += 3;
      else if (goalsA > goalsH) tA.pts += 3;
      else { tH.pts += 1; tA.pts += 1; }
    });
    
    // Compile standings
    const list = Object.values(simTable);
    list.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.rating - a.rating);
    
    // Log final positions
    list.forEach((t, index) => {
      const pos = index + 1;
      teamPositionsFreq[t.name][pos]++;
      accumulatedPts[t.name] += t.pts;
      accumulatedGd[t.name] += t.gd;
      
      if (pos === 1) leaderCounts[t.name]++;
      if (pos <= 6) top6Counts[t.name]++;
      else if (pos > 6 && pos <= 10) playinCounts[t.name]++;
      else outCounts[t.name]++;
    });
  }
  
  // Format stats output
  const teamProjs = {};
  activeTeams.forEach(t => {
    teamProjs[t.name] = {
      avgPts: accumulatedPts[t.name] / N,
      avgGd: accumulatedGd[t.name] / N,
      liderProb: (leaderCounts[t.name] / N) * 100,
      top6Prob: (top6Counts[t.name] / N) * 100,
      playinProb: (playinCounts[t.name] / N) * 100,
      outProb: (outCounts[t.name] / N) * 100
    };
  });
  
  // Build normalized Matrix distribution
  const normalizedMatrix = {};
  activeTeams.forEach(t => {
    normalizedMatrix[t.name] = {};
    for (let p = 1; p <= 18; p++) {
      normalizedMatrix[t.name][p] = teamPositionsFreq[t.name][p] / N;
    }
  });
  
  return {
    teamProjs: teamProjs,
    matrix: normalizedMatrix
  };
}

// Format date helper for World Cup kickoff
function formatKickoffMX(isoString, fallbackDate) {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) throw new Error();
    const optionsDate = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Mexico_City' };
    const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' };
    let dateStr = d.toLocaleDateString('es-MX', optionsDate);
    let timeStr = d.toLocaleTimeString('es-MX', optionsTime);
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    return { date: dateStr, time: timeStr };
  } catch (err) {
    return { date: fallbackDate, time: "--:--" };
  }
}

// Generate the daily code based on date
function getDailyCode(dateStr) {
  let hash = 0;
  const key = "nexos2026_alquimista_" + dateStr;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 900000 + 100000).toString();
}

function startAccessTimerLoop() {
  // Lock mechanism placeholder
  const accessTimer = document.getElementById("access-timer");
  if (!accessTimer) return;
  
  setInterval(() => {
    if (state.isUnlocked && state.unlockTime) {
      const elapsed = Date.now() - state.unlockTime;
      const remaining = Math.max(0, 24 * 3600 * 1000 - elapsed);
      
      if (remaining === 0) {
        state.isUnlocked = false;
        state.unlockTime = null;
        document.getElementById("lock-screen").classList.remove("hidden");
        document.getElementById("access-timer-container").classList.add("hidden");
      } else {
        document.getElementById("access-timer-container").classList.remove("hidden");
        const hrs = Math.floor(remaining / 3600000).toString().padStart(2, '0');
        const mins = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, '0');
        const secs = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        accessTimer.textContent = `${hrs}:${mins}:${secs}`;
      }
    }
  }, 1000);
}

function resetPredictions() {
  initData();
  renderFixtures();
  renderStandings();
  runSimulation(false);
}


function renderMatchStats(f, panel) {
  const win = f.win_prob;
  const draw = f.draw_prob;
  const loss = f.loss_prob;
  
  // Calculate expected goals (xG) using a log-odds difference model
  const diff = 0.9 * Math.log((win + 0.05) / (loss + 0.05));
  const total = 3.0 - 1.2 * draw;
  const lambda = Math.max(0.2, (total + diff) / 2);
  const mu = Math.max(0.2, (total - diff) / 2);
  
  // 1. Goal Probabilities (Poisson)
  const homeProbs = [];
  const awayProbs = [];
  let homeSum = 0;
  let awaySum = 0;
  
  for (let k = 0; k <= 4; k++) {
    const pHome = (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
    const pAway = (Math.exp(-mu) * Math.pow(mu, k)) / factorial(k);
    homeProbs.push(pHome);
    awayProbs.push(pAway);
    homeSum += pHome;
    awaySum += pAway;
  }
  
  // 5+ goals category
  homeProbs.push(Math.max(0, 1 - homeSum));
  awayProbs.push(Math.max(0, 1 - awaySum));
  
  // 2. Scoreline Grid (6x6 matrix)
  const scorelineMatrix = [];
  let maxScoreProb = -1;
  let maxScoreH = 0;
  let maxScoreA = 0;
  
  for (let h = 0; h <= 5; h++) {
    scorelineMatrix[h] = [];
    for (let a = 0; a <= 5; a++) {
      const p = homeProbs[h] * awayProbs[a];
      scorelineMatrix[h][a] = p;
      if (p > maxScoreProb) {
        maxScoreProb = p;
        maxScoreH = h;
        maxScoreA = a;
      }
    }
  }
  
  // 3. Over / Under probabilities
  let probOver1_5 = 0;
  let probOver2_5 = 0;
  let probOver3_5 = 0;
  
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const p = scorelineMatrix[h][a];
      if (h + a > 1) probOver1_5 += p;
      if (h + a > 2) probOver2_5 += p;
      if (h + a > 3) probOver3_5 += p;
    }
  }
  
  // 4. Other Markets
  const btts = (1 - homeProbs[0]) * (1 - awayProbs[0]);
  const homeCS = awayProbs[0];
  const awayCS = homeProbs[0];
  
  // Shading helper based on probability
  function getShadingStyle(prob) {
    const opacity = Math.min(0.85, prob * 6);
    const textCol = opacity > 0.4 ? '#08090c' : '#ffffff';
    return `background-color: rgba(0, 230, 118, ${opacity}); color: ${textCol};`;
  }
  
  const pct = (val) => (val * 100).toFixed(1) + "%";
  
  panel.innerHTML = `
    <div class="stats-panel-content">
      <div class="stats-header-row">
        <span>xG Proyectado: <strong>${f.home_es} ${lambda.toFixed(2)}</strong> - <strong>${mu.toFixed(2)} ${f.away_es}</strong></span>
      </div>
      
      <div class="stats-goals-barcharts">
        <div class="team-goals-chart">
          <h4>Probabilidad de Goles (${f.home_es})</h4>
          ${homeProbs.map((p, k) => `
            <div class="goal-bar-row">
              <span class="goal-num-lbl">${k === 5 ? '5+' : k}</span>
              <div class="goal-bar-container">
                <div class="goal-bar home-bg" style="width: ${p * 100}%"></div>
              </div>
              <span class="goal-bar-val">${pct(p)}</span>
            </div>
          `).join('')}
        </div>
        <div class="team-goals-chart">
          <h4>Probabilidad de Goles (${f.away_es})</h4>
          ${awayProbs.map((p, k) => `
            <div class="goal-bar-row">
              <span class="goal-num-lbl">${k === 5 ? '5+' : k}</span>
              <div class="goal-bar-container">
                <div class="goal-bar away-bg" style="width: ${p * 100}%"></div>
              </div>
              <span class="goal-bar-val">${pct(p)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="stats-scoreline-matrix">
        <h4>Probabilidad de Marcador Exacto (%)</h4>
        <div class="matrix-grid-container">
          <div class="matrix-header-cell">Goles: ${f.away_es} &rarr;</div>
          ${[0, 1, 2, 3, 4, '5+'].map(g => `<div class="matrix-header-cell col-lbl">${g}</div>`).join('')}
          
          ${[0, 1, 2, 3, 4, 5].map((h) => `
            <div class="matrix-header-cell row-lbl">${h === 5 ? '5+' : h}</div>
            ${[0, 1, 2, 3, 4, 5].map(a => {
              const p = scorelineMatrix[h][a];
              const isMostLikely = h === maxScoreH && a === maxScoreA;
              return `
                <div class="matrix-cell ${isMostLikely ? 'most-likely-outline' : ''}" style="${getShadingStyle(p)}">
                  ${(p * 100).toFixed(1)}
                </div>
              `;
            }).join('')}
          `).join('')}
        </div>
        <p class="matrix-caption">Marcador más probable: <strong>${f.home_es} ${maxScoreH} - ${maxScoreA} ${f.away_es}</strong> (${(maxScoreProb * 100).toFixed(1)}%)</p>
      </div>
      
      <div class="stats-markets">
        <div class="market-col">
          <h4>Over / Under</h4>
          <div class="market-row">
            <span>Más de 1.5</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${probOver1_5 * 100}%; background-color: var(--accent-gold);"></div></div>
            <span class="market-val">${pct(probOver1_5)}</span>
          </div>
          <div class="market-row">
            <span>Más de 2.5</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${probOver2_5 * 100}%; background-color: var(--accent-gold);"></div></div>
            <span class="market-val">${pct(probOver2_5)}</span>
          </div>
          <div class="market-row">
            <span>Más de 3.5</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${probOver3_5 * 100}%; background-color: var(--accent-gold);"></div></div>
            <span class="market-val">${pct(probOver3_5)}</span>
          </div>
        </div>
        <div class="market-col">
          <h4>Otros Mercados</h4>
          <div class="market-row">
            <span>Ambos Anotan (BTTS)</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${btts * 100}%; background-color: var(--draw-color);"></div></div>
            <span class="market-val">${pct(btts)}</span>
          </div>
          <div class="market-row">
            <span>Arco en Cero (${f.home_es})</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${homeCS * 100}%; background-color: var(--accent-gold);"></div></div>
            <span class="market-val">${pct(homeCS)}</span>
          </div>
          <div class="market-row">
            <span>Arco en Cero (${f.away_es})</span>
            <div class="market-progress-bar"><div class="progress" style="width: ${awayCS * 100}%; background-color: var(--accent-gold);"></div></div>
            <span class="market-val">${pct(awayCS)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

// Normalización de nombres de equipos en español
function normalizeTeamName(name) {
  if (!name) return "";
  let n = name.toString().toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Manejar abreviación específica de Bosnia y Herzegovina
  if (n === "bosnia y herzeg") {
    n = "bosnia y herzegovina";
  }
  return n;
}

// Procesar la subida del Excel
function handleLayoutUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Buscar hoja de "Mundial"
      const sheetName = workbook.SheetNames.find(n => n.toLowerCase() === 'mundial') || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error("No se encontró la hoja de cálculo en el archivo.");
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (!rows || rows.length < 2) {
        throw new Error("El archivo está vacío o no tiene el formato correcto.");
      }

      const headerRow = rows[0];
      const colLocalIdx = headerRow.findIndex(cell => cell && cell.toString().trim().toLowerCase() === 'local');
      const colResultIdx = headerRow.findIndex(cell => cell && cell.toString().trim().toLowerCase() === 'resultado');
      const colVisitaIdx = headerRow.findIndex(cell => cell && cell.toString().trim().toLowerCase() === 'visita');

      if (colLocalIdx === -1 || colResultIdx === -1 || colVisitaIdx === -1) {
        throw new Error("El archivo no tiene las columnas 'Local', 'Resultado' y 'Visita'.");
      }

      // Crear mapa de partidos en JS para buscar de manera eficiente
      const fixtureMap = {};
      WORLD_CUP_DATA.fixtures.forEach(f => {
    if (f.status === 'FINISHED' && f.home_score !== null && f.away_score !== null) {
      let outcome = "E";
      if (f.home_score > f.away_score) outcome = "L";
      if (f.away_score > f.home_score) outcome = "V";
      state.userPredictions[f.id] = {
        scoreHome: f.home_score,
        scoreAway: f.away_score,
        outcome: outcome
      };
    }
  });

      // Limpiar predicciones previas en memoria
      WORLD_CUP_DATA.fixtures.forEach(f => {
    if (f.status === 'FINISHED' && f.home_score !== null && f.away_score !== null) {
      let outcome = "E";
      if (f.home_score > f.away_score) outcome = "L";
      if (f.away_score > f.home_score) outcome = "V";
      state.userPredictions[f.id] = {
        scoreHome: f.home_score,
        scoreAway: f.away_score,
        outcome: outcome
      };
    }
  });

      let parsedCount = 0;
      let matchedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const localVal = row[colLocalIdx];
        const visitaVal = row[colVisitaIdx];
        const resultVal = row[colResultIdx];

        if (!localVal || !visitaVal) continue;

        parsedCount++;

        const normLocal = normalizeTeamName(localVal);
        const normVisita = normalizeTeamName(visitaVal);
        const key = `${normLocal} vs ${normVisita}`;

        const fixture = fixtureMap[key];
        if (fixture) {
          matchedCount++;
          const valStr = resultVal ? resultVal.toString().trim().toUpperCase() : "";
          if (valStr === "L" || valStr === "E" || valStr === "V") {
            state.userPredictions[fixture.id].outcome = valStr;
            state.userPredictions[fixture.id].scoreHome = null;
            state.userPredictions[fixture.id].scoreAway = null;
          } else if (valStr.indexOf("-") !== -1 || valStr.indexOf(":") !== -1) {
            const delimiter = valStr.indexOf("-") !== -1 ? "-" : ":";
            const parts = valStr.split(delimiter);
            if (parts.length === 2) {
              const hScore = parseInt(parts[0].trim());
              const aScore = parseInt(parts[1].trim());
              if (!isNaN(hScore) && !isNaN(aScore)) {
                state.userPredictions[fixture.id].scoreHome = hScore;
                state.userPredictions[fixture.id].scoreAway = aScore;
                if (hScore > aScore) state.userPredictions[fixture.id].outcome = "L";
                else if (hScore < aScore) state.userPredictions[fixture.id].outcome = "V";
                else state.userPredictions[fixture.id].outcome = "E";
              }
            }
          }
        }
      }

      // Reiniciar el input para permitir subir el mismo archivo consecutivamente
      e.target.value = "";

      // Re-renderizar y simular en memoria
      renderFixtures();
      runSimulation(false);

      alert(`¡Carga exitosa! Se procesaron ${parsedCount} partidos y se actualizaron ${matchedCount} predicciones en el simulador.`);
    } catch (err) {
      console.error(err);
      alert("Error al cargar el archivo de quiniela: " + err.message);
      e.target.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
}

// Generación de código de acceso diario (FNV-1a 32-bit hash)
function getDailyCode(dateStr, salt = "nexos2026") {
  let h = 2166136261;
  const inputStr = `${dateStr}-${salt}`;
  for (let i = 0; i < inputStr.length; i++) {
    h = h ^ inputStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const codeNum = h % 1000000;
  return String(codeNum).padStart(6, '0');
}

// Bucle periódico del contador de acceso y control de bloqueo (24 horas)
function startAccessTimerLoop() {
  const activationTime = new Date("2026-06-11T18:00:00-06:00");
  const lockScreen = document.getElementById("lock-screen");
  const timerContainer = document.getElementById("access-timer-container");
  const timerVal = document.getElementById("access-timer");

  function checkStatus() {
    const now = new Date();
    const isPastActivation = now >= activationTime;

    if (!isPastActivation) {
      // Antes de las 6:00 PM: acceso completamente libre
      if (lockScreen) lockScreen.classList.add("hidden");
      if (timerContainer) timerContainer.classList.add("hidden");
      return;
    }

    // A partir de las 6:00 PM: acceso controlado activo
    const isUnlocked = state.isUnlocked;
    const unlockTime = state.unlockTime;

    if (isUnlocked && unlockTime) {
      const elapsed = Date.now() - unlockTime;
      const remaining = 10 * 24 * 60 * 60 * 1000 - elapsed;

      if (remaining <= 0) {
        // Expiraron las 24 horas: bloquear sitio y borrar llaves en memoria
        state.isUnlocked = false;
        state.unlockTime = null;
        if (lockScreen) lockScreen.classList.remove("hidden");
        if (timerContainer) timerContainer.classList.add("hidden");
      } else {
        // Acceso desbloqueado y vigente: ocultar bloqueo, mostrar contador
        if (lockScreen) lockScreen.classList.add("hidden");
        if (timerContainer) timerContainer.classList.remove("hidden");
        
        // Formatear contador en HH:MM:SS
        const totalSecs = Math.floor(remaining / 1000);
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        
        if (timerVal) {
          timerVal.textContent = 
            String(hrs).padStart(2, '0') + ":" + 
            String(mins).padStart(2, '0') + ":" + 
            String(secs).padStart(2, '0');
        }
      }
    } else {
      // Bloqueado: mostrar pantalla de bloqueo y ocultar contador
      if (lockScreen) lockScreen.classList.remove("hidden");
      if (timerContainer) timerContainer.classList.add("hidden");
    }
  }

  // Ejecución inicial y luego cada segundo
  checkStatus();
  setInterval(checkStatus, 1000);
}

// Formatear fecha y hora al huso horario de CDMX (UTC-6)
function formatKickoffMX(kickoffStr, fallbackDate) {
  if (!kickoffStr) return { date: fallbackDate || "TBD", time: "TBD" };
  try {
    const dateObj = new Date(kickoffStr);
    const datePart = dateObj.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const timePart = dateObj.toLocaleTimeString("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return { date: datePart, time: timePart + " CDMX" };
  } catch (err) {
    return { date: fallbackDate || "TBD", time: "TBD" };
  }
}