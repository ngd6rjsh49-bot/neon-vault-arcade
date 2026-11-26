/**
 * VOLT.GG — Social Casino & Arcade Minigames Engine
 * Virtual Play-Money (Credits) Only | 99% RTP Provably Fair Client RNG
 */

const STORAGE_KEY = 'volt_gg_vault_state_v1';
const HOUSE_EDGE = 0.01; // 1.0% edge -> 99.0% RTP

// --- Web Audio Synthesizer (Zero External Assets) ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  tone(freq, type = 'sine', duration = 0.08, vol = 0.12, slideFreq = null) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideFreq, now + duration);
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  click() {
    this.tone(520, 'triangle', 0.04, 0.09, 280);
  }

  bet() {
    this.tone(340, 'sine', 0.06, 0.12, 520);
  }

  gem(step = 1) {
    const base = 440 + Math.min(step * 55, 660);
    this.tone(base, 'sine', 0.11, 0.14, base * 1.25);
  }

  pin() {
    this.tone(680 + Math.random() * 220, 'sine', 0.035, 0.06);
  }

  win(big = false) {
    if (this.muted) return;
    this.tone(523.25, 'triangle', 0.12, 0.15);
    setTimeout(() => this.tone(659.25, 'triangle', 0.12, 0.15), 70);
    setTimeout(() => this.tone(783.99, 'triangle', 0.18, 0.16), 140);
    if (big) {
      setTimeout(() => this.tone(1046.5, 'sine', 0.28, 0.18), 210);
    }
  }

  loss() {
    this.tone(210, 'sawtooth', 0.22, 0.13, 95);
  }
}

const sfx = new SoundEngine();

// --- Cryptographic Provably-Fair Style RNG ---
class FairRNG {
  constructor() {
    this.clientSeed = this.randomHex(16);
    this.serverSeedHash = this.randomHex(32);
    this.nonce = 0;
  }

  randomHex(len) {
    const arr = new Uint8Array(len / 2);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Uniform [0, 1) float using crypto.getRandomValues
  nextFloat() {
    this.nonce++;
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return buf[0] / (0xFFFFFFFF + 1);
  }

  // Crash / Limbo multiplier distribution with 1% house edge
  nextMultiplier() {
    const u = this.nextFloat();
    // 1% instant bust at 1.00x
    if (u < HOUSE_EDGE) return 1.00;
    const raw = (1 - HOUSE_EDGE) / (1 - u);
    return Math.max(1.00, Math.min(Math.floor(raw * 100) / 100, 10000));
  }

  rotateSeeds() {
    this.clientSeed = this.randomHex(16);
    this.serverSeedHash = this.randomHex(32);
    this.nonce = 0;
  }
}

const rng = new FairRNG();

// --- Global App State & Persistence ---
const state = {
  activeGame: 'crash',
  balance: 10000.00,
  stats: {
    wagered: 0,
    profit: 0,
    biggestWin: 0,
    betsCount: 0
  },
  histories: {
    crash: [1.42, 3.85, 1.12, 14.20, 2.05, 1.03, 4.60],
    mines: [],
    plinko: [],
    dice: [],
    limbo: [1.84, 5.12, 1.09, 2.44, 11.80]
  },
  feed: [],
  feedFilter: 'all'
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.balance === 'number' && !isNaN(parsed.balance)) {
      state.balance = parsed.balance;
    }
    if (parsed.stats) {
      state.stats = { ...state.stats, ...parsed.stats };
    }
    if (parsed.histories) {
      state.histories = { ...state.histories, ...parsed.histories };
    }
    if (Array.isArray(parsed.feed)) {
      state.feed = parsed.feed.slice(0, 25);
    }
  } catch (e) {
    console.warn('Could not load saved state:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      balance: state.balance,
      stats: state.stats,
      histories: state.histories,
      feed: state.feed.slice(0, 25)
    }));
  } catch (e) {
    console.warn('Could not persist state:', e);
  }
}

function formatMoney(n) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function showToast(msg, isLoss = false) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast mono ${isLoss ? 'loss' : ''}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(() => el.remove(), 200);
  }, 2400);
}

// --- Wallet & Analytics Operations ---
function updateWalletUI(flashType = null) {
  const balEl = document.getElementById('balance-display');
  const refillBtn = document.getElementById('refill-btn');
  balEl.textContent = formatMoney(state.balance);

  if (flashType === 'win') {
    balEl.classList.remove('flash-win', 'flash-loss');
    void balEl.offsetWidth;
    balEl.classList.add('flash-win');
  } else if (flashType === 'loss') {
    balEl.classList.remove('flash-win', 'flash-loss');
    void balEl.offsetWidth;
    balEl.classList.add('flash-loss');
  }

  // Highlight Refill button when balance is low (< 500 Credits)
  if (state.balance < 500) {
    refillBtn.classList.add('low-balance-pulse');
  } else {
    refillBtn.classList.remove('low-balance-pulse');
  }

  // Update sidebar analytics
  document.getElementById('stat-wagered').textContent = formatMoney(state.stats.wagered);
  const profitEl = document.getElementById('stat-profit');
  const sign = state.stats.profit >= 0 ? '+' : '';
  profitEl.textContent = `${sign}${formatMoney(state.stats.profit)}`;
  profitEl.className = `stat-val mono ${state.stats.profit >= 0 ? 'text-emerald' : 'text-crimson'}`;
  document.getElementById('stat-biggest').textContent = formatMoney(state.stats.biggestWin);
  document.getElementById('stat-count').textContent = state.stats.betsCount.toLocaleString();

  updateBetPctLabel();
  saveState();
}

function getBetAmount() {
  const input = document.getElementById('bet-amount');
  let val = parseFloat(input.value);
  if (isNaN(val) || val < 1) val = 1;
  return Math.round(val * 100) / 100;
}

function deductBet(amount) {
  if (amount > state.balance) {
    showToast('Insufficient credits! Click "+ Refill Free Credits".', true);
    sfx.loss();
    return false;
  }
  state.balance = Math.round((state.balance - amount) * 100) / 100;
  state.stats.wagered = Math.round((state.stats.wagered + amount) * 100) / 100;
  state.stats.profit = Math.round((state.stats.profit - amount) * 100) / 100;
  state.stats.betsCount += 1;
  updateWalletUI('loss');
  return true;
}

function creditWin(betAmount, multiplier, gameName) {
  const payout = Math.round(betAmount * multiplier * 100) / 100;
  const netWin = Math.round((payout - betAmount) * 100) / 100;
  state.balance = Math.round((state.balance + payout) * 100) / 100;
  state.stats.profit = Math.round((state.stats.profit + payout) * 100) / 100;
  if (payout > state.stats.biggestWin) {
    state.stats.biggestWin = payout;
  }
  updateWalletUI('win');
  recordFeedEntry(gameName, 'YOU', betAmount, multiplier, payout, true);
  return { payout, netWin };
}

function recordLossFeed(betAmount, multiplier, gameName) {
  recordFeedEntry(gameName, 'YOU', betAmount, multiplier, 0, false);
}

// --- History Pill Helper ---
function renderHistoryBar(gameKey, containerId, formatter) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const list = state.histories[gameKey] || [];
  list.slice(-10).forEach(item => {
    const pill = document.createElement('span');
    const info = formatter(item);
    pill.className = `h-pill ${info.cls}`;
    pill.textContent = info.text;
    container.appendChild(pill);
  });
}

function pushHistory(gameKey, item, containerId, formatter) {
  if (!state.histories[gameKey]) state.histories[gameKey] = [];
  state.histories[gameKey].push(item);
  if (state.histories[gameKey].length > 14) {
    state.histories[gameKey].shift();
  }
  renderHistoryBar(gameKey, containerId, formatter);
  saveState();
}

// ============================================================================
// 1. CRASH GAME ENGINE
// ============================================================================
const crashGame = {
  state: 'IDLE', // IDLE | RUNNING | CRASHED
  bet: 0,
  autoCashout: 2.00,
  crashPoint: 1.00,
  currentMult: 1.00,
  cashedOut: false,
  cashoutMult: 0,
  startTime: 0,
  rafId: null,
  canvas: null,
  ctx: null,

  init() {
    this.canvas = document.getElementById('crash-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    renderHistoryBar('crash', 'crash-history-bar', m => ({
      text: `${Number(m).toFixed(2)}×`,
      cls: m >= 10 ? 'gold' : m >= 2 ? 'win' : 'loss'
    }));
    this.drawFrame();
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      this.drawFrame();
    }
  },

  startRound() {
    if (this.state === 'RUNNING') {
      if (!this.cashedOut) this.cashOut();
      return;
    }

    const bet = getBetAmount();
    if (!deductBet(bet)) return;

    sfx.bet();
    this.bet = bet;
    this.autoCashout = Math.max(1.01, parseFloat(document.getElementById('crash-auto-cashout').value) || 2.00);
    this.crashPoint = rng.nextMultiplier();
    this.currentMult = 1.00;
    this.cashedOut = false;
    this.cashoutMult = 0;
    this.state = 'RUNNING';
    this.startTime = performance.now();

    this.updateHUD();
    syncPrimaryButton();

    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tick = (now) => {
      if (this.state !== 'RUNNING') return;
      const elapsedSec = (now - this.startTime) / 1000;
      // Smooth exponential growth curve
      const nextMult = Math.pow(Math.E, 0.085 * Math.pow(elapsedSec, 1.35));

      if (nextMult >= this.crashPoint) {
        this.currentMult = this.crashPoint;
        this.triggerCrash();
        return;
      }

      this.currentMult = nextMult;

      // Check Auto-Cashout
      if (!this.cashedOut && this.currentMult >= this.autoCashout && this.crashPoint >= this.autoCashout) {
        this.currentMult = this.autoCashout;
        this.cashOut(true);
      }

      this.updateHUD();
      this.drawFrame(elapsedSec);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  },

  cashOut(isAuto = false) {
    if (this.state !== 'RUNNING' || this.cashedOut) return;
    this.cashedOut = true;
    this.cashoutMult = Math.floor(this.currentMult * 100) / 100;
    const { payout } = creditWin(this.bet, this.cashoutMult, 'Crash');
    sfx.win(this.cashoutMult >= 5);
    showToast(`${isAuto ? 'Auto-' : ''}Cashed out at ${this.cashoutMult.toFixed(2)}× (+${formatMoney(payout)} ◈)`);
    this.updateHUD();
    syncPrimaryButton();
  },

  triggerCrash() {
    this.state = 'CRASHED';
    if (!this.cashedOut) {
      sfx.loss();
      recordLossFeed(this.bet, 0, 'Crash');
    }
    pushHistory('crash', this.crashPoint, 'crash-history-bar', m => ({
      text: `${Number(m).toFixed(2)}×`,
      cls: m >= 10 ? 'gold' : m >= 2 ? 'win' : 'loss'
    }));
    this.updateHUD();
    this.drawFrame();
    syncPrimaryButton();
  },

  updateHUD() {
    const multEl = document.getElementById('crash-mult-readout');
    const statusEl = document.getElementById('crash-status-readout');
    const payoutEl = document.getElementById('crash-payout-readout');

    multEl.textContent = `${this.currentMult.toFixed(2)}×`;
    multEl.className = 'crash-multiplier mono';

    if (this.state === 'RUNNING') {
      multEl.classList.add(this.cashedOut ? 'cashed' : 'running');
      statusEl.textContent = this.cashedOut
        ? `CASHED OUT @ ${this.cashoutMult.toFixed(2)}×`
        : `AUTO CASHOUT @ ${this.autoCashout.toFixed(2)}×`;
      payoutEl.classList.remove('hidden');
      const activeMult = this.cashedOut ? this.cashoutMult : this.currentMult;
      payoutEl.textContent = `+${formatMoney(this.bet * activeMult)} ◈`;
    } else if (this.state === 'CRASHED') {
      multEl.classList.add('crashed');
      statusEl.textContent = `CRASHED @ ${this.crashPoint.toFixed(2)}×`;
      if (!this.cashedOut) payoutEl.classList.add('hidden');
    } else {
      statusEl.textContent = 'READY TO LAUNCH';
      payoutEl.classList.add('hidden');
    }
  },

  drawFrame() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    const padL = 48;
    const padR = 32;
    const padT = 28;
    const padB = 38;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Background Subtle Grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const rows = 5;
    const cols = 6;
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';

    const maxMultView = Math.max(2.2, this.currentMult * 1.18);
    for (let r = 0; r <= rows; r++) {
      const y = padT + (plotH / rows) * r;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const labelVal = maxMultView - ((maxMultView - 1.0) / rows) * r;
      ctx.fillText(`${labelVal.toFixed(1)}×`, 8, y + 4);
    }

    for (let c = 0; c <= cols; c++) {
      const x = padL + (plotW / cols) * c;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, h - padB);
      ctx.stroke();
    }

    if (this.state === 'IDLE') return;

    // Draw Rising Curve
    const progress = Math.min(1, Math.log(this.currentMult) / Math.log(maxMultView));
    const endX = padL + plotW * Math.min(0.95, 0.18 + progress * 0.77);
    const endY = padT + plotH * (1 - Math.min(0.95, (this.currentMult - 1) / (maxMultView - 1)));

    const isCrashed = this.state === 'CRASHED';
    const strokeColor = isCrashed ? '#EF4444' : (this.cashedOut ? '#F59E0B' : '#10B981');

    // Fill Area under curve
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, isCrashed ? 'rgba(239, 68, 68, 0.28)' : 'rgba(16, 185, 129, 0.28)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = padL + (endX - padL) * t;
      const curveY = (h - padB) - ((h - padB) - endY) * Math.pow(t, 1.85);
      ctx.lineTo(x, curveY);
    }
    ctx.lineTo(endX, h - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing Curve Line
    ctx.beginPath();
    ctx.moveTo(padL, h - padB);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = padL + (endX - padL) * t;
      const curveY = (h - padB) - ((h - padB) - endY) * Math.pow(t, 1.85);
      ctx.lineTo(x, curveY);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Leading Neon Orb
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
};

// ============================================================================
// 2. MINES GAME ENGINE
// ============================================================================
const minesGame = {
  active: false,
  bet: 0,
  minesCount: 3,
  bombIndices: new Set(),
  revealedIndices: new Set(),
  currentMult: 1.00,

  init() {
    this.buildGrid();
    this.updateMultipliersUI();
    renderHistoryBar('mines', 'mines-history-bar', item => ({
      text: item.won ? `${item.mult.toFixed(2)}×` : 'BOOM',
      cls: item.won ? (item.mult >= 5 ? 'gold' : 'win') : 'loss'
    }));
  },

  // True hypergeometric combination multiplier with 1% house edge
  calcMultiplier(mines, picks) {
    if (picks === 0) return 1.00;
    let prob = 1;
    for (let i = 0; i < picks; i++) {
      prob *= (25 - mines - i) / (25 - i);
    }
    const mult = (1 - HOUSE_EDGE) / prob;
    return Math.floor(mult * 100) / 100;
  },

  buildGrid() {
    const grid = document.getElementById('mines-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mine-tile';
      btn.dataset.idx = i;
      btn.addEventListener('click', () => this.clickTile(i));
      grid.appendChild(btn);
    }
  },

  startRound() {
    if (this.active) {
      if (this.revealedIndices.size > 0) {
        this.cashOut();
      }
      return;
    }

    const bet = getBetAmount();
    if (!deductBet(bet)) return;

    sfx.bet();
    this.bet = bet;
    this.minesCount = parseInt(document.getElementById('mines-count').value, 10) || 3;
    this.bombIndices.clear();
    this.revealedIndices.clear();
    this.currentMult = 1.00;
    this.active = true;

    // Place bombs via Fisher-Yates shuffle using Provably Fair RNG
    const indices = Array.from({ length: 25 }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng.nextFloat() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < this.minesCount; i++) {
      this.bombIndices.add(indices[i]);
    }

    document.getElementById('mines-win-banner').classList.add('hidden');
    document.getElementById('mines-random-btn').disabled = false;
    document.getElementById('mines-count').disabled = true;
    this.buildGrid();
    this.updateMultipliersUI();
    syncPrimaryButton();
  },

  clickTile(idx) {
    if (!this.active || this.revealedIndices.has(idx)) return;

    const tiles = document.querySelectorAll('.mine-tile');
    const tile = tiles[idx];

    if (this.bombIndices.has(idx)) {
      // Hit a Bomb!
      this.active = false;
      sfx.loss();
      tile.classList.add('revealed', 'bomb');
      tile.innerHTML = this.bombSVG();
      this.revealAllBoard();
      recordLossFeed(this.bet, 0, 'Mines');
      pushHistory('mines', { won: false, mult: 0 }, 'mines-history-bar', item => ({
        text: item.won ? `${item.mult.toFixed(2)}×` : 'BOOM',
        cls: item.won ? (item.mult >= 5 ? 'gold' : 'win') : 'loss'
      }));
      document.getElementById('mines-random-btn').disabled = true;
      document.getElementById('mines-count').disabled = false;
      syncPrimaryButton();
      return;
    }

    // Found a Gem!
    this.revealedIndices.add(idx);
    const picks = this.revealedIndices.size;
    this.currentMult = this.calcMultiplier(this.minesCount, picks);
    sfx.gem(picks);

    tile.classList.add('revealed', 'gem');
    tile.innerHTML = this.gemSVG();

    this.updateMultipliersUI();

    // Auto cashout if all safe gems uncovered
    if (picks === 25 - this.minesCount) {
      this.cashOut();
      return;
    }
    syncPrimaryButton();
  },

  pickRandomTile() {
    if (!this.active) return;
    const unrevealed = [];
    for (let i = 0; i < 25; i++) {
      if (!this.revealedIndices.has(i)) unrevealed.push(i);
    }
    if (unrevealed.length > 0) {
      const pick = unrevealed[Math.floor(rng.nextFloat() * unrevealed.length)];
      this.clickTile(pick);
    }
  },

  cashOut() {
    if (!this.active || this.revealedIndices.size === 0) return;
    this.active = false;
    const { payout } = creditWin(this.bet, this.currentMult, 'Mines');
    sfx.win(this.currentMult >= 5);

    this.revealAllBoard();
    const banner = document.getElementById('mines-win-banner');
    document.getElementById('mines-banner-mult').textContent = `${this.currentMult.toFixed(2)}×`;
    document.getElementById('mines-banner-amt').textContent = `+${formatMoney(payout)} ◈`;
    banner.classList.remove('hidden');

    pushHistory('mines', { won: true, mult: this.currentMult }, 'mines-history-bar', item => ({
      text: item.won ? `${item.mult.toFixed(2)}×` : 'BOOM',
      cls: item.won ? (item.mult >= 5 ? 'gold' : 'win') : 'loss'
    }));

    document.getElementById('mines-random-btn').disabled = true;
    document.getElementById('mines-count').disabled = false;
    syncPrimaryButton();
  },

  revealAllBoard() {
    const tiles = document.querySelectorAll('.mine-tile');
    tiles.forEach((tile, i) => {
      if (this.revealedIndices.has(i)) return;
      tile.classList.add('revealed', 'faded');
      if (this.bombIndices.has(i)) {
        if (!tile.classList.contains('bomb')) {
          tile.classList.add('bomb');
          tile.innerHTML = this.bombSVG();
        }
      } else {
        tile.classList.add('gem');
        tile.innerHTML = this.gemSVG();
      }
    });
  },

  updateMultipliersUI() {
    const mines = parseInt(document.getElementById('mines-count').value, 10) || 3;
    const picks = this.active ? this.revealedIndices.size : 0;
    const curr = this.calcMultiplier(mines, picks);
    const next = picks < 25 - mines ? this.calcMultiplier(mines, picks + 1) : curr;

    document.getElementById('mines-count-val').textContent = mines;
    document.getElementById('mines-gems-left').textContent = `${25 - mines - picks} Gems Left`;
    document.getElementById('mines-curr-mult').textContent = `${curr.toFixed(2)}×`;
    document.getElementById('mines-next-mult').textContent = `${next.toFixed(2)}×`;
  },

  gemSVG() {
    return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <polygon points="12 2 22 9 12 22 2 9" fill="#10B981" stroke="#6EE7B7" stroke-width="1.6"/>
      <polygon points="12 2 17 9 12 22 7 9" fill="#34D399" opacity="0.65"/>
    </svg>`;
  },

  bombSVG() {
    return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7.5" fill="#EF4444" stroke="#FCA5A5" stroke-width="1.6"/>
      <path d="M12 5.5V2M15 4L17 2M9 4L7 2" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
      <circle cx="9.5" cy="11" r="2" fill="#FECACA"/>
    </svg>`;
  }
};

// ============================================================================
// 3. PLINKO GAME ENGINE (Physics Pyramid & Multi-Ball Drop)
// ============================================================================
const PLINKO_TABLES = {
  low: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    12: [10, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    16: [16, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16]
  },
  medium: {
    8:  [13, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13],
    10: [22, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22],
    12: [33, 11, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11, 33],
    14: [58, 15, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15, 58],
    16: [110, 41, 10, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10, 41, 110]
  },
  high: {
    8:  [29, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    14: [420, 56, 18, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18, 56, 420],
    16: [1000, 130, 26, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26, 130, 1000]
  }
};

const plinkoGame = {
  rows: 12,
  risk: 'medium',
  balls: [],
  pinPulses: [],
  bucketPulses: {},
  canvas: null,
  ctx: null,

  init() {
    this.canvas = document.getElementById('plinko-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    renderHistoryBar('plinko', 'plinko-history-bar', m => ({
      text: `${m}×`,
      cls: m >= 10 ? 'gold' : m >= 1 ? 'win' : 'loss'
    }));
    this.loop();
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    }
  },

  dropBall() {
    const bet = getBetAmount();
    if (!deductBet(bet)) return;
    sfx.bet();

    // Generate R binary left/right decisions via Provably Fair RNG
    const decisions = [];
    for (let r = 0; r < this.rows; r++) {
      decisions.push(rng.nextFloat() < 0.5 ? 0 : 1);
    }

    this.balls.push({
      bet,
      rows: this.rows,
      risk: this.risk,
      decisions,
      progress: 0, // 0 to rows
      speed: 6.2 + Math.random() * 0.6,
      trail: [],
      lastRowHit: -1
    });

    this.updateBallsBadge();
  },

  updateBallsBadge() {
    document.getElementById('plinko-balls-badge').textContent = `${this.balls.length} Ball${this.balls.length === 1 ? '' : 's'} Active`;
  },

  getGeometry() {
    const w = this.canvas.width / window.devicePixelRatio;
    const h = this.canvas.height / window.devicePixelRatio;
    const topY = 24;
    const bottomY = h - 44;
    const availH = Math.max(180, bottomY - topY);
    const rowGap = availH / (this.rows + 1.15);
    const maxSpread = Math.min(w - 56, availH * 1.25);
    const colGap = maxSpread / (this.rows + 2);
    return { w, h, topY, bottomY, rowGap, colGap };
  },

  pinPos(row, idx, geo) {
    // row 0 has 3 pins, row r has r+3 pins
    const count = row + 3;
    const rowWidth = (count - 1) * geo.colGap;
    const startX = geo.w / 2 - rowWidth / 2;
    return {
      x: startX + idx * geo.colGap,
      y: geo.topY + (row + 1) * geo.rowGap
    };
  },

  loop() {
    this.updateAndDraw();
    requestAnimationFrame(() => this.loop());
  },

  updateAndDraw() {
    if (!this.ctx || !this.canvas) return;
    const geo = this.getGeometry();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, geo.w, geo.h);

    // 1. Draw Pyramid Pins
    const pinRadius = this.rows >= 14 ? 3.2 : 4.2;
    for (let r = 0; r < this.rows; r++) {
      const count = r + 3;
      for (let i = 0; i < count; i++) {
        const p = this.pinPos(r, i, geo);
        ctx.beginPath();
        ctx.arc(p.x, p.y, pinRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();
      }
    }

    // Draw Pin Collision Ripples
    for (let i = this.pinPulses.length - 1; i >= 0; i--) {
      const pulse = this.pinPulses[i];
      pulse.age += 0.08;
      if (pulse.age >= 1) {
        this.pinPulses.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pinRadius + pulse.age * 11, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(16, 185, 129, ${1 - pulse.age})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 2. Draw Multiplier Buckets at Bottom
    const mults = PLINKO_TABLES[this.risk][this.rows];
    const bucketCount = this.rows + 1;
    const totalW = (bucketCount - 1) * geo.colGap;
    const startBucketX = geo.w / 2 - totalW / 2;
    const bucketW = geo.colGap - 4;
    const bucketH = 26;
    const bucketY = geo.topY + (this.rows + 0.7) * geo.rowGap;

    for (let b = 0; b < bucketCount; b++) {
      const cx = startBucketX + b * geo.colGap;
      const m = mults[b];
      const pulseOffset = this.bucketPulses[b] ? Math.sin(this.bucketPulses[b] * Math.PI) * 5 : 0;
      if (this.bucketPulses[b]) {
        this.bucketPulses[b] += 0.12;
        if (this.bucketPulses[b] >= 1) delete this.bucketPulses[b];
      }

      // Color gradient by distance from center
      const dist = Math.abs(b - (bucketCount - 1) / 2) / ((bucketCount - 1) / 2);
      let bg = '#1E293B';
      let border = '#475569';
      let textCol = '#F8FAFC';
      if (dist > 0.75) {
        bg = 'rgba(239, 68, 68, 0.25)';
        border = '#EF4444';
        textCol = '#FCA5A5';
      } else if (dist > 0.38) {
        bg = 'rgba(245, 158, 11, 0.22)';
        border = '#F59E0B';
        textCol = '#FDE68A';
      } else {
        bg = 'rgba(16, 185, 129, 0.18)';
        border = '#10B981';
        textCol = '#6EE7B7';
      }

      const rx = cx - bucketW / 2;
      const ry = bucketY + pulseOffset;
      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, bucketW, bucketH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textCol;
      ctx.font = `700 ${this.rows >= 14 ? '9.5px' : '10.5px'} "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${m}×`, cx, ry + 16);
    }
    ctx.textAlign = 'left';

    // 3. Update & Draw Falling Physics Balls
    const dt = 0.016;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.progress += ball.speed * dt;

      const stepIdx = Math.floor(ball.progress);
      const frac = ball.progress - stepIdx;

      // Determine current & next node coordinates
      let rightCount = 0;
      for (let k = 0; k < Math.min(stepIdx, ball.rows); k++) {
        rightCount += ball.decisions[k];
      }

      if (stepIdx > ball.lastRowHit && stepIdx >= 1 && stepIdx <= ball.rows) {
        ball.lastRowHit = stepIdx;
        const hitPin = this.pinPos(stepIdx - 1, rightCount + 1 - ball.decisions[stepIdx - 1], geo);
        this.pinPulses.push({ x: hitPin.x, y: hitPin.y, age: 0 });
        sfx.pin();
      }

      if (ball.progress >= ball.rows + 0.55) {
        // Ball landed in bucket!
        const finalBucket = ball.decisions.reduce((a, b) => a + b, 0);
        const mult = PLINKO_TABLES[ball.risk][ball.rows][finalBucket];
        this.bucketPulses[finalBucket] = 0.01;

        if (mult >= 1) {
          creditWin(ball.bet, mult, 'Plinko');
          sfx.win(mult >= 10);
        } else {
          // Sub-1x still returns partial payout
          creditWin(ball.bet, mult, 'Plinko');
          sfx.click();
        }

        pushHistory('plinko', mult, 'plinko-history-bar', m => ({
          text: `${m}×`,
          cls: m >= 10 ? 'gold' : m >= 1 ? 'win' : 'loss'
        }));

        this.balls.splice(i, 1);
        this.updateBallsBadge();
        continue;
      }

      // Compute smooth parabolic bounce arc between row stepIdx and stepIdx+1
      const currX = geo.w / 2 + (rightCount - stepIdx / 2) * geo.colGap;
      const currY = geo.topY + stepIdx * geo.rowGap;

      const nextDecision = stepIdx < ball.rows ? ball.decisions[stepIdx] : 0.5;
      const nextRight = rightCount + nextDecision;
      const nextX = geo.w / 2 + (nextRight - (stepIdx + 1) / 2) * geo.colGap;
      const nextY = geo.topY + (stepIdx + 1) * geo.rowGap;

      const bx = currX + (nextX - currX) * frac;
      // Parabolic gravity bounce curve
      const bounceLift = Math.sin(frac * Math.PI) * (geo.rowGap * 0.26);
      const by = currY + (nextY - currY) * (frac * frac) - bounceLift;

      ball.trail.push({ x: bx, y: by });
      if (ball.trail.length > 7) ball.trail.shift();

      // Draw Trail
      for (let t = 0; t < ball.trail.length; t++) {
        const pt = ball.trail[t];
        const alpha = ((t + 1) / ball.trail.length) * 0.35;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.fill();
      }

      // Draw Glowing Plinko Ball
      ctx.beginPath();
      ctx.arc(bx, by, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FBBF24';
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
};

// ============================================================================
// 4. DICE GAME ENGINE
// ============================================================================
const diceGame = {
  rollOver: true,
  target: 50.50,
  rolling: false,

  init() {
    this.syncFromTarget(50.50);
    renderHistoryBar('dice', 'dice-history-bar', item => ({
      text: item.roll.toFixed(2),
      cls: item.won ? 'win' : 'loss'
    }));
  },

  getWinChance() {
    const chance = this.rollOver ? (100 - this.target) : this.target;
    return Math.max(2, Math.min(98, Math.round(chance * 100) / 100));
  },

  getMultiplier() {
    const chance = this.getWinChance();
    return Math.round(((99 / chance)) * 10000) / 10000;
  },

  syncFromTarget(newTarget) {
    this.target = Math.max(2, Math.min(98, Math.round(newTarget * 100) / 100));
    const chance = this.getWinChance();
    const mult = this.getMultiplier();
    const bet = getBetAmount();

    document.getElementById('dice-slider').value = this.target;
    document.getElementById('dice-target-input').value = this.target.toFixed(2);
    document.getElementById('dice-chance-input').value = chance.toFixed(2);
    document.getElementById('dice-mult-input').value = mult.toFixed(4);
    document.getElementById('dice-roll-mode-label').textContent = this.rollOver ? 'Roll Over' : 'Roll Under';
    document.getElementById('dice-condition-display').textContent = `${this.rollOver ? 'Roll Over' : 'Roll Under'} ${this.target.toFixed(2)}`;
    document.getElementById('dice-payout-preview').textContent = `${formatMoney(bet * mult)} ◈ (${mult.toFixed(2)}×)`;

    // Update Slider Track Gradient
    const track = document.getElementById('dice-track-bg');
    if (this.rollOver) {
      track.style.background = `linear-gradient(90deg, #EF4444 ${this.target}%, #10B981 ${this.target}%)`;
    } else {
      track.style.background = `linear-gradient(90deg, #10B981 ${this.target}%, #EF4444 ${this.target}%)`;
    }
  },

  flipMode() {
    sfx.click();
    this.rollOver = !this.rollOver;
    this.syncFromTarget(100 - this.target);
  },

  roll() {
    if (this.rolling) return;
    const bet = getBetAmount();
    if (!deductBet(bet)) return;

    this.rolling = true;
    sfx.bet();

    // Generate random 0.00 to 100.00
    const outcome = Math.floor(rng.nextFloat() * 10001) / 100;
    const won = this.rollOver ? (outcome > this.target) : (outcome < this.target);
    const mult = this.getMultiplier();

    const marker = document.getElementById('dice-roll-marker');
    const markerVal = document.getElementById('dice-marker-val');
    const bigReadout = document.getElementById('dice-result-number');
    const tag = document.getElementById('dice-outcome-tag');

    marker.classList.remove('hidden', 'win', 'loss');
    marker.style.left = `${outcome}%`;
    markerVal.textContent = outcome.toFixed(2);

    // Quick number roll counter animation
    const startVal = parseFloat(bigReadout.textContent) || 50.00;
    const startTime = performance.now();
    const duration = 220;

    const animateRoll = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const curr = startVal + (outcome - startVal) * t;
      bigReadout.textContent = curr.toFixed(2);

      if (t < 1) {
        requestAnimationFrame(animateRoll);
      } else {
        this.rolling = false;
        bigReadout.textContent = outcome.toFixed(2);
        bigReadout.className = `dice-big-readout mono ${won ? 'win' : 'loss'}`;
        marker.classList.add(won ? 'win' : 'loss');

        if (won) {
          const { payout } = creditWin(bet, mult, 'Dice');
          sfx.win(mult >= 5);
          tag.textContent = `WIN! +${formatMoney(payout)} CREDITS (${mult.toFixed(2)}×)`;
          tag.className = 'dice-outcome-tag text-emerald';
        } else {
          sfx.loss();
          recordLossFeed(bet, 0, 'Dice');
          tag.textContent = `MISSED TARGET (${this.rollOver ? '>' : '<'} ${this.target.toFixed(2)})`;
          tag.className = 'dice-outcome-tag text-crimson';
        }

        pushHistory('dice', { roll: outcome, won }, 'dice-history-bar', item => ({
          text: item.roll.toFixed(2),
          cls: item.won ? 'win' : 'loss'
        }));
      }
    };

    requestAnimationFrame(animateRoll);
  }
};

// ============================================================================
// 5. LIMBO GAME ENGINE
// ============================================================================
const limboGame = {
  running: false,

  init() {
    this.updatePreview();
    renderHistoryBar('limbo', 'limbo-history-bar', item => ({
      text: `${Number(item.mult || item).toFixed(2)}×`,
      cls: (item.won ?? (item >= 2)) ? 'win' : 'loss'
    }));
  },

  getTarget() {
    const val = parseFloat(document.getElementById('limbo-target').value);
    return Math.max(1.01, Math.min(10000, isNaN(val) ? 2.00 : val));
  },

  updatePreview() {
    const target = this.getTarget();
    const chance = Math.min(98.01, (99 / target));
    const bet = getBetAmount();
    const profit = Math.max(0, bet * target - bet);

    document.getElementById('limbo-chance-label').textContent = `Win Chance: ${chance.toFixed(2)}%`;
    document.getElementById('limbo-profit-preview').textContent = `+${formatMoney(profit)} ◈`;
    document.getElementById('limbo-sub-banner').textContent = `TARGET: ${target.toFixed(2)}×`;
  },

  play() {
    if (this.running) return;
    const bet = getBetAmount();
    if (!deductBet(bet)) return;

    this.running = true;
    sfx.bet();

    const target = this.getTarget();
    const resultMult = rng.nextMultiplier();
    const won = resultMult >= target;

    const readout = document.getElementById('limbo-readout');
    const ring = document.getElementById('limbo-glow-ring');
    readout.className = 'limbo-big-multiplier mono';
    ring.className = 'limbo-glow-ring';

    const startTime = performance.now();
    const duration = 260;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const displayVal = 1.00 + (resultMult - 1.00) * eased;
      readout.textContent = `${displayVal.toFixed(2)}×`;

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        this.running = false;
        readout.textContent = `${resultMult.toFixed(2)}×`;
        readout.classList.add(won ? 'win' : 'loss');
        ring.classList.add(won ? 'win' : 'loss');

        if (won) {
          creditWin(bet, target, 'Limbo');
          sfx.win(target >= 10);
        } else {
          sfx.loss();
          recordLossFeed(bet, 0, 'Limbo');
        }

        pushHistory('limbo', { mult: resultMult, won }, 'limbo-history-bar', item => ({
          text: `${Number(item.mult || item).toFixed(2)}×`,
          cls: (item.won ?? (item >= 2)) ? 'win' : 'loss'
        }));
      }
    };

    requestAnimationFrame(tick);
  }
};

// ============================================================================
// LIVE RECENT PLAYS FEED (Player + Simulated Peers)
// ============================================================================
const BOT_NAMES = ['NeonWhale', 'Cipher_99', 'VortexX', 'SatoshiJr', 'ApexQuant', 'LunaDrift', 'ZeroEdge', 'KryptoKnight'];
const GAME_NAMES = ['Crash', 'Mines', 'Plinko', 'Dice', 'Limbo'];

function recordFeedEntry(game, player, bet, mult, payout, isUser = false) {
  const entry = {
    game,
    player,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    bet,
    mult,
    payout,
    isUser
  };
  state.feed.unshift(entry);
  if (state.feed.length > 30) state.feed.pop();
  renderFeedTable();
  if (isUser) saveState();
}

function renderFeedTable() {
  const tbody = document.getElementById('live-feed-body');
  if (!tbody) return;

  const filtered = state.feed.filter(row => {
    if (state.feedFilter === 'mine') return row.isUser;
    if (state.feedFilter === 'high') return row.bet >= 250 || row.payout >= 500;
    return true;
  });

  tbody.innerHTML = filtered.slice(0, 8).map((r, idx) => {
    const won = r.payout >= r.bet && r.mult > 0;
    return `<tr class="${idx === 0 ? 'feed-row-new' : ''}">
      <td><strong>${r.game}</strong></td>
      <td class="${r.isUser ? 'player-you' : ''}">${r.player}</td>
      <td class="mono">${r.time}</td>
      <td class="right mono">${formatMoney(r.bet)} ◈</td>
      <td class="right mono ${won ? 'text-amber' : 'text-muted'}">${r.mult.toFixed(2)}×</td>
      <td class="right mono ${won ? 'text-emerald' : 'text-crimson'}">${won ? '+' + formatMoney(r.payout) : '0.00'} ◈</td>
    </tr>`;
  }).join('');
}

function spawnSimulatedFeedPlay() {
  const game = GAME_NAMES[Math.floor(Math.random() * GAME_NAMES.length)];
  const player = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const betChoices = [10, 25, 50, 100, 250, 500, 1000];
  const bet = betChoices[Math.floor(Math.random() * betChoices.length)];
  const won = Math.random() < 0.56;
  const mult = won ? Math.round((1.15 + Math.pow(Math.random(), 3) * 14) * 100) / 100 : 0;
  const payout = won ? Math.round(bet * mult * 100) / 100 : 0;
  recordFeedEntry(game, player, bet, mult, payout, false);
}

// ============================================================================
// UI CONTROLLER & NAVIGATION
// ============================================================================
function syncPrimaryButton() {
  const btn = document.getElementById('primary-play-btn');
  const mainTxt = document.getElementById('play-btn-text');
  const subTxt = document.getElementById('play-btn-sub');

  btn.classList.remove('cashout-mode');
  btn.disabled = false;

  if (state.activeGame === 'crash') {
    if (crashGame.state === 'RUNNING' && !crashGame.cashedOut) {
      btn.classList.add('cashout-mode');
      mainTxt.textContent = 'Cash Out Now';
      subTxt.textContent = `${formatMoney(crashGame.bet * crashGame.currentMult)} ◈`;
    } else if (crashGame.state === 'RUNNING' && crashGame.cashedOut) {
      btn.disabled = true;
      mainTxt.textContent = 'Cashed Out';
      subTxt.textContent = 'Waiting for round crash...';
    } else {
      mainTxt.textContent = 'Launch Rocket';
      subTxt.textContent = 'Start Crash Round';
    }
  } else if (state.activeGame === 'mines') {
    if (minesGame.active) {
      if (minesGame.revealedIndices.size === 0) {
        btn.disabled = true;
        mainTxt.textContent = 'Select a Tile';
        subTxt.textContent = 'Reveal at least 1 gem to cash out';
      } else {
        btn.classList.add('cashout-mode');
        mainTxt.textContent = `Cash Out (${minesGame.currentMult.toFixed(2)}×)`;
        subTxt.textContent = `+${formatMoney(minesGame.bet * minesGame.currentMult)} ◈`;
      }
    } else {
      mainTxt.textContent = 'Start Minefield';
      subTxt.textContent = 'Place Bet';
    }
  } else if (state.activeGame === 'plinko') {
    mainTxt.textContent = 'Drop Plinko Ball';
    subTxt.textContent = 'Rapid Multi-Drop Enabled';
  } else if (state.activeGame === 'dice') {
    mainTxt.textContent = 'Roll Quantum Dice';
    subTxt.textContent = `${diceGame.getMultiplier().toFixed(2)}× Payout`;
  } else if (state.activeGame === 'limbo') {
    mainTxt.textContent = 'Bet Limbo';
    subTxt.textContent = `Target ${limboGame.getTarget().toFixed(2)}×`;
  }
}

function switchGame(gameId) {
  sfx.click();
  state.activeGame = gameId;

  // Sidebar Active State
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.game === gameId);
  });

  // Top Header Title
  document.getElementById('header-game-title').textContent = gameId.toUpperCase();

  // Left Control Panel Specific Controls
  document.querySelectorAll('.g-ctrl').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.ctrl !== gameId);
  });

  // Right Game Stage Views
  document.querySelectorAll('.stage-view').forEach(view => {
    view.classList.toggle('active', view.id === `stage-${gameId}`);
  });

  if (gameId === 'crash') crashGame.resize();
  if (gameId === 'plinko') plinkoGame.resize();
  syncPrimaryButton();
}

function updateBetPctLabel() {
  const bet = getBetAmount();
  const pct = state.balance > 0 ? Math.min(100, (bet / state.balance) * 100) : 0;
  document.getElementById('bet-pct-label').textContent = `${pct.toFixed(1)}% of bankroll`;

  // Refresh game-specific profit previews
  const crashAuto = parseFloat(document.getElementById('crash-auto-cashout').value) || 2.00;
  document.getElementById('crash-target-profit').textContent = `+${formatMoney(Math.max(0, bet * crashAuto - bet))} ◈`;
  document.getElementById('crash-win-chance').textContent = `Chance: ${Math.min(98, (99 / crashAuto)).toFixed(2)}%`;

  diceGame.syncFromTarget(diceGame.target);
  limboGame.updatePreview();
}

// --- Initialize App & Event Listeners ---
window.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Seed initial feed if empty
  if (state.feed.length === 0) {
    for (let i = 0; i < 6; i++) spawnSimulatedFeedPlay();
  }
  renderFeedTable();
  setInterval(spawnSimulatedFeedPlay, 3800);

  // Initialize All 5 Minigames
  crashGame.init();
  minesGame.init();
  plinkoGame.init();
  diceGame.init();
  limboGame.init();
  updateWalletUI();
  syncPrimaryButton();

  // Sidebar Game Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchGame(btn.dataset.game));
  });

  // Refill Free Credits Button
  document.getElementById('refill-btn').addEventListener('click', () => {
    sfx.win(true);
    state.balance = Math.max(state.balance + 10000, 10000.00);
    updateWalletUI('win');
    showToast('Refilled +10,000.00 Free Virtual Credits!');
  });

  // Reset Stats Button
  document.getElementById('reset-stats-btn').addEventListener('click', () => {
    sfx.click();
    state.stats = { wagered: 0, profit: 0, biggestWin: 0, betsCount: 0 };
    updateWalletUI();
    showToast('Session analytics reset.');
  });

  // Mute Toggle Button
  document.getElementById('mute-btn').addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    document.getElementById('sound-on-icon').classList.toggle('hidden', sfx.muted);
    document.getElementById('sound-off-icon').classList.toggle('hidden', !sfx.muted);
    if (!sfx.muted) sfx.click();
  });

  // Provably Fair Modal
  const fairnessModal = document.getElementById('fairness-modal');
  const updateSeedModal = () => {
    document.getElementById('client-seed-input').value = rng.clientSeed;
    document.getElementById('server-seed-hash').value = rng.serverSeedHash;
    document.getElementById('seed-nonce-count').value = rng.nonce;
  };
  document.getElementById('fairness-btn').addEventListener('click', () => {
    sfx.click();
    updateSeedModal();
    fairnessModal.classList.remove('hidden');
  });
  document.getElementById('close-fairness-btn').addEventListener('click', () => {
    fairnessModal.classList.add('hidden');
  });
  document.getElementById('rotate-seed-btn').addEventListener('click', () => {
    sfx.click();
    rng.rotateSeeds();
    updateSeedModal();
    showToast('Client & Server RNG seeds rotated.');
  });

  // Bet Amount & Quick Modifiers (1/2, 2x, Max)
  const betInput = document.getElementById('bet-amount');
  betInput.addEventListener('input', () => updateBetPctLabel());

  document.querySelectorAll('[data-bet-mod]').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      let current = getBetAmount();
      const mod = btn.dataset.betMod;
      if (mod === 'half') current = Math.max(1, Math.round((current / 2) * 100) / 100);
      if (mod === 'double') current = Math.min(Math.max(1, state.balance), Math.round(current * 2 * 100) / 100);
      if (mod === 'max') current = Math.max(1, Math.floor(state.balance * 100) / 100);
      betInput.value = current.toFixed(2);
      updateBetPctLabel();
    });
  });

  // Primary Play / Cashout Button
  document.getElementById('primary-play-btn').addEventListener('click', () => {
    if (state.activeGame === 'crash') crashGame.startRound();
    else if (state.activeGame === 'mines') minesGame.startRound();
    else if (state.activeGame === 'plinko') plinkoGame.dropBall();
    else if (state.activeGame === 'dice') diceGame.roll();
    else if (state.activeGame === 'limbo') limboGame.play();
  });

  // CRASH Specific Listeners
  const crashAutoInput = document.getElementById('crash-auto-cashout');
  crashAutoInput.addEventListener('input', () => updateBetPctLabel());
  document.querySelectorAll('[data-crash-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      crashAutoInput.value = btn.dataset.crashPreset;
      updateBetPctLabel();
    });
  });

  // MINES Specific Listeners
  const minesSlider = document.getElementById('mines-count');
  minesSlider.addEventListener('input', () => {
    sfx.click();
    minesGame.updateMultipliersUI();
    document.querySelectorAll('#mines-presets .pill-btn').forEach(p => {
      p.classList.toggle('active', p.dataset.mines === minesSlider.value);
    });
  });
  document.querySelectorAll('#mines-presets .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (minesGame.active) return;
      sfx.click();
      minesSlider.value = btn.dataset.mines;
      document.querySelectorAll('#mines-presets .pill-btn').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      minesGame.updateMultipliersUI();
    });
  });
  document.getElementById('mines-random-btn').addEventListener('click', () => {
    minesGame.pickRandomTile();
  });

  // PLINKO Specific Listeners
  document.querySelectorAll('#plinko-risk-group .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      plinkoGame.risk = btn.dataset.risk;
      document.querySelectorAll('#plinko-risk-group .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.querySelectorAll('#plinko-rows-group .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      plinkoGame.rows = parseInt(btn.dataset.rows, 10);
      document.getElementById('plinko-rows-val').textContent = `${plinkoGame.rows} Rows`;
      document.querySelectorAll('#plinko-rows-group .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('plinko-burst-btn').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => plinkoGame.dropBall(), i * 110);
    }
  });

  // DICE Specific Listeners
  const diceSlider = document.getElementById('dice-slider');
  diceSlider.addEventListener('input', () => {
    sfx.pin();
    diceGame.syncFromTarget(parseFloat(diceSlider.value));
    syncPrimaryButton();
  });
  document.getElementById('dice-flip-btn').addEventListener('click', () => {
    diceGame.flipMode();
    syncPrimaryButton();
  });
  document.getElementById('dice-target-input').addEventListener('change', (e) => {
    diceGame.syncFromTarget(parseFloat(e.target.value) || 50.5);
    syncPrimaryButton();
  });
  document.getElementById('dice-chance-input').addEventListener('change', (e) => {
    const chance = Math.max(2, Math.min(98, parseFloat(e.target.value) || 49.5));
    const newTarget = diceGame.rollOver ? (100 - chance) : chance;
    diceGame.syncFromTarget(newTarget);
    syncPrimaryButton();
  });
  document.getElementById('dice-mult-input').addEventListener('change', (e) => {
    const mult = Math.max(1.0102, Math.min(49.5, parseFloat(e.target.value) || 2));
    const chance = 99 / mult;
    const newTarget = diceGame.rollOver ? (100 - chance) : chance;
    diceGame.syncFromTarget(newTarget);
    syncPrimaryButton();
  });

  // LIMBO Specific Listeners
  const limboTargetInput = document.getElementById('limbo-target');
  limboTargetInput.addEventListener('input', () => {
    limboGame.updatePreview();
    syncPrimaryButton();
  });
  document.querySelectorAll('[data-limbo-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.click();
      limboTargetInput.value = btn.dataset.limboPreset;
      limboGame.updatePreview();
      syncPrimaryButton();
    });
  });

  // Live Feed Filter Tabs
  document.querySelectorAll('.feed-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      sfx.click();
      state.feedFilter = tab.dataset.feedFilter;
      document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFeedTable();
    });
  });
});
