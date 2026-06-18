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

// ── Offline banner ────────────────────────────────────────────────────────────
const offBanner = document.getElementById('offlineBanner');
function updOnline() { offBanner.style.display = navigator.onLine ? 'none' : 'block'; }
window.addEventListener('online', updOnline);
window.addEventListener('offline', updOnline);
updOnline();

// ── iOS install hint ──────────────────────────────────────────────────────────
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone && !localStorage.getItem('ch-hint')) {
  setTimeout(() => { document.getElementById('installHint').style.display = 'block'; }, 2500);
}
document.getElementById('dismissHintBtn').addEventListener('click', () => {
  document.getElementById('installHint').style.display = 'none';
  localStorage.setItem('ch-hint', '1');
});

// ── State ─────────────────────────────────────────────────────────────────────
let scores = [0, 0], inp = [0, 0], round = 1, exactMode = true, history = [], gameOver = false;
let firstStarter = 0; // hvilket hold (0 eller 1) starter runde 1 — runder alternerer herfra

// Each history entry: { round, raw0, raw1, n0, n1, preScores, prevBust0, prevBust1, bust0, bust1 }

function starterForRound(r) {
  return (firstStarter + (r - 1)) % 2;
}

function save() {
  try {
    localStorage.setItem('ch-state', JSON.stringify({
      scores, round, exactMode, history, gameOver, firstStarter,
      names: [document.getElementById('name0').value, document.getElementById('name1').value]
    }));
  } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem('ch-state'); if (!raw) return;
    const s = JSON.parse(raw);
    scores = s.scores || [0, 0]; round = s.round || 1;
    exactMode = s.exactMode !== undefined ? s.exactMode : true;
    history = s.history || []; gameOver = s.gameOver || false;
    firstStarter = s.firstStarter !== undefined ? s.firstStarter : 0;
    if (s.names) {
      document.getElementById('name0').value = s.names[0] || 'Hold 1';
      document.getElementById('name1').value = s.names[1] || 'Hold 2';
    }
    document.getElementById('modePill').textContent = exactMode ? 'Præcis 21' : 'Mindst 21';
    document.getElementById('modeInfo').textContent = exactMode
      ? 'Vinder ved præcis 21 — bust sender dig tilbage til 15'
      : 'Vinder ved 21 eller derover';
    syncLabels(); renderBoards(); renderHistory(); renderStarter(); renderBags(); updateAbortBtn();
    if (gameOver) checkWin();
  } catch (e) {}
}

function syncLabels() {
  const n0 = document.getElementById('name0').value || 'Hold 1';
  const n1 = document.getElementById('name1').value || 'Hold 2';
  document.getElementById('inputLabel0').textContent = n0;
  document.getElementById('inputLabel1').textContent = n1;
  document.getElementById('editLabel0').textContent = n0;
  document.getElementById('editLabel1').textContent = n1;
  renderStarter();
  renderBags();
}
document.getElementById('name0').addEventListener('input', () => { syncLabels(); save(); });
document.getElementById('name1').addEventListener('input', () => { syncLabels(); save(); });

// ── Starter indicator ─────────────────────────────────────────────────────────
function renderStarter() {
  const s = starterForRound(round);
  const n0 = document.getElementById('name0').value || 'Hold 1';
  const n1 = document.getElementById('name1').value || 'Hold 2';
  const sName = s === 0 ? n0 : n1;
  document.getElementById('starterText').textContent = sName + ' starter';
  document.getElementById('board0').classList.toggle('is-starter', s === 0);
  document.getElementById('board1').classList.toggle('is-starter', s === 1);
}

function toggleStarter() {
  if (gameOver) return;
  // Skifter hvem der starter den AKTUELLE runde, ved at flippe firstStarter
  // (eftersom starter alternerer strikt, flipper dette starteren for alle fremtidige runder fra nu af også,
  // hvilket er den forventede effekt hvis man har tastet forkert ind).
  firstStarter = 1 - firstStarter;
  renderStarter(); save();
}
document.getElementById('starterBanner').addEventListener('click', toggleStarter);
document.getElementById('starterBanner').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStarter(); }
});

// ── Game logic ────────────────────────────────────────────────────────────────
function toggleMode() {
  exactMode = !exactMode;
  document.getElementById('modePill').textContent = exactMode ? 'Præcis 21' : 'Mindst 21';
  document.getElementById('modeInfo').textContent = exactMode
    ? 'Vinder ved præcis 21 — bust sender dig tilbage til 15'
    : 'Vinder ved 21 eller derover';
  renderBoards(); save();
}

// ── Bag tapper state ──────────────────────────────────────────────────────────
// bagState[team][bag]: 0 = empty, 1 = board (1pt), 3 = hole (3pt)
let bagState = [[0,0,0,0],[0,0,0,0]];
const BAG_CYCLE = [0, 1, 3]; // empty → board → hole → empty

function bagTotal(team) {
  return bagState[team].reduce((s, v) => s + v, 0);
}

function renderBags() {
  for (let t = 0; t < 2; t++) {
    const btns = document.querySelectorAll(`.bag-btn[data-team="${t}"]`);
    let total = 0;
    btns.forEach((btn, i) => {
      const v = bagState[t][i];
      total += v;
      btn.dataset.state = v;
      if (v === 0)      { btn.textContent = '⬛'; btn.setAttribute('aria-label', `Hold ${t+1} pose ${i+1}: tom`); }
      else if (v === 1) { btn.textContent = '🟫'; btn.setAttribute('aria-label', `Hold ${t+1} pose ${i+1}: på brættet (1)`); }
      else              { btn.textContent = '🕳️'; btn.setAttribute('aria-label', `Hold ${t+1} pose ${i+1}: i hullet (3)`); }
    });
    inp[t] = total;
    document.getElementById('bagPreview' + t).textContent = total + (total === 1 ? ' point' : ' point');
  }
  // Net preview
  const net0 = Math.max(0, inp[0] - inp[1]);
  const net1 = Math.max(0, inp[1] - inp[0]);
  const netEl = document.getElementById('bagNetPreview');
  if (inp[0] === 0 && inp[1] === 0) {
    netEl.textContent = '';
  } else if (net0 === 0 && net1 === 0) {
    netEl.textContent = 'Udligner — 0 net til begge';
  } else {
    const n0 = document.getElementById('name0').value || 'Hold 1';
    const n1 = document.getElementById('name1').value || 'Hold 2';
    const parts = [];
    if (net0 > 0) parts.push(`${n0} +${net0}`);
    if (net1 > 0) parts.push(`${n1} +${net1}`);
    netEl.textContent = 'Net: ' + parts.join(' · ');
  }
}

function tapBag(team, bag) {
  if (gameOver) return;
  if (navigator.vibrate) navigator.vibrate(8);
  const cur = bagState[team][bag];
  const idx = BAG_CYCLE.indexOf(cur);
  bagState[team][bag] = BAG_CYCLE[(idx + 1) % BAG_CYCLE.length];
  renderBags();
}

function resetBags() {
  bagState = [[0,0,0,0],[0,0,0,0]];
  inp = [0, 0];
  renderBags();
}

function applyRound(raw0, raw1, preScores) {
  const n0 = Math.max(0, raw0 - raw1), n1 = Math.max(0, raw1 - raw0);
  let s0 = preScores[0] + n0, s1 = preScores[1] + n1;
  let bust0 = false, bust1 = false;
  if (exactMode) {
    if (s0 > 21) { s0 = 15; bust0 = true; }
    if (s1 > 21) { s1 = 15; bust1 = true; }
  }
  return { n0, n1, s0, s1, bust0, bust1 };
}

function addRound() {
  if (gameOver) return;
  if (navigator.vibrate) navigator.vibrate(10);
  const raw0 = inp[0], raw1 = inp[1];
  const pre = [...scores];
  const { n0, n1, s0, s1, bust0, bust1 } = applyRound(raw0, raw1, pre);
  const prevBust0 = document.getElementById('bust0').textContent;
  const prevBust1 = document.getElementById('bust1').textContent;
  history.push({ round, raw0, raw1, n0, n1, preScores: pre, prevBust0, prevBust1, bust0, bust1, starter: starterForRound(round) });
  scores = [s0, s1]; round++;
  resetBags();
  document.getElementById('bust0').textContent = bust0 ? 'BUST → 15' : '';
  document.getElementById('bust1').textContent = bust1 ? 'BUST → 15' : '';
  renderBoards(); renderHistory(); renderStarter(); updateAbortBtn(); save(); checkWin();
}

function renderBoards() {
  const leading = scores[0] === scores[1] ? -1 : (scores[0] > scores[1] ? 0 : 1);
  for (let i = 0; i < 2; i++) {
    const el = document.getElementById('score' + i);
    const b = document.getElementById('board' + i);
    el.textContent = scores[i];
    b.classList.remove('winning', 'busted', 'leading');
    if (exactMode && scores[i] === 21) b.classList.add('winning');
    else if (!exactMode && scores[i] >= 21) b.classList.add('winning');
    else if (leading === i && scores[i] > 0) b.classList.add('leading');
    el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 200);
  }
  document.getElementById('roundNum').textContent = round;
}

function renderHistory() {
  const l = document.getElementById('historyList'); l.innerHTML = '';
  if (!history.length) { l.innerHTML = '<div class="empty-note">Ingen runder endnu.</div>'; return; }
  [...history].reverse().forEach((h, idx) => {
    const isLast = (idx === 0);
    const startMark = h.starter === 0
      ? '<span class="h-starter-dot" title="Hold 1 startede"></span>'
      : (h.starter === 1 ? '<span class="h-starter-dot" title="Hold 2 startede" style="margin-left:auto"></span>' : '');
    const d = document.createElement('div');
    d.className = 'h-item' + (isLast ? ' latest' : '');
    d.innerHTML = `
      <span class="h-rnd">R${h.round}</span>
      <span class="h-pts ${h.n0 > 0 ? 'pos' : 'zero'}">+${h.n0}</span>
      <span class="h-sep">—</span>
      <span class="h-pts ${h.n1 > 0 ? 'pos' : 'zero'}">+${h.n1}</span>
      <span class="h-actions">${isLast ? '<button class="h-btn edt" title="Ret runde">✎</button>' : ''}</span>`;
    if (isLast) {
      d.querySelector('.h-btn.edt').addEventListener('click', showEdit);
    }
    l.appendChild(d);
  });
}

function checkWin() {
  let w = -1;
  if (exactMode) {
    if (scores[0] === 21) w = 0; else if (scores[1] === 21) w = 1;
  } else {
    if (scores[0] >= 21 && scores[1] >= 21) w = scores[0] >= scores[1] ? 0 : 1;
    else if (scores[0] >= 21) w = 0;
    else if (scores[1] >= 21) w = 1;
  }
  if (w < 0) return;

  gameOver = true;
  const name0 = document.getElementById('name0').value || 'Hold 1';
  const name1 = document.getElementById('name1').value || 'Hold 2';
  const wName = w === 0 ? name0 : name1;
  document.getElementById('winTitle').textContent = wName + ' vinder!';
  document.getElementById('winSub').textContent = scores[w] + ' point efter ' + (round - 1) + ' runder';

  const totalRounds = history.length;
  const tot0 = history.reduce((s, h) => s + h.n0, 0);
  const tot1 = history.reduce((s, h) => s + h.n1, 0);
  const best0 = history.reduce((m, h) => Math.max(m, h.n0), 0);
  const best1 = history.reduce((m, h) => Math.max(m, h.n1), 0);
  const busts0 = history.filter(h => h.bust0).length;
  const busts1 = history.filter(h => h.bust1).length;
  const zeros0 = history.filter(h => h.n0 === 0).length;
  const zeros1 = history.filter(h => h.n1 === 0).length;
  const bestRound = history.reduce((b, h) => {
    const t = h.n0 + h.n1; return t > b.t ? { t, r: h.round } : b;
  }, { t: -1, r: 0 });

  function statRow(label, v0, v1, highlightWinner = false) {
    const h0 = highlightWinner && w === 0, h1 = highlightWinner && w === 1;
    return `
      <div class="stat-item">
        <div class="stat-label">${name0}<br>${label}</div>
        <div class="stat-val ${h0 ? 'highlight' : ''}">${v0}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">${name1}<br>${label}</div>
        <div class="stat-val ${h1 ? 'highlight' : ''}">${v1}</div>
      </div>`;
  }

  document.getElementById('statsGrid').innerHTML =
    statRow('Samlede point', tot0, tot1, true) +
    statRow('Bedste runde', best0, best1) +
    statRow('Scoringsrunder', totalRounds - zeros0, totalRounds - zeros1) +
    (exactMode ? statRow('Busts', busts0, busts1) : '') +
    `<div class="stat-item stat-wide">
       <div class="stat-label">Mest aktive runde</div>
       <div class="stat-val">R${bestRound.r} (${bestRound.t} net-point)</div>
     </div>`;

  document.getElementById('winModal').classList.add('active');
  updateAbortBtn(); save();
}

function newGame() {
  scores = [0, 0]; inp = [0, 0]; round = 1; history = []; gameOver = false; firstStarter = 0;
  ['score0', 'score1'].forEach(id => { document.getElementById(id).textContent = '0'; });
  ['board0', 'board1'].forEach(id => { document.getElementById(id).classList.remove('winning', 'busted', 'leading'); });
  ['bust0', 'bust1'].forEach(id => { document.getElementById(id).textContent = ''; });
  document.getElementById('roundNum').textContent = '1';
  document.getElementById('winModal').classList.remove('active');
  resetBags();
  renderHistory(); renderStarter(); updateAbortBtn(); localStorage.removeItem('ch-state');
}

function updateAbortBtn() {
  const show = (round > 1 || scores[0] > 0 || scores[1] > 0) && !gameOver;
  document.getElementById('abortBtn').classList.toggle('visible', show);
}

// ── Abort sheet ───────────────────────────────────────────────────────────────
function showAbort() { document.getElementById('abortSheet').classList.add('active'); }
function hideAbort() { document.getElementById('abortSheet').classList.remove('active'); }
function abortGame() { hideAbort(); newGame(); }

// ── Edit last round ───────────────────────────────────────────────────────────
let editInp = [0, 0];

function showEdit() {
  if (!history.length) return;
  const h = history[history.length - 1];
  editInp = [h.raw0, h.raw1];
  document.getElementById('editVal0').textContent = editInp[0];
  document.getElementById('editVal1').textContent = editInp[1];
  document.getElementById('editSheetSub').textContent = 'Runde ' + h.round + ' — ændr de kastede point';
  syncLabels();
  document.getElementById('editSheet').classList.add('active');
}

function hideEdit() {
  document.getElementById('editSheet').classList.remove('active');
  document.getElementById('deleteConfirm').classList.add('is-hidden');
  document.getElementById('deleteBtn').classList.remove('is-hidden');
}

function editChange(t, d) {
  editInp[t] = Math.max(0, editInp[t] + d);
  document.getElementById('editVal' + t).textContent = editInp[t];
}

function saveEdit() {
  if (!history.length) return;
  const h = history[history.length - 1];
  const { n0, n1, s0, s1, bust0, bust1 } = applyRound(editInp[0], editInp[1], h.preScores);
  h.raw0 = editInp[0]; h.raw1 = editInp[1]; h.n0 = n0; h.n1 = n1; h.bust0 = bust0; h.bust1 = bust1;
  scores = [s0, s1];
  document.getElementById('bust0').textContent = bust0 ? 'BUST → 15' : '';
  document.getElementById('bust1').textContent = bust1 ? 'BUST → 15' : '';
  hideEdit();
  renderBoards(); renderHistory(); save();
}

// ── Delete last round ─────────────────────────────────────────────────────────
function confirmDelete() {
  if (!history.length) return;
  const h = history.pop();
  scores = [...h.preScores];
  round = h.round;
  const prev = history[history.length - 1];
  document.getElementById('bust0').textContent = prev ? (prev.bust0 ? 'BUST → 15' : '') : '';
  document.getElementById('bust1').textContent = prev ? (prev.bust1 ? 'BUST → 15' : '') : '';
  hideEdit();
  renderBoards(); renderHistory(); renderStarter(); updateAbortBtn(); save();
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('abortBtn').addEventListener('click', showAbort);
document.getElementById('modeBtn').addEventListener('click', toggleMode);
document.querySelectorAll('.bag-btn').forEach(btn => {
  btn.addEventListener('click', () => tapBag(+btn.dataset.team, +btn.dataset.bag));
});
document.getElementById('addRoundBtn').addEventListener('click', addRound);
document.getElementById('newGameBtn').addEventListener('click', newGame);
document.getElementById('abortCancelBtn').addEventListener('click', hideAbort);
document.getElementById('abortConfirmBtn').addEventListener('click', abortGame);
document.getElementById('editMinus0').addEventListener('click', () => editChange(0, -1));
document.getElementById('editPlus0').addEventListener('click', () => editChange(0, 1));
document.getElementById('editMinus1').addEventListener('click', () => editChange(1, -1));
document.getElementById('editPlus1').addEventListener('click', () => editChange(1, 1));
document.getElementById('editCancelBtn').addEventListener('click', hideEdit);
document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
document.getElementById('deleteBtn').addEventListener('click', () => {
  document.getElementById('deleteConfirm').classList.remove('is-hidden');
  document.getElementById('deleteBtn').classList.add('is-hidden');
});
document.getElementById('deleteCancelBtn').addEventListener('click', () => {
  document.getElementById('deleteConfirm').classList.add('is-hidden');
  document.getElementById('deleteBtn').classList.remove('is-hidden');
});
document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);

// ── Boot ──────────────────────────────────────────────────────────────────────
renderBags();
load();
