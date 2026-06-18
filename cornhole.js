const STORAGE_KEY = 'ch-state';
const INSTALL_HINT_KEY = 'ch-hint';
const WIN_SCORE = 21;
const BUST_SCORE = 15;
const VIBRATE_MS = 10;
const SCORE_BUMP_MS = 200;
const TEAM_DEFAULTS = ['Hold 1', 'Hold 2'];
const EMPTY_HISTORY_TEXT = 'Ingen runder endnu.';
const BUST_MESSAGE = `BUST → ${BUST_SCORE}`;
const EDIT_ROUND_TEXT = 'Ret runde';

const MODE_COPY = {
  true: {
    pill: 'Præcis 21',
    note: 'Vinder ved præcis 21 — bust sender dig tilbage til 15'
  },
  false: {
    pill: 'Mindst 21',
    note: 'Vinder ved 21 eller derover'
  }
};

const els = {
  offlineBanner: document.getElementById('offlineBanner'),
  installHint: document.getElementById('installHint'),
  dismissHintBtn: document.getElementById('dismissHintBtn'),
  nameInputs: [document.getElementById('name0'), document.getElementById('name1')],
  inputLabels: [document.getElementById('inputLabel0'), document.getElementById('inputLabel1')],
  editLabels: [document.getElementById('editLabel0'), document.getElementById('editLabel1')],
  modeBtn: document.getElementById('modeBtn'),
  modePill: document.getElementById('modePill'),
  modeInfo: document.getElementById('modeInfo'),
  boards: [document.getElementById('board0'), document.getElementById('board1')],
  scores: [document.getElementById('score0'), document.getElementById('score1')],
  busts: [document.getElementById('bust0'), document.getElementById('bust1')],
  inputs: [document.getElementById('input0'), document.getElementById('input1')],
  inputMinus: [document.getElementById('minus0'), document.getElementById('minus1')],
  inputPlus: [document.getElementById('plus0'), document.getElementById('plus1')],
  roundNum: document.getElementById('roundNum'),
  historyList: document.getElementById('historyList'),
  abortBtn: document.getElementById('abortBtn'),
  addRoundBtn: document.getElementById('addRoundBtn'),
  winModal: document.getElementById('winModal'),
  winTitle: document.getElementById('winTitle'),
  winSub: document.getElementById('winSub'),
  statsGrid: document.getElementById('statsGrid'),
  newGameBtn: document.getElementById('newGameBtn'),
  abortSheet: document.getElementById('abortSheet'),
  abortCancelBtn: document.getElementById('abortCancelBtn'),
  abortConfirmBtn: document.getElementById('abortConfirmBtn'),
  editSheet: document.getElementById('editSheet'),
  editSheetSub: document.getElementById('editSheetSub'),
  editVals: [document.getElementById('editVal0'), document.getElementById('editVal1')],
  editMinus: [document.getElementById('editMinus0'), document.getElementById('editMinus1')],
  editPlus: [document.getElementById('editPlus0'), document.getElementById('editPlus1')],
  editCancelBtn: document.getElementById('editCancelBtn'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  deleteConfirm: document.getElementById('deleteConfirm'),
  deleteBtn: document.getElementById('deleteBtn'),
  deleteCancelBtn: document.getElementById('deleteCancelBtn'),
  deleteConfirmBtn: document.getElementById('deleteConfirmBtn')
};

const state = {
  scores: [0, 0],
  input: [0, 0],
  round: 1,
  exactMode: true,
  history: [],
  gameOver: false
};

const editState = {
  input: [0, 0]
};

// Each history entry: { round, raw0, raw1, n0, n1, preScores, prevBust0, prevBust1, bust0, bust1 }

function getModeCopy(exactMode) {
  return MODE_COPY[String(exactMode)];
}

function getDefaultTeamName(index) {
  return TEAM_DEFAULTS[index];
}

function getTeamName(index) {
  return els.nameInputs[index].value || getDefaultTeamName(index);
}

function getTeamNames() {
  return [getTeamName(0), getTeamName(1)];
}

function setText(el, text) {
  el.textContent = text;
}

function setCounterTexts(elements, values) {
  elements.forEach((el, index) => setText(el, String(values[index])));
}

function setBustLabels(busts) {
  els.busts.forEach((el, index) => {
    setText(el, busts[index] ? BUST_MESSAGE : '');
  });
}

function renderMode() {
  const modeCopy = getModeCopy(state.exactMode);
  setText(els.modePill, modeCopy.pill);
  setText(els.modeInfo, modeCopy.note);
}

function renderLabels() {
  const names = getTeamNames();
  [...els.inputLabels, ...els.editLabels].forEach((el, index) => {
    setText(el, names[index % 2]);
  });
}

function updateOnlineBanner() {
  els.offlineBanner.style.display = navigator.onLine ? 'none' : 'block';
}

function shouldShowInstallHint() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    && !window.navigator.standalone
    && !localStorage.getItem(INSTALL_HINT_KEY);
}

function showInstallHint() {
  els.installHint.style.display = 'block';
}

function hideInstallHint() {
  els.installHint.style.display = 'none';
}

function dismissInstallHint() {
  hideInstallHint();
  localStorage.setItem(INSTALL_HINT_KEY, '1');
}

function getSavedState() {
  return {
    scores: state.scores,
    round: state.round,
    exactMode: state.exactMode,
    history: state.history,
    gameOver: state.gameOver,
    names: els.nameInputs.map(input => input.value)
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getSavedState()));
  } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    state.scores = saved.scores || [0, 0];
    state.round = saved.round || 1;
    state.exactMode = saved.exactMode !== undefined ? saved.exactMode : true;
    state.history = saved.history || [];
    state.gameOver = saved.gameOver || false;

    if (saved.names) {
      els.nameInputs.forEach((input, index) => {
        input.value = saved.names[index] || getDefaultTeamName(index);
      });
    }

    renderMode();
    renderLabels();
    renderInputs();
    renderBoards();
    renderHistory();
    updateAbortBtn();
    setBustLabels(getCurrentBusts());

    if (state.gameOver) {
      renderWinState();
    }
  } catch (e) {}
}

function applyRound(raw0, raw1, preScores, exactMode) {
  const n0 = Math.max(0, raw0 - raw1);
  const n1 = Math.max(0, raw1 - raw0);
  let s0 = preScores[0] + n0;
  let s1 = preScores[1] + n1;
  let bust0 = false;
  let bust1 = false;

  if (exactMode) {
    if (s0 > WIN_SCORE) {
      s0 = BUST_SCORE;
      bust0 = true;
    }
    if (s1 > WIN_SCORE) {
      s1 = BUST_SCORE;
      bust1 = true;
    }
  }

  return { n0, n1, s0, s1, bust0, bust1 };
}

function getWinner(scores, exactMode) {
  if (exactMode) {
    if (scores[0] === WIN_SCORE) return 0;
    if (scores[1] === WIN_SCORE) return 1;
    return -1;
  }

  if (scores[0] >= WIN_SCORE && scores[1] >= WIN_SCORE) {
    return scores[0] >= scores[1] ? 0 : 1;
  }
  if (scores[0] >= WIN_SCORE) return 0;
  if (scores[1] >= WIN_SCORE) return 1;
  return -1;
}

function computeGameStats(history) {
  const totalRounds = history.length;
  const totals = [0, 0];
  const bestRounds = [0, 0];
  const busts = [0, 0];
  const zeroRounds = [0, 0];
  let bestRound = { t: -1, r: 0 };

  history.forEach(roundEntry => {
    totals[0] += roundEntry.n0;
    totals[1] += roundEntry.n1;
    bestRounds[0] = Math.max(bestRounds[0], roundEntry.n0);
    bestRounds[1] = Math.max(bestRounds[1], roundEntry.n1);
    busts[0] += roundEntry.bust0 ? 1 : 0;
    busts[1] += roundEntry.bust1 ? 1 : 0;
    zeroRounds[0] += roundEntry.n0 === 0 ? 1 : 0;
    zeroRounds[1] += roundEntry.n1 === 0 ? 1 : 0;

    const roundTotal = roundEntry.n0 + roundEntry.n1;
    if (roundTotal > bestRound.t) {
      bestRound = { t: roundTotal, r: roundEntry.round };
    }
  });

  return {
    totalRounds,
    totals,
    bestRounds,
    busts,
    scoringRounds: [totalRounds - zeroRounds[0], totalRounds - zeroRounds[1]],
    bestRound
  };
}

function createStatRow(names, winner, label, values, highlightWinner) {
  return values.map((value, index) => {
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';

    const statLabel = document.createElement('div');
    statLabel.className = 'stat-label';
    statLabel.append(document.createTextNode(names[index]), document.createElement('br'), document.createTextNode(label));

    const statValue = document.createElement('div');
    statValue.className = `stat-val${highlightWinner && winner === index ? ' highlight' : ''}`;
    setText(statValue, String(value));

    statItem.appendChild(statLabel);
    statItem.appendChild(statValue);
    return statItem;
  });
}

function renderStatsGrid(names, winner, stats) {
  const fragment = document.createDocumentFragment();

  createStatRow(names, winner, 'Samlede point', stats.totals, true).forEach(item => fragment.appendChild(item));
  createStatRow(names, winner, 'Bedste runde', stats.bestRounds, false).forEach(item => fragment.appendChild(item));
  createStatRow(names, winner, 'Scoringsrunder', stats.scoringRounds, false).forEach(item => fragment.appendChild(item));

  if (state.exactMode) {
    createStatRow(names, winner, 'Busts', stats.busts, false).forEach(item => fragment.appendChild(item));
  }

  const bestRoundItem = document.createElement('div');
  bestRoundItem.className = 'stat-item stat-wide';

  const bestRoundLabel = document.createElement('div');
  bestRoundLabel.className = 'stat-label';
  setText(bestRoundLabel, 'Mest aktive runde');

  const bestRoundValue = document.createElement('div');
  bestRoundValue.className = 'stat-val';
  setText(bestRoundValue, `R${stats.bestRound.r} (${stats.bestRound.t} net-point)`);

  bestRoundItem.appendChild(bestRoundLabel);
  bestRoundItem.appendChild(bestRoundValue);
  fragment.appendChild(bestRoundItem);

  els.statsGrid.replaceChildren(fragment);
}

function getLeadingTeam(scores) {
  if (scores[0] === scores[1]) return -1;
  return scores[0] > scores[1] ? 0 : 1;
}

function getCurrentBusts() {
  const lastRound = state.history[state.history.length - 1];
  return lastRound ? [lastRound.bust0, lastRound.bust1] : [false, false];
}

function renderInputs() {
  setCounterTexts(els.inputs, state.input);
}

function renderBoards() {
  const leading = getLeadingTeam(state.scores);

  els.scores.forEach((scoreEl, index) => {
    setText(scoreEl, String(state.scores[index]));

    const boardEl = els.boards[index];
    boardEl.classList.remove('winning', 'busted', 'leading');

    if ((state.exactMode && state.scores[index] === WIN_SCORE) || (!state.exactMode && state.scores[index] >= WIN_SCORE)) {
      boardEl.classList.add('winning');
    } else if (leading === index && state.scores[index] > 0) {
      boardEl.classList.add('leading');
    }

    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), SCORE_BUMP_MS);
  });

  setText(els.roundNum, String(state.round));
}

function createHistoryEditButton() {
  const button = document.createElement('button');
  button.className = 'h-btn edt';
  button.title = EDIT_ROUND_TEXT;
  button.setAttribute('aria-label', EDIT_ROUND_TEXT);
  setText(button, '✎');
  button.addEventListener('click', showEdit);
  return button;
}

function createHistoryItem(roundEntry, isLast) {
  const item = document.createElement('div');
  item.className = `h-item${isLast ? ' latest' : ''}`;

  const round = document.createElement('span');
  round.className = 'h-rnd';
  setText(round, `R${roundEntry.round}`);

  const points0 = document.createElement('span');
  points0.className = `h-pts ${roundEntry.n0 > 0 ? 'pos' : 'zero'}`;
  setText(points0, `+${roundEntry.n0}`);

  const sep = document.createElement('span');
  sep.className = 'h-sep';
  setText(sep, '—');

  const points1 = document.createElement('span');
  points1.className = `h-pts ${roundEntry.n1 > 0 ? 'pos' : 'zero'}`;
  setText(points1, `+${roundEntry.n1}`);

  const actions = document.createElement('span');
  actions.className = 'h-actions';
  if (isLast) {
    actions.appendChild(createHistoryEditButton());
  }

  item.append(round, points0, sep, points1, actions);
  return item;
}

function renderHistory() {
  if (!state.history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-note';
    setText(empty, EMPTY_HISTORY_TEXT);
    els.historyList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  [...state.history].reverse().forEach((roundEntry, index) => {
    fragment.appendChild(createHistoryItem(roundEntry, index === 0));
  });
  els.historyList.replaceChildren(fragment);
}

function updateAbortBtn() {
  const show = (state.round > 1 || state.scores[0] > 0 || state.scores[1] > 0) && !state.gameOver;
  els.abortBtn.classList.toggle('visible', show);
}

function renderWinState() {
  const winner = getWinner(state.scores, state.exactMode);
  if (winner < 0) return;

  state.gameOver = true;

  const names = getTeamNames();
  const winnerName = names[winner];
  setText(els.winTitle, `${winnerName} vinder!`);
  setText(els.winSub, `${state.scores[winner]} point efter ${state.round - 1} runder`);

  renderStatsGrid(names, winner, computeGameStats(state.history));
  els.winModal.classList.add('active');
  updateAbortBtn();
  save();
}

function toggleMode() {
  state.exactMode = !state.exactMode;
  renderMode();
  renderBoards();
  save();
}

function change(teamIndex, delta) {
  if (state.gameOver) return;
  state.input[teamIndex] = Math.max(0, state.input[teamIndex] + delta);
  renderInputs();
}

function addRound() {
  if (state.gameOver) return;
  if (navigator.vibrate) navigator.vibrate(VIBRATE_MS);

  const raw0 = state.input[0];
  const raw1 = state.input[1];
  const preScores = [...state.scores];
  const roundResult = applyRound(raw0, raw1, preScores, state.exactMode);

  state.history.push({
    round: state.round,
    raw0,
    raw1,
    n0: roundResult.n0,
    n1: roundResult.n1,
    preScores,
    prevBust0: els.busts[0].textContent,
    prevBust1: els.busts[1].textContent,
    bust0: roundResult.bust0,
    bust1: roundResult.bust1
  });

  state.scores = [roundResult.s0, roundResult.s1];
  state.round += 1;
  state.input = [0, 0];

  renderInputs();
  setBustLabels([roundResult.bust0, roundResult.bust1]);
  renderBoards();
  renderHistory();
  updateAbortBtn();
  save();
  renderWinState();
}

function newGame() {
  state.scores = [0, 0];
  state.input = [0, 0];
  state.round = 1;
  state.history = [];
  state.gameOver = false;

  renderInputs();
  renderBoards();
  renderHistory();
  setBustLabels([false, false]);
  els.winModal.classList.remove('active');
  updateAbortBtn();
  localStorage.removeItem(STORAGE_KEY);
}

// ── Abort sheet ───────────────────────────────────────────────────────────────
function showAbort() {
  els.abortSheet.classList.add('active');
}

function hideAbort() {
  els.abortSheet.classList.remove('active');
}

function abortGame() {
  hideAbort();
  newGame();
}

// ── Edit last round ───────────────────────────────────────────────────────────
function renderEditInputs() {
  setCounterTexts(els.editVals, editState.input);
}

function showEdit() {
  if (!state.history.length) return;

  const lastRound = state.history[state.history.length - 1];
  editState.input = [lastRound.raw0, lastRound.raw1];

  renderEditInputs();
  setText(els.editSheetSub, `Runde ${lastRound.round} — ændr de kastede point`);
  renderLabels();
  els.editSheet.classList.add('active');
}

function hideEdit() {
  els.editSheet.classList.remove('active');
  els.deleteConfirm.classList.add('is-hidden');
  els.deleteBtn.classList.remove('is-hidden');
}

function editChange(teamIndex, delta) {
  editState.input[teamIndex] = Math.max(0, editState.input[teamIndex] + delta);
  renderEditInputs();
}

function saveEdit() {
  if (!state.history.length) return;

  const lastRound = state.history[state.history.length - 1];
  const roundResult = applyRound(editState.input[0], editState.input[1], lastRound.preScores, state.exactMode);

  lastRound.raw0 = editState.input[0];
  lastRound.raw1 = editState.input[1];
  lastRound.n0 = roundResult.n0;
  lastRound.n1 = roundResult.n1;
  lastRound.bust0 = roundResult.bust0;
  lastRound.bust1 = roundResult.bust1;
  state.scores = [roundResult.s0, roundResult.s1];

  setBustLabels([roundResult.bust0, roundResult.bust1]);
  hideEdit();
  renderBoards();
  renderHistory();
  save();
}

// ── Delete last round ─────────────────────────────────────────────────────────
function confirmDelete() {
  if (!state.history.length) return;

  const lastRound = state.history.pop();
  state.scores = [...lastRound.preScores];
  state.round = lastRound.round;

  hideEdit();
  setBustLabels(getCurrentBusts());
  renderBoards();
  renderHistory();
  updateAbortBtn();
  save();
}

function showDeleteConfirm() {
  els.deleteConfirm.classList.remove('is-hidden');
  els.deleteBtn.classList.add('is-hidden');
}

function hideDeleteConfirm() {
  els.deleteConfirm.classList.add('is-hidden');
  els.deleteBtn.classList.remove('is-hidden');
}

function bindEvents() {
  window.addEventListener('online', updateOnlineBanner);
  window.addEventListener('offline', updateOnlineBanner);

  els.dismissHintBtn.addEventListener('click', dismissInstallHint);
  els.nameInputs.forEach(input => {
    input.addEventListener('input', () => {
      renderLabels();
      save();
    });
  });

  els.abortBtn.addEventListener('click', showAbort);
  els.modeBtn.addEventListener('click', toggleMode);
  els.inputMinus[0].addEventListener('click', () => change(0, -1));
  els.inputPlus[0].addEventListener('click', () => change(0, 1));
  els.inputMinus[1].addEventListener('click', () => change(1, -1));
  els.inputPlus[1].addEventListener('click', () => change(1, 1));
  els.addRoundBtn.addEventListener('click', addRound);
  els.newGameBtn.addEventListener('click', newGame);
  els.abortCancelBtn.addEventListener('click', hideAbort);
  els.abortConfirmBtn.addEventListener('click', abortGame);
  els.editMinus[0].addEventListener('click', () => editChange(0, -1));
  els.editPlus[0].addEventListener('click', () => editChange(0, 1));
  els.editMinus[1].addEventListener('click', () => editChange(1, -1));
  els.editPlus[1].addEventListener('click', () => editChange(1, 1));
  els.editCancelBtn.addEventListener('click', hideEdit);
  els.saveEditBtn.addEventListener('click', saveEdit);
  els.deleteBtn.addEventListener('click', showDeleteConfirm);
  els.deleteCancelBtn.addEventListener('click', hideDeleteConfirm);
  els.deleteConfirmBtn.addEventListener('click', confirmDelete);
}

function boot() {
  updateOnlineBanner();
  renderMode();
  renderLabels();
  renderInputs();
  setBustLabels([false, false]);
  bindEvents();
  load();

  if (shouldShowInstallHint()) {
    setTimeout(showInstallHint, 2500);
  }
}

// ── PWA: Service worker registration ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── PWA: Canvas icon (fallback for apple-touch-icon / favicon) ────────────────
(function () {
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#5755d9'; x.beginPath(); x.roundRect(0, 0, 192, 192, 36); x.fill();
  x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.roundRect(16, 16, 160, 160, 24); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(96, 96, 30, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5755d9'; x.beginPath(); x.arc(96, 96, 18, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 4; x.beginPath(); x.arc(96, 96, 48, 0, Math.PI * 2); x.stroke();
  const icon = c.toDataURL('image/png');
  ['apple-touch-icon', 'icon'].forEach(r => {
    const l = document.createElement('link'); l.rel = r; l.href = icon; document.head.appendChild(l);
  });
})();

boot();
