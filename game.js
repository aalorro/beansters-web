'use strict';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const KEY = 'numeral-loom-v1';
const OPS_ALL = ['+', '−', '×', '÷'];

let save = { max: 1, cur: 1, score: 0, stars: {}, username: '', timeout: null };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && s.max) save = Object.assign(save, s);
} catch (e) {}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Puzzle parameters & generation
// ---------------------------------------------------------------------------

// Piecewise linear interpolation over [x, y] breakpoints
function lerp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const t = (x - pts[i-1][0]) / (pts[i][0] - pts[i-1][0]);
      return pts[i-1][1] + t * (pts[i][1] - pts[i-1][1]);
    }
  }
  return pts[pts.length - 1][1];
}

// Difficulty score: 1.0 (easiest) → 10.0 (hardest)
// Internal difficulty table mapped from level
//   1.0 — 3×3, + and − only, few blanks
//   2.0 — × introduced
//   3.0 — ÷ and decoy tiles
//   4.0 — 4×4 grid, higher numbers
//   5.0 — blank operators (?)
//   6.0 — more hidden ops, harder numbers
//   7.0 — 5×5 grid, negatives
//   8.0 — more decoys and blanks
//   9.0 — 6×6 grid
//  10.0 — near-total blank grid, max decoys
function levelDifficulty(L) {
  return Math.round(lerp(L, [
    [ 1, 1.0], [ 3, 1.5], [ 6, 2.0], [10, 3.0],
    [15, 4.0], [20, 5.0], [30, 6.5], [45, 8.0],
    [60, 9.0], [80, 10.0],
  ]) * 10) / 10;
}

// Puzzle parameters derived from difficulty score (not level directly)
function params(diff) {
  const d = Math.max(1, Math.min(10, diff));
  const N         = d < 4 ? 3 : d < 7 ? 4 : d < 9 ? 5 : 6;
  const maxNum    = Math.round(lerp(d, [[1,9],[4,12],[6,15],[8,18],[10,20]]));
  const ops       = d < 2 ? ['+','−'] : d < 3 ? ['+','−','×'] : OPS_ALL.slice();
  const blankFrac = lerp(d, [[1,0.30],[3,0.50],[6,0.65],[10,0.90]]);
  const decoys    = Math.round(lerp(d, [[1,0],[3,1],[6,2],[8,3],[10,5]]));
  const hiddenFrac= lerp(d, [[1,0],[4.5,0],[5,0.10],[7,0.25],[10,0.60]]);
  const neg       = d >= 7;
  const cap       = Math.round(lerp(d, [[1,60],[5,150],[10,360]]));
  return { N, maxNum, ops, blankFrac, decoys, hiddenFrac, neg, cap };
}

function apply(a, op, b) {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  if (b === 0 || a % b !== 0) return NaN;
  return a / b;
}

function intro(L) {
  if (L === 1) return '<b>Welcome.</b> Place tiles so every row and column hits its target. Work strictly left to right and top to bottom.';
  const d = levelDifficulty(L);
  const prev = levelDifficulty(Math.max(1, L - 1));
  const msgs = [];
  if (d >= 2.0 && prev < 2.0) msgs.push('<b>New:</b> multiplication (×). No precedence — each step uses the running total.');
  if (d >= 3.0 && prev < 3.0) msgs.push('<b>New:</b> division (÷) and decoy tiles — one or more beans in the tray fit nowhere.');
  if (d >= 4.0 && prev < 4.0) msgs.push('<b>New:</b> the grid grows to 4 × 4.');
  if (d >= 5.0 && prev < 5.0) msgs.push('<b>New:</b> blank operators — tap a ? sign to cycle through + − × ÷.');
  if (d >= 7.0 && prev < 7.0) msgs.push('<b>New:</b> negative numbers and a 5 × 5 grid.');
  if (d >= 9.0 && prev < 9.0) msgs.push('<b>New:</b> a 6 × 6 grid — maximum complexity.');
  return msgs.length ? msgs.join(' ') : null;
}

function generate(L) {
  const seed = (Date.now() ^ (Math.random() * 0x100000000 | 0)) >>> 0;
  const R = rng(seed);
  const diff = levelDifficulty(L);
  const p = params(diff);
  const N = p.N;
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pickW = c => {
    let s = c.reduce((t, x) => t + x[1], 0);
    let r = R() * s;
    for (const x of c) { r -= x[1]; if (r <= 0) return x[0]; }
    return c[c.length - 1][0];
  };

  function line(vals, used) {
    let v = vals[0];
    const ops = [];
    for (let i = 1; i < vals.length; i++) {
      const x = vals[i];
      const c = [['+', 1]];
      if (p.neg || v - x >= 0) c.push(['−', 1]);
      if (p.ops.includes('×') && x > 1 && v !== 0 && Math.abs(v * x) <= p.cap) c.push(['×', 1.3]);
      if (p.ops.includes('÷') && x > 1 && v !== 0 && v % x === 0) c.push(['÷', 2.4]);
      const op = pickW(c);
      used.add(op);
      v = apply(v, op, x);
      ops.push(op);
    }
    return { ops, v };
  }

  let best = null;
  for (let a = 0; a < 80; a++) {
    const nums = [...Array(N)].map(() => [...Array(N)].map(() => ri(1, p.maxNum)));
    const used = new Set(), ops = {}, rowT = [], colT = [];
    for (let r = 0; r < N; r++) {
      const o = line(nums[r], used);
      o.ops.forEach((op, c) => ops['r' + r + '_' + c] = op);
      rowT.push(o.v);
    }
    for (let c = 0; c < N; c++) {
      const o = line(nums.map(row => row[c]), used);
      o.ops.forEach((op, r) => ops['c' + c + '_' + r] = op);
      colT.push(o.v);
    }
    best = { nums, ops, rowT, colT };
    if (p.ops.every(o => used.has(o))) break;
  }

  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push([r, c]);
  const k = Math.max(2, Math.round(N * N * p.blankFrac));
  const blanks = new Set(shuffle(cells).slice(0, k).map(([r, c]) => r + ',' + c));
  const tileVals = [...blanks].map(s => {
    const [r, c] = s.split(',').map(Number);
    return best.nums[r][c];
  });
  for (let i = 0; i < p.decoys; i++) tileVals.push(ri(1, p.maxNum));
  tileVals.sort((a, b) => a - b);

  const slots = shuffle(Object.keys(best.ops));
  const hidden = new Set(slots.slice(0, Math.round(slots.length * p.hiddenFrac)));
  const nBlank = blanks.size;

  return Object.assign(best, {
    L, N, p, blanks, tileVals, hidden, diff,
    par: Math.round(25 + nBlank * 11 + hidden.size * 9 + p.decoys * 6),
  });
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let S;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------
// Audio & splash
// ---------------------------------------------------------------------------

const WIN_PHRASES = [
  'Awesome!', 'Incredible!', 'Brilliant!', 'Outstanding!', 'Magnificent!',
  'Sensational!', 'Genius!', 'Spectacular!', 'Phenomenal!', 'Legendary!',
];
const SAD_PHRASES = [
  "Better luck\nnext time!", "Don't be\ndiscouraged!", "You'll get\nthe next one!",
  "Keep at it!", "Practice makes\nperfect!",
];
const TIMEOUT_MS = 5 * 60 * 1000;

let _actx;
function actx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}

function sfxCorrect() {
  try {
    const c = actx(), t = c.currentTime;
    [523.25, 783.99].forEach((hz, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t + i * 0.13);
      g.gain.linearRampToValueAtTime(0.28, t + i * 0.13 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.38);
      o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.4);
    });
  } catch (e) {}
}

function sfxWin() {
  try {
    const c = actx(), t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'triangle'; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.7);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.72);
    });
  } catch (e) {}
}

function sfxSad() {
  try {
    const c = actx(), t = c.currentTime;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 900;
    flt.connect(c.destination);
    [[466,349,0.0,0.42],[415,311,0.47,0.42],[392,293,0.94,0.42],[349,174,1.41,0.75]].forEach(([from,to,d,dur]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(flt);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(from, t + d);
      o.frequency.linearRampToValueAtTime(to, t + d + dur);
      g.gain.setValueAtTime(0, t + d);
      g.gain.linearRampToValueAtTime(0.2, t + d + 0.06);
      g.gain.linearRampToValueAtTime(0.16, t + d + dur - 0.06);
      g.gain.linearRampToValueAtTime(0, t + d + dur);
      o.start(t + d); o.stop(t + d + dur + 0.05);
    });
  } catch (e) {}
}

function sfxCrash() {
  try {
    const c = actx(), t = c.currentTime;
    // Noise burst (buzzer texture)
    const buf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 280; bpf.Q.value = 0.5;
    const ng = c.createGain();
    noise.connect(bpf); bpf.connect(ng); ng.connect(c.destination);
    ng.gain.setValueAtTime(0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    noise.start(t); noise.stop(t + 0.25);
    // Low descending thud
    const o = c.createOscillator(), og = c.createGain();
    o.connect(og); og.connect(c.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    og.gain.setValueAtTime(0.35, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.start(t); o.stop(t + 0.22);
  } catch (e) {}
}

function showSplash(msg, type, duration) {
  const el = $('splash');
  el.innerHTML = `<div class="splash-text ${type}">${msg.replace(/\n/g, '<br>')}</div>`;
  el.hidden = false;
  el.firstChild.style.animationDuration = duration + 'ms';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, duration);
}

function enterTimeout() {
  save.timeout = Date.now();
  persist();
  $('timeout').hidden = false;
  tickTimeout();
}

function tickTimeout() {
  if ($('timeout').hidden) return;
  const rem = Math.max(0, TIMEOUT_MS - (Date.now() - save.timeout));
  $('timeoutTimer').textContent = clock(Math.ceil(rem / 1000));
  if (rem <= 0) {
    save.timeout = null; persist();
    $('timeout').hidden = true;
    start(save.cur || 1);
  } else {
    setTimeout(tickTimeout, 1000);
  }
}

function start(L) {
  const g = generate(L);
  S = {
    g, L,
    tiles: g.tileVals.map((v, i) => ({ id: i, v, at: null })),
    place: {}, locked: new Set(), opPick: {},
    sel: null, armed: null,
    hints: 0, elapsed: 0, done: false, started: false,
    lives: 3, prevOk: new Set(), prevWrong: new Set(),
  };
  save.cur = L;
  persist();
  $('win').hidden = true;
  const sp = $('splash'); sp.hidden = true; clearTimeout(sp._timer);
  const b = intro(L);
  $('banner').hidden = !b;
  if (b) $('banner').innerHTML = b;
  // Auto-open help on very first visit
  if (save.max === 1 && L === 1) $('help').hidden = false;
  render();
}

function val(r, c) {
  const k = r + ',' + c;
  if (!S.g.blanks.has(k)) return S.g.nums[r][c];
  const t = S.place[k];
  return t == null ? null : S.tiles[t].v;
}

function opAt(s) {
  return S.g.hidden.has(s) ? (S.opPick[s] || null) : S.g.ops[s];
}

function evalLine(vals, ops) {
  if (vals.some(v => v == null) || ops.some(o => o == null)) return null;
  let v = vals[0];
  for (let i = 0; i < ops.length; i++) {
    v = apply(v, ops[i], vals[i + 1]);
    if (Number.isNaN(v)) return NaN;
  }
  return v;
}

function rowRes(r) {
  const N = S.g.N;
  return evalLine(
    [...Array(N)].map((_, c) => val(r, c)),
    [...Array(N - 1)].map((_, c) => opAt('r' + r + '_' + c))
  );
}

function colRes(c) {
  const N = S.g.N;
  return evalLine(
    [...Array(N)].map((_, r) => val(r, c)),
    [...Array(N - 1)].map((_, r) => opAt('c' + c + '_' + r))
  );
}

const clock = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const fmt = n => n < 0 ? '−' + Math.abs(n) : String(n);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function targetHTML(t, res, cls, u) {
  const s = fmt(t);
  const fs = Math.min(u * 0.42, u * 1.35 / (s.length * 0.62));
  let st = '', sub = '';
  if (res !== null) {
    if (res === t) {
      st = ' ok';
    } else {
      st = ' bad';
      sub = '<small>' + (Number.isNaN(res) ? 'not whole' : 'now ' + fmt(res)) + '</small>';
    }
  }
  return `<div class="t ${cls}${st}" style="font-size:${fs.toFixed(2)}cqi">${s}${sub}</div>`;
}

function opHTML(s, cls) {
  if (!S.g.hidden.has(s)) return `<div class="op ${cls}">${S.g.ops[s]}</div>`;
  const v = S.opPick[s], lk = S.locked.has('op:' + s);
  return `<div class="op ${cls}"><button type="button" class="hop${v ? '' : ' empty'}${lk ? ' locked' : ''}" data-op="${s}" aria-label="Operator, ${v || 'blank'}">${v || '?'}</button></div>`;
}

function render() {
  const g = S.g, N = g.N;
  const tot = N + (N - 1) * 0.5 + 0.5 + 1.4;
  const cols = 2 * N + 1;
  const u = (100 - 1.1 * (cols - 1)) / tot;
  const board = $('board');
  board.style.setProperty('--u', u.toFixed(3));

  const tmpl = [];
  for (let i = 0; i < 2 * N - 1; i++) tmpl.push(i % 2 ? '.5fr' : '1fr');
  tmpl.push('.5fr', '1.4fr');
  board.style.gridTemplateColumns = tmpl.join(' ');

  let h = '';
  for (let gr = 0; gr < 2 * N + 1; gr++) {
    for (let gc = 0; gc < 2 * N + 1; gc++) {
      if (gr < 2 * N - 1 && gr % 2 === 0) {
        const r = gr / 2;
        if (gc < 2 * N - 1 && gc % 2 === 0) {
          const c = gc / 2, k = r + ',' + c;
          if (!g.blanks.has(k)) {
            h += `<div class="n fixed">${g.nums[r][c]}</div>`;
          } else {
            const t = S.place[k], lk = S.locked.has(k);
            const bn = t != null ? ` data-bean="${S.tiles[t].id % 8}"` : '';
            const dr = t != null && !lk ? ' draggable="true"' : '';
            h += `<button type="button" class="n slot${t != null ? ' filled' : ''}${lk ? ' locked' : ''}${S.armed === k ? ' armed' : ''}"${bn}${dr} data-cell="${k}" aria-label="Row ${r + 1} column ${c + 1}${t != null ? ', ' + S.tiles[t].v : ', empty'}">${t != null ? S.tiles[t].v : ''}</button>`;
          }
        } else if (gc < 2 * N - 1) {
          h += opHTML('r' + r + '_' + ((gc - 1) / 2), 'row-op');
        } else if (gc === 2 * N - 1) {
          h += '<div class="eq">=</div>';
        } else {
          h += targetHTML(g.rowT[r], rowRes(r), 'rt', u);
        }
      } else if (gr < 2 * N - 1) {
        const r = (gr - 1) / 2;
        h += (gc < 2 * N - 1 && gc % 2 === 0) ? opHTML('c' + (gc / 2) + '_' + r, 'vop') : '<div></div>';
      } else if (gr === 2 * N - 1) {
        h += (gc < 2 * N - 1 && gc % 2 === 0) ? '<div class="eq veq"><span>=</span></div>' : '<div></div>';
      } else {
        h += (gc < 2 * N - 1 && gc % 2 === 0) ? targetHTML(g.colT[gc / 2], colRes(gc / 2), 'vt', u) : '<div></div>';
      }
    }
  }
  board.innerHTML = h;

  const free = S.tiles.filter(t => t.at == null);
  $('tray').innerHTML = free.length
    ? free.map(t => `<button type="button" class="tile${S.sel === t.id ? ' sel' : ''}" data-tile="${t.id}" data-bean="${t.id % 8}" draggable="true">${t.v}</button>`).join('')
    : '<span class="none">All beans placed!</span>';

  $('trayNote').textContent = g.p.decoys
    ? `${g.p.decoys} decoy${g.p.decoys > 1 ? 's' : ''} hidden among ${S.tiles.length}`
    : `${S.tiles.length} beans`;

  const p = g.p;
  $('chips').innerHTML =
    `<span class="chip">Difficulty <strong>${S.g.diff.toFixed(1)}/10</strong></span>` +
    `<span class="chip">Grid <strong>${N}×${N}</strong></span>` +
    `<span class="chip">Ops <strong>${p.ops.join(' ')}</strong></span>` +
    `<span class="chip">Numbers <strong>1–${p.maxNum}</strong></span>` +
    (g.hidden.size ? `<span class="chip">Blank signs <strong>${g.hidden.size}</strong></span>` : '') +
    (p.neg ? '<span class="chip">Negatives <strong>on</strong></span>' : '') +
    `<span class="chip">Par <strong>${clock(g.par)}</strong></span>` +
    (save.stars[S.L] ? `<span class="chip">Best <strong>${'★'.repeat(save.stars[S.L])}</strong></span>` : '');

  $('sName').textContent = save.username || '—';
  $('sLevel').textContent = S.L;
  $('sTime').textContent = clock(S.elapsed);
  $('sLives').textContent = '♥'.repeat(S.lives) + '♡'.repeat(Math.max(0, 3 - S.lives));
  $('sScore').textContent = save.score;
  $('bHint').textContent = 'Hint' + (S.hints ? ` (${S.hints} used)` : '');
  $('bHint').disabled = S.done;
  $('bPrev').disabled = S.L <= 1;
  $('bNext').disabled = S.L >= save.max;
  $('lvlInput').max = save.max;
  $('lvlInput').placeholder = S.L;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function unplace(id) {
  const t = S.tiles[id];
  if (t.at != null) { delete S.place[t.at]; t.at = null; }
}

function placeTile(id, k) {
  if (!S.started) S.started = true;
  unplace(id);
  if (S.place[k] != null) unplace(S.place[k]);
  S.place[k] = id;
  S.tiles[id].at = k;
}

function onCell(k) {
  if (S.done || S.locked.has(k)) return;
  if (S.sel != null) {
    placeTile(S.sel, k);
    S.sel = null; S.armed = null;
  } else if (S.place[k] != null) {
    const id = S.place[k];
    unplace(id);
    S.sel = id; S.armed = null;
  } else {
    S.armed = S.armed === k ? null : k;
  }
  after();
}

function onTile(id) {
  if (S.done) return;
  if (S.armed) {
    placeTile(id, S.armed);
    S.armed = null; S.sel = null;
  } else {
    S.sel = S.sel === id ? null : id;
  }
  after();
}

function onOp(s) {
  if (S.done || S.locked.has('op:' + s)) return;
  if (!S.started) S.started = true;
  const pool = S.g.p.ops, cur = S.opPick[s];
  S.opPick[s] = cur ? pool[(pool.indexOf(cur) + 1) % pool.length] : pool[0];
  after();
}

function solved() {
  const N = S.g.N;
  for (let r = 0; r < N; r++) if (rowRes(r) !== S.g.rowT[r]) return false;
  for (let c = 0; c < N; c++) if (colRes(c) !== S.g.colT[c]) return false;
  return true;
}

function after() {
  const N = S.g.N;
  const nowOk = new Set(), nowWrong = new Set();
  for (let r = 0; r < N; r++) {
    const res = rowRes(r);
    if (res === S.g.rowT[r]) nowOk.add('r' + r);
    else if (res !== null) nowWrong.add('r' + r);
  }
  for (let c = 0; c < N; c++) {
    const res = colRes(c);
    if (res === S.g.colT[c]) nowOk.add('c' + c);
    else if (res !== null) nowWrong.add('c' + c);
  }
  const newlyOk = [...nowOk].filter(k => !S.prevOk.has(k));
  const newlyWrong = [...nowWrong].filter(k => !S.prevWrong.has(k));
  S.prevOk = nowOk; S.prevWrong = nowWrong;
  if (!S.done && newlyWrong.length) S.lives = Math.max(0, S.lives - 1);
  render();
  if (!S.done && solved()) {
    win();
  } else if (!S.done && newlyOk.length) {
    sfxCorrect();
    showSplash(WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)], 'ok', 1100);
  } else if (!S.done && newlyWrong.length) {
    sfxCrash();
    if (S.lives <= 0) {
      S.done = true;
      setTimeout(() => {
        sfxSad();
        showSplash(SAD_PHRASES[Math.floor(Math.random() * SAD_PHRASES.length)], 'sad', 2400);
        setTimeout(enterTimeout, 2400);
      }, 350);
    }
  }
}

function hint() {
  if (S.done) return;
  const g = S.g, cand = [];
  for (const k of g.blanks) {
    if (S.locked.has(k)) continue;
    const [r, c] = k.split(',').map(Number);
    if (val(r, c) !== g.nums[r][c]) cand.push({ k, empty: S.place[k] == null });
  }
  const ops = [...g.hidden].filter(s => !S.locked.has('op:' + s) && S.opPick[s] !== g.ops[s]);
  cand.sort((a, b) => b.empty - a.empty);
  if (cand.length) {
    const { k } = cand[0];
    const [r, c] = k.split(',').map(Number), want = g.nums[r][c];
    if (S.place[k] != null) unplace(S.place[k]);
    let t = S.tiles.find(x => x.at == null && x.v === want);
    if (!t) t = S.tiles.find(x => x.v === want && x.at != null && !S.locked.has(x.at));
    if (!t) return;
    placeTile(t.id, k);
    S.locked.add(k);
  } else if (ops.length) {
    S.opPick[ops[0]] = g.ops[ops[0]];
    S.locked.add('op:' + ops[0]);
  } else {
    return;
  }
  S.hints++;
  S.sel = null; S.armed = null;
  after();
}

function win() {
  S.done = true;
  const t = S.elapsed, par = S.g.par;
  const stars = S.hints === 0 && t <= par ? 3 : (S.hints <= 1 && t <= par * 2) ? 2 : 1;
  const pts = (50 + S.L * 10) * stars;
  const prev = save.stars[S.L] || 0;
  if (stars > prev) { save.score += (50 + S.L * 10) * (stars - prev); save.stars[S.L] = stars; }
  if (S.L + 1 > save.max) save.max = S.L + 1;
  persist();
  render();
  sfxWin();
  showSplash(WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)], 'win', 1600);
  $('winStars').innerHTML = [1, 2, 3].map(i => i <= stars ? '★' : '<span class="off">★</span>').join('');
  $('winText').innerHTML = `Level <b>${S.L}</b> in <b>${clock(t)}</b> (par ${clock(par)})${S.hints ? ', ' + S.hints + ' hint' + (S.hints > 1 ? 's' : '') : ''}`;
  $('winPts').innerHTML = stars > prev
    ? `+<b>${pts - (50 + S.L * 10) * prev}</b> points`
    : 'Best already recorded for this level';
  setTimeout(() => { $('win').hidden = false; $('bWinNext').focus(); }, 1000);
}

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

function showWelcome(forceNew = false) {
  const isNew = forceNew || !save.username;
  $('wTitle').textContent = isNew ? 'BEANSTERS' : 'Welcome back,';
  $('wNew').hidden = !isNew;
  $('wBack').hidden = isNew;
  if (isNew) {
    $('nameInput').value = save.username || '';
    setTimeout(() => $('nameInput').focus(), 60);
  } else {
    $('wBackName').textContent = save.username;
    const lvl = save.cur || 1;
    $('wBackStats').textContent = `Level ${lvl} · ${save.score} pts`;
  }
  $('welcome').hidden = false;
}

function commitName() {
  const v = $('nameInput').value.trim();
  if (!v) {
    $('nameInput').classList.add('input-error');
    setTimeout(() => $('nameInput').classList.remove('input-error'), 400);
    $('nameInput').focus();
    return false;
  }
  save.username = v;
  persist();
  $('welcome').hidden = true;
  return true;
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

$('board').addEventListener('click', e => {
  const c = e.target.closest('[data-cell]');
  if (c) return onCell(c.dataset.cell);
  const o = e.target.closest('[data-op]');
  if (o) onOp(o.dataset.op);
});
$('tray').addEventListener('click', e => {
  const t = e.target.closest('[data-tile]');
  if (t) onTile(+t.dataset.tile);
});

$('bHint').onclick = hint;
$('bClear').onclick = () => {
  if (S.done) return;
  S.tiles.forEach(t => { if (t.at != null && !S.locked.has(t.at)) unplace(t.id); });
  for (const s in S.opPick) if (!S.locked.has('op:' + s)) delete S.opPick[s];
  S.sel = null; S.armed = null;
  render();
};
$('bPrev').onclick = () => start(Math.max(1, S.L - 1));
$('bNext').onclick = () => start(Math.min(save.max, S.L + 1));
$('bGo').onclick = () => {
  const v = parseInt($('lvlInput').value, 10);
  if (v >= 1 && v <= save.max) { $('lvlInput').value = ''; start(v); }
  else { $('lvlInput').value = ''; $('lvlInput').placeholder = '1–' + save.max; }
};
$('lvlInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('bGo').click(); });

$('bWinNext').onclick = () => start(S.L + 1);
$('bWinStay').onclick = () => { $('win').hidden = true; };

$('bHelp').onclick = () => { $('help').hidden = false; };
$('bHelpClose').onclick = () => { $('help').hidden = true; };
$('help').addEventListener('click', e => { if (e.target === $('help')) $('help').hidden = true; });

$('bAbout').onclick = () => { $('about').hidden = false; };
$('bAboutClose').onclick = () => { $('about').hidden = true; };
$('about').addEventListener('click', e => { if (e.target === $('about')) $('about').hidden = true; });

// Welcome listeners
$('bPlay').onclick = () => { if (commitName()) start(Math.min(save.cur || 1, save.max)); };
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('bPlay').click(); });
$('bPlayBack').onclick = () => { $('welcome').hidden = true; };
$('bChangeName').onclick = () => showWelcome(true);
$('sName').addEventListener('click', () => showWelcome(true));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('about').hidden) { $('about').hidden = true; return; }
    if (!$('help').hidden) { $('help').hidden = true; return; }
    if (!$('welcome').hidden) return; // can't dismiss welcome
    S.sel = null; S.armed = null;
    render();
  }
});

// Drag-and-drop: tiles from tray and filled board cells
let _dragSrc = null;

$('tray').addEventListener('dragstart', e => {
  const t = e.target.closest('[data-tile]');
  if (!t) return;
  _dragSrc = 'tile:' + t.dataset.tile;
  e.dataTransfer.setData('text/plain', _dragSrc);
  e.dataTransfer.effectAllowed = 'move';
  S.sel = null; S.armed = null;
});

$('board').addEventListener('dragstart', e => {
  const c = e.target.closest('[data-cell]');
  if (!c || S.done || S.locked.has(c.dataset.cell) || S.place[c.dataset.cell] == null) return;
  _dragSrc = 'cell:' + c.dataset.cell;
  e.dataTransfer.setData('text/plain', _dragSrc);
  e.dataTransfer.effectAllowed = 'move';
  S.sel = null; S.armed = null;
});

$('board').addEventListener('dragenter', e => {
  const c = e.target.closest('[data-cell]');
  if (c && !S.done && !S.locked.has(c.dataset.cell)) { e.preventDefault(); c.classList.add('drag-over'); }
});

$('board').addEventListener('dragover', e => {
  const c = e.target.closest('[data-cell]');
  if (c && !S.done && !S.locked.has(c.dataset.cell)) e.preventDefault();
});

$('board').addEventListener('dragleave', e => {
  const c = e.target.closest('[data-cell]');
  if (c) c.classList.remove('drag-over');
});

$('board').addEventListener('drop', e => {
  const c = e.target.closest('[data-cell]');
  if (!c || S.done || S.locked.has(c.dataset.cell)) return;
  e.preventDefault();
  c.classList.remove('drag-over');
  const d = e.dataTransfer.getData('text/plain');
  if (d.startsWith('tile:')) {
    placeTile(+d.slice(5), c.dataset.cell);
    S.sel = null; S.armed = null;
    after();
  } else if (d.startsWith('cell:')) {
    const from = d.slice(5);
    if (from !== c.dataset.cell && S.place[from] != null) {
      placeTile(S.place[from], c.dataset.cell);
      S.sel = null; S.armed = null;
      after();
    }
  }
});

$('tray').addEventListener('dragover', e => {
  if (_dragSrc && _dragSrc.startsWith('cell:')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
});

$('tray').addEventListener('drop', e => {
  e.preventDefault();
  const d = e.dataTransfer.getData('text/plain');
  if (d.startsWith('cell:')) {
    const from = d.slice(5);
    if (!S.locked.has(from) && S.place[from] != null) {
      unplace(S.place[from]);
      S.sel = null; S.armed = null;
      after();
    }
  }
});

document.addEventListener('dragend', () => {
  _dragSrc = null;
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
});

// ---------------------------------------------------------------------------
// Timer & init
// ---------------------------------------------------------------------------

setInterval(() => {
  if (S && !S.done && !document.hidden && S.started) {
    S.elapsed++;
    $('sTime').textContent = clock(S.elapsed);
  }
}, 1000);

start(Math.min(save.cur || 1, save.max));
if (save.timeout != null) {
  if (Date.now() - save.timeout < TIMEOUT_MS) {
    $('timeout').hidden = false;
    tickTimeout();
  } else {
    save.timeout = null; persist();
  }
}
showWelcome();
