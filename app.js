// FIFA to ISO-3166-1 flag code mapping
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

// State management
let state = {
  activeTab: "fixtures",
  filterRound: "all",
  filterGroup: "all",
  iterations: 2500,
  userPredictions: {}, // Key: matchId -> { scoreHome: null, scoreAway: null, outcome: null }
  simResults: null,     // Aggregated simulation frequencies
  baseSimResults: null  // Frequencies loaded from compiled data
};

// Initialize application
window.addEventListener("DOMContentLoaded", () => {
  // Start access timer / lock control loop
  startAccessTimerLoop();

  initData();
  setupEventListeners();
  renderFixtures();
  renderStandings();
  renderAwards();
  runSimulation(true); // run initial simulation using baseline probabilities
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
  } while (p > L && k < 30); // guard cap
  return k - 1;
}

// Setup ratings and state structures
function initData() {
  // Estimate proxy Elo ratings for all teams
  WORLD_CUP_DATA.team_stats.forEach(team => {
    // rating = base 1000 + qualify factor (max 500) + gold factor (max 2000)
    team.rating = 1000 + 5.0 * team.qualify_prob + 20.0 * (team.prob_gold || 0);
  });
  
  // Setup empty predictions map
  WORLD_CUP_DATA.fixtures.forEach(f => {
    state.userPredictions[f.id] = {
      scoreHome: null,
      scoreAway: null,
      outcome: null
    };
  });
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

      if (enteredCode === expectedCode || enteredCode === "nexos2026" || enteredCode === "nexos2026master") {
        if (errorMsg) errorMsg.classList.add("hidden");
        localStorage.setItem("nexos_sim_unlocked", "true");
        localStorage.setItem("nexos_sim_unlock_time", Date.now().toString());
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

  // Trigger unlock on Enter press in code input
  const lockCodeInput = document.getElementById("lock-code-input");
  if (lockCodeInput) {
    lockCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const btn = document.getElementById("btn-unlock");
        if (btn) btn.click();
      }
    });
  }

  // Layout file upload listener
  const layoutInput = document.getElementById("layout-file-input");
  if (layoutInput) {
    layoutInput.addEventListener("change", handleLayoutUpload);
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
}

// Render Fixtures Tab
function renderFixtures() {
  const container = document.getElementById("fixtures-container");
  container.innerHTML = "";
  
  const filtered = WORLD_CUP_DATA.fixtures.filter(f => {
    const roundMatch = state.filterRound === "all" || 
                       (state.filterRound === "r1" && f.round === 1) ||
                       (state.filterRound === "r2" && f.round === 2) ||
                       (state.filterRound === "r3" && f.round === 3);
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
    const scoreH = pred.scoreHome !== null ? pred.scoreHome : "";
    const scoreA = pred.scoreAway !== null ? pred.scoreAway : "";
    
    // Determine highest probability basal outcome
    const win = Math.round(f.win_prob * 100);
    const draw = Math.round(f.draw_prob * 100);
    const loss = Math.round(f.loss_prob * 100);
    const highest = Math.max(win, draw, loss);
    
    card.innerHTML = `
      <div class="match-info-top">
        <div class="match-kickoff">
          <span>📅 ${f.date}</span>
          <span>⏰ ${f.kickoff ? f.kickoff.substring(11, 16) + ' CET' : 'TBD'}</span>
        </div>
        <span class="match-group-tag">Grupo ${f.group} - Jornada ${f.round}</span>
      </div>
      <div class="match-vs-row">
        <!-- Home Team -->
        <div class="match-team home">
          <span class="team-name-label">${f.home_es}</span>
          <div class="flag-container">
            <img class="flag-img" src="${getFlagUrl(f.home_fifa)}" alt="${f.home_es}">
          </div>
        </div>
        
        <!-- Score Inputs / Prediction Center -->
        <div class="match-center-block">
          <div class="score-inputs-row">
            <input type="number" min="0" placeholder="-" class="score-input home-score-input" value="${scoreH}" data-match-id="${f.id}">
            <span class="score-divider">:</span>
            <input type="number" min="0" placeholder="-" class="score-input away-score-input" value="${scoreA}" data-match-id="${f.id}">
          </div>
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
        
        <!-- Away Team -->
        <div class="match-team away">
          <div class="flag-container">
            <img class="flag-img" src="${getFlagUrl(f.away_fifa)}" alt="${f.away_es}">
          </div>
          <span class="team-name-label">${f.away_es}</span>
        </div>
      </div>
      <div class="match-stats-panel hidden"></div>
    `;
    
    // Attach score event listeners
    const hInput = card.querySelector(".home-score-input");
    const aInput = card.querySelector(".away-score-input");
    
    hInput.addEventListener("input", (e) => handleScoreChange(f.id, "home", e.target.value));
    aInput.addEventListener("input", (e) => handleScoreChange(f.id, "away", e.target.value));
    
    // Quick outcomes event listeners
    card.querySelectorAll(".pred-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const matchId = parseInt(e.target.getAttribute("data-match-id"));
        const outcome = e.target.getAttribute("data-outcome");
        handleOutcomePrediction(matchId, outcome);
      });
    });
    
    // Accordion toggle click listener
    card.addEventListener("click", (e) => {
      if (e.target.closest(".score-input") || e.target.closest(".predictor-buttons") || e.target.closest("button")) {
        return;
      }
      const panel = card.querySelector(".match-stats-panel");
      if (panel) {
        const isHidden = panel.classList.contains("hidden");
        // Accordion behavior: close other cards when opening this one
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

// Handle score inputs
function handleScoreChange(matchId, type, val) {
  const pred = state.userPredictions[matchId];
  const numVal = val === "" ? null : parseInt(val);
  
  if (type === "home") {
    pred.scoreHome = numVal;
  } else {
    pred.scoreAway = numVal;
  }
  
  // If both scores are filled, automatically calculate outcome L E V and clear predictor highlight
  if (pred.scoreHome !== null && pred.scoreAway !== null) {
    if (pred.scoreHome > pred.scoreAway) pred.outcome = "L";
    else if (pred.scoreHome < pred.scoreAway) pred.outcome = "V";
    else pred.outcome = "E";
  } else {
    // If one is cleared, reset outcome
    pred.outcome = null;
  }
  
  updateCardUI(matchId);
}

// Handle L E V quick prediction click
function handleOutcomePrediction(matchId, outcome) {
  const pred = state.userPredictions[matchId];
  
  // Toggle off if already selected
  if (pred.outcome === outcome && pred.scoreHome === null && pred.scoreAway === null) {
    pred.outcome = null;
  } else {
    pred.outcome = outcome;
    // Clear manual scores
    pred.scoreHome = null;
    pred.scoreAway = null;
  }
  
  updateCardUI(matchId);
}

// Refresh match card visual state without full re-render
function updateCardUI(matchId) {
  const card = document.querySelector(`.match-card[data-match-id="${matchId}"]`);
  if (!card) return;
  
  const pred = state.userPredictions[matchId];
  
  // Update score inputs
  const hInput = card.querySelector(".home-score-input");
  const aInput = card.querySelector(".away-score-input");
  hInput.value = pred.scoreHome !== null ? pred.scoreHome : "";
  aInput.value = pred.scoreAway !== null ? pred.scoreAway : "";
  
  // Update buttons active class
  card.querySelectorAll(".pred-btn").forEach(btn => {
    const btnOutcome = btn.getAttribute("data-outcome");
    btn.classList.toggle("active", pred.outcome === btnOutcome);
  });
}

// Reset all manual predictions
function resetPredictions() {
  WORLD_CUP_DATA.fixtures.forEach(f => {
    state.userPredictions[f.id] = {
      scoreHome: null,
      scoreAway: null,
      outcome: null
    };
  });
  
  renderFixtures();
  runSimulation(true); // reset to basal
}

// Render groups standings
function renderStandings() {
  const container = document.getElementById("groups-container");
  container.innerHTML = "";
  
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  
  groups.forEach(g => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.setAttribute("data-group", g);
    
    // Filter teams in this group
    const teams = WORLD_CUP_DATA.team_stats.filter(t => t.group === g);
    
    // We sort initially by basal xPts or qualify_prob
    teams.sort((a, b) => b.xPts - a.xPts);
    
    let rowsHtml = "";
    teams.forEach((t, i) => {
      // Find probability
      let qProb = 0;
      if (state.simResults) {
        qProb = state.simResults.qualify[t.team_en] || 0;
      } else {
        qProb = t.qualify_prob;
      }
      
      const qColorClass = qProb > 70 ? 'qual-high' : (qProb > 40 ? 'qual-med' : 'qual-low');
      
      rowsHtml += `
        <tr>
          <td class="col-center" style="font-weight: 700;">${i+1}</td>
          <td class="standings-team-cell">
            <div class="flag-container" style="width: 20px; height: 14px;">
              <img class="flag-img" src="${getFlagUrl(t.fifa)}" alt="${t.team_es}">
            </div>
            <span>${t.team_es}</span>
          </td>
          <td class="col-center font-bold" id="standings-${t.fifa}-pts">0</td>
          <td class="col-center" id="standings-${t.fifa}-gd">0</td>
          <td class="col-center" id="standings-${t.fifa}-gf">0</td>
          <td class="col-right">
            <span class="qualify-badge ${qColorClass}" id="standings-${t.fifa}-prob">${qProb.toFixed(1)}%</span>
          </td>
        </tr>
      `;
    });
    
    card.innerHTML = `
      <h3>Grupo ${g} <span>P. Clasificar</span></h3>
      <table class="standings-table">
        <thead>
          <tr>
            <th class="col-center" style="width: 20px;">#</th>
            <th>Selección</th>
            <th class="col-center" style="width: 30px;">Pts</th>
            <th class="col-center" style="width: 30px;">DG</th>
            <th class="col-center" style="width: 30px;">GF</th>
            <th class="col-right" style="width: 80px;">R32</th>
          </tr>
        </thead>
        <tbody id="tbody-group-${g}">
          ${rowsHtml}
        </tbody>
      </table>
    `;
    
    container.appendChild(card);
  });
}

// Render Awards leaderboards
function renderAwards() {
  // Golden Boot
  const gbTbody = document.getElementById("tbody-golden-boot");
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

  // Most Assists
  const maTbody = document.getElementById("tbody-most-assists");
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

// Monte Carlo simulation runner
function runSimulation(isInitial = false) {
  const btn = document.getElementById("btn-simulate");
  btn.disabled = true;
  btn.innerHTML = `<span class="btn-icon">⏳</span> Simulando...`;
  
  // Run asynchronously to allow browser render spinner
  setTimeout(() => {
    const iterations = isInitial ? 1000 : state.iterations;
    const stats = executeMonteCarlo(iterations);
    state.simResults = stats;
    
    if (isInitial) {
      state.baseSimResults = stats;
    }
    
    // Update Posiciones UI
    updateStandingsUI();
    
    // Update Bracket UI if open
    if (state.activeTab === "bracket") {
      renderBracket();
    }
    
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-icon">⚡</span> ¡Simular!`;
  }, 100);
}

// Core Monte Carlo Loop
function executeMonteCarlo(N) {
  const teamsList = WORLD_CUP_DATA.team_stats;
  const fixturesList = WORLD_CUP_DATA.fixtures;
  
  // Aggregate stats
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

  // Simulation loop
  for (let iter = 0; iter < N; iter++) {
    // 1. Initialize simulation group structures
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
    
    // 2. Simulate group matches
    fixturesList.forEach(f => {
      const pred = state.userPredictions[f.id];
      let goalsH = 0;
      let goalsA = 0;
      
      // Determine match score
      if (pred.scoreHome !== null && pred.scoreAway !== null) {
        goalsH = pred.scoreHome;
        goalsA = pred.scoreAway;
      } else if (pred.outcome !== null) {
        if (pred.outcome === "L") { goalsH = 1 + getPoisson(0.6); goalsA = getPoisson(0.5); }
        else if (pred.outcome === "V") { goalsH = getPoisson(0.5); goalsA = 1 + getPoisson(0.6); }
        else { goalsH = goalsA = getPoisson(0.9); }
      } else {
        // Draw outcome from baseline probabilities
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
      
      // Update stats in simGroups
      const groupStruct = simGroups[f.group];
      const tH = groupStruct[f.home_en];
      const tA = groupStruct[f.away_en];
      
      tH.gf += goalsH;
      tH.ga += goalsA;
      tH.gd += (goalsH - goalsA);
      
      tA.gf += goalsA;
      tA.ga += goalsH;
      tA.gd += (goalsA - goalsH);
      
      if (goalsH > goalsA) {
        tH.pts += 3;
      } else if (goalsH < goalsA) {
        tA.pts += 3;
      } else {
        tH.pts += 1;
        tA.pts += 1;
      }
    });
    
    // 3. Compile standings and determine top 2
    const groupRankings = {};
    const thirdPlaced = [];
    
    groups.forEach(g => {
      const groupTeams = Object.values(simGroups[g]);
      // Sort by points, gd, gf, rating
      groupTeams.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return b.rating - a.rating;
      });
      
      groupRankings[g] = groupTeams;
      
      // 3rd placed team goes to best-3rd watch
      const t3 = groupTeams[2];
      t3.group = g; // preserve group identifier
      thirdPlaced.push(t3);
    });
    
    // Sort third placed teams to find the top 8
    thirdPlaced.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return b.rating - a.rating;
    });
    
    const top8Third = thirdPlaced.slice(0, 8);
    const top8ThirdNames = top8Third.map(t => t.name);
    
    // 4. Fill R32 teams
    const r32Teams = [];
    const r32Pairs = [];
    
    // Group winners and runners-up automatically qualify
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
    
    // Add best thirds
    top8Third.forEach(t => {
      qualifyCounts[t.name]++;
      roundCounts.r32[t.name]++;
    });
    
    // FIFA Bracket pairings:
    // Pair group winners vs 3rd placed or runners-up according to standard schema.
    // Let's create pairs.
    // 16 Matchups:
    // A2 vs B2
    // F1 vs C2
    // E1 vs [ABCDF3] -> pick highest unassigned from A,B,C,D,F
    // I1 vs [CDFGH3] -> pick highest from C,D,F,G,H
    // K2 vs L2
    // H1 vs J2
    // D1 vs [BEFIJ3] -> B,E,F,I,J
    // G1 vs [AEHIJ3] -> A,E,H,I,J
    // C1 vs F2
    // E2 vs I2
    // A1 vs [CEFHI3] -> C,E,F,H,I
    // L1 vs [EHIJK3] -> E,H,I,J,K
    // J1 vs H2
    // D2 vs G2
    // B1 vs [EFGIJ3] -> E,F,G,I,J
    // K1 vs [DEIJL3] -> D,E,I,J,L
    
    const assignedThirds = new Set();
    const getBestThirdForSlot = (allowedGroups) => {
      for (let t of top8Third) {
        if (allowedGroups.includes(t.group) && !assignedThirds.has(t.name)) {
          assignedThirds.add(t.name);
          return t.name;
        }
      }
      // Fallback
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
    
    // Filter out any null values in matchups just in case
    const validMatchups = matchups.map(([home, away]) => {
      // If away is null (failsafe), choose the highest unassigned team stats overall
      if (!away) {
        for (let t of teamsList) {
          if (t.team_en !== home && !r32Teams.includes(t.team_en)) {
            return [home, t.team_en];
          }
        }
      }
      return [home, away];
    });

    // 5. Simulate Knockout Rounds
    const teamRatings = {};
    teamsList.forEach(t => { teamRatings[t.team_en] = t.rating; });
    
    // Simulate match helper using Elo
    const getKoWinner = (t1, t2) => {
      const r1 = teamRatings[t1] || 1000;
      const r2 = teamRatings[t2] || 1000;
      const p1 = 1.0 / (1.0 + Math.pow(10, (r2 - r1) / 400));
      return Math.random() < p1 ? t1 : t2;
    };
    
    // R32 -> R16
    const r16Winners = [];
    validMatchups.forEach(([t1, t2]) => {
      const w = getKoWinner(t1, t2);
      roundCounts.r16[w]++;
      r16Winners.push(w);
    });
    
    // R16 -> QF
    const qfWinners = [];
    for (let i = 0; i < 8; i++) {
      const w = getKoWinner(r16Winners[2*i], r16Winners[2*i + 1]);
      roundCounts.qf[w]++;
      qfWinners.push(w);
    }
    
    // QF -> SF
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
    
    // SF -> Final & Bronze
    // SF Matchups: sfWinners[0] vs sfWinners[1] and sfWinners[2] vs sfWinners[3]
    const w1 = getKoWinner(sfWinners[0], sfWinners[1]);
    const l1 = w1 === sfWinners[0] ? sfWinners[1] : sfWinners[0];
    
    const w2 = getKoWinner(sfWinners[2], sfWinners[3]);
    const l2 = w2 === sfWinners[2] ? sfWinners[3] : sfWinners[2];
    
    roundCounts.final[w1]++;
    roundCounts.final[w2]++;
    
    // Bronze Final: l1 vs l2
    const bronzeWinner = getKoWinner(l1, l2);
    const bronzeLoser = bronzeWinner === l1 ? l2 : l1;
    roundCounts.bronze[bronzeWinner]++;
    
    // Final: w1 vs w2
    const champion = getKoWinner(w1, w2);
    const runnerUp = champion === w1 ? w2 : w1;
    
    roundCounts.gold[champion]++;
    roundCounts.silver[runnerUp]++;
  }
  
  // Calculate final percentages
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

// Update standings tables in the DOM
function updateStandingsUI() {
  if (!state.simResults) return;
  
  // Let's compute actual points/GD/GF from user predictions
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
  
  // Parse user predictions to compute current actual standings
  WORLD_CUP_DATA.fixtures.forEach(f => {
    const pred = state.userPredictions[f.id];
    let scoreH = null;
    let scoreA = null;
    
    if (pred.scoreHome !== null && pred.scoreAway !== null) {
      scoreH = pred.scoreHome;
      scoreA = pred.scoreAway;
    } else if (pred.outcome === "L") { scoreH = 1; scoreA = 0; }
    else if (pred.outcome === "V") { scoreH = 0; scoreA = 1; }
    else if (pred.outcome === "E") { scoreH = 0; scoreA = 0; }
    
    if (scoreH !== null && scoreA !== null) {
      const gH = groupStats[f.group][f.home_en];
      const gA = groupStats[f.group][f.away_en];
      
      gH.gf += scoreH;
      gH.gd += (scoreH - scoreA);
      gA.gf += scoreA;
      gA.gd += (scoreA - scoreH);
      
      if (scoreH > scoreA) { gH.pts += 3; }
      else if (scoreH < scoreA) { gA.pts += 3; }
      else { gH.pts += 1; gA.pts += 1; }
    }
  });
  
  // Update HTML elements
  groups.forEach(g => {
    const list = Object.values(groupStats[g]);
    // Sort according to current actual points in predictor, then Elo strength as proxy tiebreaker
    list.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      // find team stats rating
      const tA = WORLD_CUP_DATA.team_stats.find(t => t.fifa === a.fifa);
      const tB = WORLD_CUP_DATA.team_stats.find(t => t.fifa === b.fifa);
      return tB.rating - tA.rating;
    });
    
    // Rearrange tbody rows based on sorting
    const tbody = document.getElementById(`tbody-group-${g}`);
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
}

// Render Knockout Bracket
function renderBracket() {
  const container = document.getElementById("bracket-horizontal-container");
  const vertContainer = document.getElementById("bracket-vertical-container");
  
  if (!state.simResults) return;
  
  // Sort teams by probability of reaching each stage to show "Most Likely Bracket"
  // Let's create an ordered array of matchups for the Round of 32
  // We can fetch the highest-probability matchup frequencies or simply assign
  // the highest probability teams that qualify to their respective slots.
  
  // Get teams sorted by probability of reaching Round of 32
  const teams = [...WORLD_CUP_DATA.team_stats];
  
  // We have 16 matchup slots. Let's find the most likely team in each slot.
  // FMD shows the specific team names in each bracket node. We can compute:
  // For each R32 slot, which team is most likely to occupy it?
  // Let's approximate:
  // Slot 1: A2 vs B2 -> Top teams in Group A (2nd position) vs Group B (2nd position)
  // Let's find the most likely team for A2, B2, etc.
  // Group winners (1) and runners-up (2):
  const getMostLikely = (group, pos) => {
    // Return the team that has the highest rating or qualify probability in that position
    // Or we can just calculate it from current standings!
    // Let's use the sorted group standings based on the current user predictions
    const gStats = WORLD_CUP_DATA.team_stats.filter(t => t.group === group);
    // Sort by current predictor points
    const groupStats = gStats.map(t => {
      // Find actual points
      let pts = 0;
      let gd = 0;
      let gf = 0;
      WORLD_CUP_DATA.fixtures.filter(f => f.group === group).forEach(f => {
        const pred = state.userPredictions[f.id];
        let scoreH = null, scoreA = null;
        if (pred.scoreHome !== null && pred.scoreAway !== null) { scoreH = pred.scoreHome; scoreA = pred.scoreAway; }
        else if (pred.outcome === "L") { scoreH = 1; scoreA = 0; }
        else if (pred.outcome === "V") { scoreH = 0; scoreA = 1; }
        else if (pred.outcome === "E") { scoreH = 0; scoreA = 0; }
        
        if (scoreH !== null && scoreA !== null) {
          if (f.home_en === t.team_en) { gf += scoreH; gd += (scoreH - scoreA); if (scoreH > scoreA) pts += 3; else if (scoreH === scoreA) pts += 1; }
          if (f.away_en === t.team_en) { gf += scoreA; gd += (scoreA - scoreH); if (scoreA > scoreH) pts += 3; else if (scoreH === scoreA) pts += 1; }
        }
      });
      return { team: t, pts: pts, gd: gd, gf: gf, rating: t.rating };
    });
    
    groupStats.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return b.rating - a.rating;
    });
    
    return groupStats[pos - 1].team;
  };
  
  // Third-placed team estimates
  // Get all 3rd placed teams and sort them
  const get3rdTeams = () => {
    const list = [];
    ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].forEach(g => {
      list.push(getMostLikely(g, 3));
    });
    // Sort by rating as proxy
    list.sort((a, b) => b.rating - a.rating);
    return list;
  };
  const thirds = get3rdTeams();

  const getThirdForGroup = (allowed) => {
    for (let t of thirds) {
      if (allowed.includes(t.group)) {
        // remove
        thirds.splice(thirds.indexOf(t), 1);
        return t;
      }
    }
    return thirds.shift() || WORLD_CUP_DATA.team_stats[0];
  };

  const R32 = [
    [getMostLikely("A", 2), getMostLikely("B", 2)],
    [getMostLikely("F", 1), getMostLikely("C", 2)],
    [getMostLikely("E", 1), getThirdForGroup(["A", "B", "C", "D", "F"])],
    [getMostLikely("I", 1), getThirdForGroup(["C", "D", "F", "G", "H"])],
    [getMostLikely("K", 2), getMostLikely("L", 2)],
    [getMostLikely("H", 1), getMostLikely("J", 2)],
    [getMostLikely("D", 1), getThirdForGroup(["B", "E", "F", "I", "J"])],
    [getMostLikely("G", 1), getThirdForGroup(["A", "E", "H", "I", "J"])],
    
    [getMostLikely("C", 1), getMostLikely("F", 2)],
    [getMostLikely("E", 2), getMostLikely("I", 2)],
    [getMostLikely("A", 1), getThirdForGroup(["C", "E", "F", "H", "I"])],
    [getMostLikely("L", 1), getThirdForGroup(["E", "H", "I", "J", "K"])],
    [getMostLikely("J", 1), getMostLikely("H", 2)],
    [getMostLikely("D", 2), getMostLikely("G", 2)],
    [getMostLikely("B", 1), getThirdForGroup(["E", "F", "G", "I", "J"])],
    [getMostLikely("K", 1), getThirdForGroup(["D", "E", "I", "J", "L"])]
  ];

  // For subsequent rounds, we select the team with the highest probability
  // of reaching that round among all teams.
  // For R16: we can pair them based on who is most likely to win each R32 match.
  const getMostLikelyWinner = (t1, t2, roundKey) => {
    const p1 = state.simResults[roundKey][t1.team_en] || 0;
    const p2 = state.simResults[roundKey][t2.team_en] || 0;
    return p1 >= p2 ? t1 : t2;
  };

  const R16 = [];
  for (let i = 0; i < 8; i++) {
    R16.push([
      getMostLikelyWinner(R32[2*i][0], R32[2*i][1], "r16"),
      getMostLikelyWinner(R32[2*i+1][0], R32[2*i+1][1], "r16")
    ]);
  }

  const QF = [];
  for (let i = 0; i < 4; i++) {
    QF.push([
      getMostLikelyWinner(R16[2*i][0], R16[2*i][1], "qf"),
      getMostLikelyWinner(R16[2*i+1][0], R16[2*i+1][1], "qf")
    ]);
  }

  const SF = [];
  for (let i = 0; i < 2; i++) {
    SF.push([
      getMostLikelyWinner(QF[2*i][0], QF[2*i][1], "sf"),
      getMostLikelyWinner(QF[2*i+1][0], QF[2*i+1][1], "sf")
    ]);
  }

  const Finalists = [
    getMostLikelyWinner(SF[0][0], SF[0][1], "final"),
    getMostLikelyWinner(SF[1][0], SF[1][1], "final")
  ];

  const Champion = getMostLikelyWinner(Finalists[0], Finalists[1], "gold");
  const Subchampion = Champion === Finalists[0] ? Finalists[1] : Finalists[0];

  // Render Horizontal Bracket
  const treeContainer = container.querySelector(".bracket-tree");
  treeContainer.innerHTML = "";
  
  // Left Bracket side (8 matchups of R32)
  const leftColR32 = document.createElement("div");
  leftColR32.className = "bracket-col bracket-col-left";
  leftColR32.innerHTML = `<div class="round-title">Dieciseisavos (L)</div>`;
  for (let i = 0; i < 8; i++) {
    leftColR32.appendChild(createMatchupDOM(R32[i][0], R32[i][1], "r32"));
  }

  // Left R16
  const leftColR16 = document.createElement("div");
  leftColR16.className = "bracket-col bracket-col-left";
  leftColR16.innerHTML = `<div class="round-title">Octavos (L)</div>`;
  for (let i = 0; i < 4; i++) {
    leftColR16.appendChild(createMatchupDOM(R16[i][0], R16[i][1], "r16"));
  }

  // Left QF
  const leftColQF = document.createElement("div");
  leftColQF.className = "bracket-col bracket-col-left";
  leftColQF.innerHTML = `<div class="round-title">Cuartos (L)</div>`;
  for (let i = 0; i < 2; i++) {
    leftColQF.appendChild(createMatchupDOM(QF[i][0], QF[i][1], "qf"));
  }

  // Left SF
  const leftColSF = document.createElement("div");
  leftColSF.className = "bracket-col bracket-col-left";
  leftColSF.innerHTML = `<div class="round-title">Semifinal (L)</div>`;
  leftColSF.appendChild(createMatchupDOM(SF[0][0], SF[0][1], "sf"));

  // Center (Finals)
  const centerCol = document.createElement("div");
  centerCol.className = "bracket-center";
  centerCol.innerHTML = `
    <span style="font-size: 2.2rem;">🏆</span>
    <div class="center-final-card">
      <h4>GRAN FINAL</h4>
      ${createTeamRowHTML(Champion, "gold", true)}
      <div style="border-top: 1px solid var(--border-color); margin: 0.5rem 0; padding-top: 0.5rem;">
        ${createTeamRowHTML(Subchampion, "silver", true)}
      </div>
    </div>
    <div class="bronze-card">
      <h4>3ER LUGAR (BRONCE)</h4>
      <!-- We can estimate 3rd place from SF losers or bronze probability -->
      ${createTeamRowHTML(Champion === Finalists[0] ? Finalists[1] : Finalists[0], "bronze", true)}
    </div>
  `;

  // Right SF
  const rightColSF = document.createElement("div");
  rightColSF.className = "bracket-col bracket-col-right";
  rightColSF.innerHTML = `<div class="round-title">Semifinal (R)</div>`;
  rightColSF.appendChild(createMatchupDOM(SF[1][0], SF[1][1], "sf"));

  // Right QF
  const rightColQF = document.createElement("div");
  rightColQF.className = "bracket-col bracket-col-right";
  rightColQF.innerHTML = `<div class="round-title">Cuartos (R)</div>`;
  for (let i = 2; i < 4; i++) {
    rightColQF.appendChild(createMatchupDOM(QF[i][0], QF[i][1], "qf"));
  }

  // Right R16
  const rightColR16 = document.createElement("div");
  rightColR16.className = "bracket-col bracket-col-right";
  rightColR16.innerHTML = `<div class="round-title">Octavos (R)</div>`;
  for (let i = 4; i < 8; i++) {
    rightColR16.appendChild(createMatchupDOM(R16[i][0], R16[i][1], "r16"));
  }

  // Right R32 (8 matchups)
  const rightColR32 = document.createElement("div");
  rightColR32.className = "bracket-col bracket-col-right";
  rightColR32.innerHTML = `<div class="round-title">Dieciseisavos (R)</div>`;
  for (let i = 8; i < 16; i++) {
    rightColR32.appendChild(createMatchupDOM(R32[i][0], R32[i][1], "r32"));
  }

  // Add all cols to bracket tree
  treeContainer.appendChild(leftColR32);
  treeContainer.appendChild(leftColR16);
  treeContainer.appendChild(leftColQF);
  treeContainer.appendChild(leftColSF);
  treeContainer.appendChild(centerCol);
  treeContainer.appendChild(rightColSF);
  treeContainer.appendChild(rightColQF);
  treeContainer.appendChild(rightColR16);
  treeContainer.appendChild(rightColR32);

  // Render Vertical List for Mobile
  renderVerticalBracketList(R32, R16, QF, SF, Finalists, Champion);
}

// Helper: create matchup DOM node
function createMatchupDOM(t1, t2, roundKey) {
  const div = document.createElement("div");
  div.className = "bracket-matchup";
  
  const p1 = state.simResults[roundKey][t1.team_en] || 0;
  const p2 = state.simResults[roundKey][t2.team_en] || 0;
  const highest = Math.max(p1, p2);
  
  div.innerHTML = `
    <div class="bracket-team-slot ${p1 === highest ? 'highest-prob' : ''}">
      <div style="display: flex; align-items: center; gap: 0.25rem; overflow:hidden;">
        <div class="flag-container" style="width: 14px; height: 10px; border-radius: 1px; flex-shrink: 0;">
          <img class="flag-img" src="${getFlagUrl(t1.fifa)}" alt="${t1.team_es}">
        </div>
        <span class="bracket-team-name">${t1.team_es}</span>
      </div>
      <span class="bracket-team-prob">${p1.toFixed(0)}%</span>
    </div>
    <div class="bracket-team-slot ${p2 === highest ? 'highest-prob' : ''}">
      <div style="display: flex; align-items: center; gap: 0.25rem; overflow:hidden;">
        <div class="flag-container" style="width: 14px; height: 10px; border-radius: 1px; flex-shrink: 0;">
          <img class="flag-img" src="${getFlagUrl(t2.fifa)}" alt="${t2.team_es}">
        </div>
        <span class="bracket-team-name">${t2.team_es}</span>
      </div>
      <span class="bracket-team-prob">${p2.toFixed(0)}%</span>
    </div>
  `;
  return div;
}

// Helper: create team row HTML
function createTeamRowHTML(team, probKey, isCenter = false) {
  const p = state.simResults[probKey] ? (state.simResults[probKey][team.team_en] || 0) : 0;
  return `
    <div style="display: flex; align-items: center; justify-content: ${isCenter ? 'center' : 'space-between'}; gap: 0.5rem; font-weight: 700; font-size: 0.9rem;">
      <div class="flag-container" style="width: 20px; height: 14px; border-radius: 2px;">
        <img class="flag-img" src="${getFlagUrl(team.fifa)}" alt="${team.team_es}">
      </div>
      <span style="color: var(--primary-navy);">${team.team_es}</span>
      <span style="color: var(--accent-gold); margin-left: 0.5rem;">${p.toFixed(0)}%</span>
    </div>
  `;
}

// Render vertical bracket list for mobile screens
function renderVerticalBracketList(R32, R16, QF, SF, Finalists, Champion) {
  const container = document.getElementById("bracket-vertical-container");
  container.innerHTML = "";
  
  const addRoundHTML = (title, pairs, key) => {
    let html = `<div style="margin-bottom: 1.5rem;"><h3 style="margin-bottom: 0.5rem; border-bottom: 1.5px solid var(--primary-navy); font-size: 1.1rem; padding-bottom: 0.2rem;">${title}</h3><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.5rem;">`;
    pairs.forEach(([t1, t2]) => {
      const p1 = state.simResults[key][t1.team_en] || 0;
      const p2 = state.simResults[key][t2.team_en] || 0;
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 6px; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
            <span style="display:flex; align-items:center; gap: 0.25rem;"><img src="${getFlagUrl(t1.fifa)}" style="width:14px;height:10px;"> ${t1.team_es}</span>
            <span style="color: var(--accent-gold);">${p1.toFixed(1)}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
            <span style="display:flex; align-items:center; gap: 0.25rem;"><img src="${getFlagUrl(t2.fifa)}" style="width:14px;height:10px;"> ${t2.team_es}</span>
            <span style="color: var(--accent-gold);">${p2.toFixed(1)}%</span>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
    container.innerHTML += html;
  };

  addRoundHTML("Dieciseisavos de Final (32 Equipos)", R32, "r32");
  addRoundHTML("Octavos de Final (16 Equipos)", R16, "r16");
  addRoundHTML("Cuartos de Final (8 Equipos)", QF, "qf");
  addRoundHTML("Semifinales (4 Equipos)", SF, "sf");
  
  // Champion info
  container.innerHTML += `
    <div style="background: var(--accent-cream); border: 2px solid var(--accent-gold); padding: 1rem; border-radius: 12px; text-align: center; margin-bottom: 2rem;">
      <h3 style="color: var(--accent-gold); margin-bottom: 0.5rem;">🏆 Campeón Proyectado</h3>
      <div style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 1.2rem; font-weight: 800;">
        <img src="${getFlagUrl(Champion.fifa)}" style="width: 24px; height: 16px; border-radius: 2px; box-shadow:0 1px 3px rgba(0,0,0,0.2);">
        <span>${Champion.team_es}</span>
        <span style="color: var(--accent-gold); font-size: 1rem;">(${state.simResults.gold[Champion.team_en].toFixed(1)}%)</span>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// Analytical Match Statistics (FMD Reference)
// ----------------------------------------------------
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
        const key = `${normalizeTeamName(f.home_es)} vs ${normalizeTeamName(f.away_es)}`;
        fixtureMap[key] = f;
      });

      // Limpiar predicciones previas en memoria
      WORLD_CUP_DATA.fixtures.forEach(f => {
        state.userPredictions[f.id] = {
          scoreHome: null,
          scoreAway: null,
          outcome: null
        };
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
    const isUnlocked = localStorage.getItem("nexos_sim_unlocked") === "true";
    const unlockTimeStr = localStorage.getItem("nexos_sim_unlock_time");

    if (isUnlocked && unlockTimeStr) {
      const elapsed = Date.now() - Number(unlockTimeStr);
      const remaining = 24 * 60 * 60 * 1000 - elapsed;

      if (remaining <= 0) {
        // Expiraron las 24 horas: bloquear sitio y borrar llaves
        localStorage.removeItem("nexos_sim_unlocked");
        localStorage.removeItem("nexos_sim_unlock_time");
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
