(() => {
'use strict';

// ============================================================
//  基本設定
// ============================================================
const W = 420, HUD = 48, SH = 760, H = HUD + SH;   // 論理サイズ（HUD + シーン）
const GAME_TIME = 60;
const RATE_MIN = 2, RATE_MAX = 10, RATE_RAMP = 3;   // 送り出し速度: 2人/s → 10人/s（3秒で最大）
const WALK = 230;                                    // 案内中の歩く速さ px/s
const QUEUE_SPEED = 420;                             // 行列が詰める速さ px/s
const FONT = '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic UI","Meiryo",sans-serif';
const HI_KEY = 'gyoretsu-hiscore', THEME_KEY = 'gyoretsu-theme';

const cv = document.getElementById('cv');
const c = cv.getContext('2d');
const gameEl = document.getElementById('game');
const btn = document.getElementById('gateBtn');
const $ = id => document.getElementById(id);

let S = 1, DPR = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  S = Math.min(vw / W, vh / H);
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  gameEl.style.setProperty('--s', S);
  cv.width = Math.round(W * S * DPR);
  cv.height = Math.round(H * S * DPR);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ============================================================
//  マップ配置（シーン座標: 0..W × 0..SH）
// ============================================================
const ROAD_X0 = 150, ROAD_X1 = 270, ROAD_CX = 210;
const HROAD_Y0 = 110, HROAD_Y1 = 190, PLAZA_Y = 310;
const BLOCKS = [
  { x: -20, y: -20, w: 170, h: 130, name: 'カフェ' },
  { x: 270, y: -20, w: 170, h: 130, name: 'ラーメン' },
  { x: -20, y: 190, w: 170, h: 120, name: 'パン屋' },
  { x: 270, y: 190, w: 170, h: 120, name: '本屋' },
];
// side: 道路がある方向（+1=右, -1=左）
const DOORS = [
  { x: 150, y: 58, side: 1 },
  { x: 270, y: 58, side: -1 },
  { x: 150, y: 252, side: 1 },
  { x: 270, y: 252, side: -1 },
];
const DOOR_HALF = 17;

// 行列エリア
const QBOX_X = 135, QBOX_Y = 415;
const GATE_X = 135, GATE_Y0 = 420, GATE_LEN = 42;
const SP = 30;                                  // 人の間隔
const QX0 = 152, QX1 = 400, QXL = 165, QY0 = 440, QDY = 40, QROWS = 12;
const PLAYER = { x: 84, y: 462 };

// 行列のジグザグ経路（先頭 → 最後尾）
const qpts = [[QX0, QY0], [QX1, QY0]];
for (let r = 1; r < QROWS; r++) {
  const y = QY0 + r * QDY;
  if (r % 2) qpts.push([QX1, y], [QXL, y]); else qpts.push([QXL, y], [QX1, y]);
}
const qsegs = [];
let QLEN = 0;
for (let i = 0; i < qpts.length - 1; i++) {
  const [x0, y0] = qpts[i], [x1, y1] = qpts[i + 1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  qsegs.push({ x0, y0, x1, y1, len, start: QLEN });
  QLEN += len;
}
const SLOTS = Math.floor(QLEN / SP) + 2;
function posAt(d) {
  if (d <= 0) return { x: QX0, y: QY0 };
  for (const s of qsegs) {
    if (d <= s.start + s.len) {
      const t = (d - s.start) / s.len;
      return { x: s.x0 + (s.x1 - s.x0) * t, y: s.y0 + (s.y1 - s.y0) * t };
    }
  }
  const last = qpts[qpts.length - 1];
  return { x: last[0], y: last[1] + (d - QLEN) };
}
// 仕切り（赤い線）
const DIVS = [];
for (let r = 0; r < QROWS - 1; r++) {
  const y = QY0 + r * QDY + QDY / 2;
  if (r % 2 === 0) DIVS.push({ x0: QBOX_X, x1: QX1 - 22, y });
  else DIVS.push({ x0: QXL + 22, x1: W + 10, y });
}

// ============================================================
//  描画ヘルパー
// ============================================================
function rr(x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function line(x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function circle(x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function ell(x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function text(str, x, y, font, color, align = 'center') {
  c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y);
}
function glow(color, blur) { c.shadowColor = color; c.shadowBlur = blur; }
function noGlow() { c.shadowBlur = 0; c.shadowColor = 'transparent'; }

// ============================================================
//  見た目テーマ（3パターン）
// ============================================================
const SKIN = ['#ffdcb8', '#f3c49b', '#e0ad84', '#ffe6cc'];
const THEMES = {
  // ---------------- 線画：ラフ画に近いシンプルな線 ----------------
  simple: {
    page: '#e8e6df',
    hud: { bg: '#fff', text: '#111', sub: '#888', accent: '#e5332a', barBg: '#e5e5e5', bar: '#111', line: '#111' },
    bubbleShape: 'ellipse',
    req: { fill: '#fff', stroke: '#111', lw: 2.5, text: '#111', sub: '#555' },
    org: { fill: '#fff', stroke: '#f08a24', lw: 2.5, text: '#111', sub: '#f08a24' },
    ok: '#1f9d55', ng: '#e5332a', outline: '#fff', count: '#111',
    bg() { c.fillStyle = '#fff'; c.fillRect(0, 0, W, SH); },
    building(b) {
      c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(b.x, b.y, b.w, b.h);
      text(b.name, b.x + b.w / 2, b.y + b.h / 2 + 8, `500 13px ${FONT}`, '#aaa');
    },
    door(d, k) {
      c.fillStyle = '#fff'; c.fillRect(d.x - 4, d.y - DOOR_HALF, 8, DOOR_HALF * 2);
      c.strokeStyle = '#111'; c.lineWidth = 3; c.lineCap = 'butt';
      line(d.x - 7, d.y - DOOR_HALF, d.x + 7, d.y - DOOR_HALF);
      line(d.x - 7, d.y + DOOR_HALF, d.x + 7, d.y + DOOR_HALF);
      const a = k * Math.PI * 0.45;
      c.lineWidth = 2.5;
      line(d.x, d.y - DOOR_HALF, d.x - d.side * Math.sin(a) * DOOR_HALF * 2, d.y - DOOR_HALF + Math.cos(a) * DOOR_HALF * 2);
    },
    queueArea() {
      c.strokeStyle = '#111'; c.lineWidth = 3; c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(QBOX_X, GATE_Y0); c.lineTo(QBOX_X, QBOX_Y); c.lineTo(W + 5, QBOX_Y);
      c.moveTo(QBOX_X, GATE_Y0 + GATE_LEN); c.lineTo(QBOX_X, SH + 5);
      c.stroke();
      c.strokeStyle = '#e5332a'; c.lineWidth = 3;
      for (const d of DIVS) line(d.x0, d.y, d.x1, d.y);
    },
    person(p, x, y) {
      c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2.6;
      ell(x, y, 12, 9); c.fill(); c.stroke();
    },
    player(x, y, a) {
      c.strokeStyle = '#f08a24'; c.lineWidth = 3; c.fillStyle = '#fff';
      circle(x, y - 36, 10); c.fill(); c.stroke();
      ell(x, y, 13, 24); c.fill(); c.stroke();
      // 腕
      c.lineWidth = 3; c.lineCap = 'round';
      line(x + 11, y - 10, x + 24, y - 10 - a * 14);
      for (const [i, ch] of ['あ', 'な', 'た'].entries()) text(ch, x, y - 12 + i * 12, `800 11px ${FONT}`, '#f08a24');
    },
    gate(k) {
      c.save(); c.translate(GATE_X, GATE_Y0); c.rotate(k * Math.PI / 2);
      c.fillStyle = '#dfe6ff'; c.strokeStyle = '#2f49d1'; c.lineWidth = 3;
      c.fillRect(-6, 0, 12, GATE_LEN); c.strokeRect(-6, 0, 12, GATE_LEN);
      c.restore();
      text('ゲート', GATE_X - 6, GATE_Y0 - 14, `500 10px ${FONT}`, '#555');
    },
  },

  // ---------------- ポップ：明るい色の街並み ----------------
  pop: {
    page: '#ffd9a8',
    hud: { bg: '#ff7a2f', text: '#fff', sub: 'rgba(255,255,255,.85)', accent: '#fff36b', barBg: 'rgba(0,0,0,.18)', bar: '#fff36b', line: null },
    bubbleShape: 'round',
    req: { fill: '#fff', stroke: '#2d2d2d', lw: 2.5, text: '#2d2d2d', sub: '#8a7a66', shadow: 'rgba(0,0,0,.18)' },
    org: { fill: '#fff8ee', stroke: '#ff7a1a', lw: 2.5, text: '#ff7a1a', sub: '#ff7a1a', shadow: 'rgba(0,0,0,.15)' },
    ok: '#12b886', ng: '#f03e3e', outline: '#fff', count: '#ff7a1a',
    cols: ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b', '#20c997', '#f06595'],
    hair: ['#3b2a20', '#1e1e1e', '#7a4b2a', '#c98b3c', '#5c5c5c'],
    bg() {
      c.fillStyle = '#f6e7cc'; c.fillRect(0, 0, W, SH);
      c.strokeStyle = '#ead6b1'; c.lineWidth = 1;
      for (let x = 0; x <= W; x += 30) line(x + .5, PLAZA_Y, x + .5, SH);
      for (let y = PLAZA_Y; y <= SH; y += 30) line(0, y + .5, W, y + .5);
      // 道路
      c.fillStyle = '#5f6472';
      c.fillRect(ROAD_X0, 0, ROAD_X1 - ROAD_X0, PLAZA_Y);
      c.fillRect(0, HROAD_Y0, W, HROAD_Y1 - HROAD_Y0);
      // 縁石
      c.fillStyle = '#cfd3da';
      c.fillRect(ROAD_X0 - 6, PLAZA_Y - 6, ROAD_X1 - ROAD_X0 + 12, 6);
      // センターライン
      c.strokeStyle = '#ffd43b'; c.lineWidth = 3; c.setLineDash([12, 10]);
      line(ROAD_CX, 0, ROAD_CX, HROAD_Y0 - 22); line(ROAD_CX, HROAD_Y1 + 22, ROAD_CX, PLAZA_Y - 10);
      line(0, (HROAD_Y0 + HROAD_Y1) / 2, ROAD_X0 - 22, (HROAD_Y0 + HROAD_Y1) / 2);
      line(ROAD_X1 + 22, (HROAD_Y0 + HROAD_Y1) / 2, W, (HROAD_Y0 + HROAD_Y1) / 2);
      c.setLineDash([]);
      // 横断歩道
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let x = ROAD_X0 + 6; x < ROAD_X1 - 6; x += 14) { c.fillRect(x, HROAD_Y0 - 18, 8, 14); c.fillRect(x, HROAD_Y1 + 4, 8, 14); }
    },
    building(b, i) {
      const col = ['#ff8787', '#ffd43b', '#69db7c', '#74c0fc'][i];
      const dk = ['#e35d5d', '#e6b100', '#3fb950', '#4a9be0'][i];
      c.fillStyle = dk; rr(b.x, b.y, b.w, b.h, 10); c.fill();
      c.fillStyle = col; rr(b.x + 7, b.y + 7, b.w - 14, b.h - 14, 6); c.fill();
      // 屋上の設備
      c.fillStyle = 'rgba(255,255,255,.55)';
      const vx = i % 2 ? b.x + b.w - 60 : b.x + 40;
      rr(vx, b.y + b.h - 34, 22, 16, 3); c.fill();
      rr(vx + 28, b.y + b.h - 34, 14, 16, 3); c.fill();
      // 看板
      const cx = b.x + b.w / 2 + (i % 2 ? 8 : -8), cy = b.y + b.h / 2 - 2;
      c.font = `800 13px ${FONT}`;
      const tw = c.measureText(b.name).width + 18;
      c.fillStyle = '#fff'; rr(cx - tw / 2, cy - 12, tw, 24, 12); c.fill();
      text(b.name, cx, cy + 1, `800 13px ${FONT}`, dk);
    },
    door(d, k) {
      const x = d.x, y = d.y, s = d.side;
      if (k > 0.01) {
        // 店内の光
        c.fillStyle = `rgba(255,236,150,${0.45 * k})`;
        c.beginPath();
        c.moveTo(x, y - DOOR_HALF); c.lineTo(x + s * 40, y - DOOR_HALF - 10);
        c.lineTo(x + s * 40, y + DOOR_HALF + 10); c.lineTo(x, y + DOOR_HALF); c.closePath(); c.fill();
      }
      c.fillStyle = '#3a2a22'; c.fillRect(x - 6, y - DOOR_HALF, 12, DOOR_HALF * 2);
      // 玄関マット
      c.fillStyle = '#c0392b'; c.fillRect(s > 0 ? x + 6 : x - 14, y - 12, 8, 24);
      // 扉（開くと上に引き込まれる）
      c.fillStyle = '#9c6b45';
      c.fillRect(x - 5, y - DOOR_HALF, 10, DOOR_HALF * 2 * (1 - k));
      c.fillStyle = '#ffd43b';
      if (k < 0.5) { circle(x + s * 2, y, 1.8); c.fill(); }
    },
    queueArea() {
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(QBOX_X, QBOX_Y, W - QBOX_X, SH - QBOX_Y);
      const belt = (x0, y0, x1, y1) => {
        c.lineCap = 'round';
        c.strokeStyle = '#d63a3a'; c.lineWidth = 5; line(x0, y0, x1, y1);
        c.strokeStyle = '#ff8a8a'; c.lineWidth = 1.5; line(x0, y0 - 1, x1, y1 - 1);
      };
      const post = (x, y) => {
        c.fillStyle = 'rgba(0,0,0,.15)'; ell(x + 1, y + 3, 6, 3); c.fill();
        c.fillStyle = '#868e96'; circle(x, y, 5.5); c.fill();
        c.fillStyle = '#e9ecef'; circle(x - 1, y - 1, 2.5); c.fill();
      };
      belt(QBOX_X, QBOX_Y, W + 5, QBOX_Y);
      belt(QBOX_X, GATE_Y0 + GATE_LEN, QBOX_X, SH + 5);
      for (const d of DIVS) belt(d.x0, d.y, Math.min(d.x1, W + 5), d.y);
      post(QBOX_X, QBOX_Y); post(QBOX_X, GATE_Y0 + GATE_LEN);
      for (const d of DIVS) { if (d.x0 > QBOX_X) post(d.x0, d.y); if (d.x1 < W) post(d.x1, d.y); post(QBOX_X, d.y); }
    },
    person(p, x, y, walk, t) {
      const T = THEMES.pop;
      const bob = walk ? -Math.abs(Math.sin(t * 12 + p.seed)) * 3 : Math.sin(t * 2 + p.seed) * 0.6;
      c.fillStyle = 'rgba(0,0,0,.18)'; ell(x, y + 10, 10, 3.5); c.fill();
      c.fillStyle = T.cols[p.c % T.cols.length]; rr(x - 9, y - 3 + bob, 18, 14, 7); c.fill();
      c.fillStyle = SKIN[p.h % SKIN.length]; circle(x, y - 9 + bob, 8); c.fill();
      c.fillStyle = T.hair[p.h % T.hair.length];
      c.beginPath(); c.arc(x, y - 10 + bob, 8.4, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
      c.fillStyle = '#222';
      circle(x - 3, y - 7 + bob, 1.2); c.fill(); circle(x + 3, y - 7 + bob, 1.2); c.fill();
    },
    player(x, y, a) {
      c.fillStyle = 'rgba(0,0,0,.2)'; ell(x, y + 18, 16, 5); c.fill();
      // 腕
      c.strokeStyle = '#ff7a1a'; c.lineWidth = 6; c.lineCap = 'round';
      line(x + 10, y - 6, x + 24, y - 6 - a * 16);
      c.fillStyle = SKIN[0]; circle(x + 24, y - 6 - a * 16, 3.6); c.fill();
      // 体
      c.fillStyle = '#ff7a1a'; rr(x - 13, y - 14, 26, 32, 11); c.fill();
      c.fillStyle = '#fff36b'; c.fillRect(x - 13, y + 2, 26, 4);
      // 頭
      c.fillStyle = SKIN[0]; circle(x, y - 26, 12); c.fill();
      c.fillStyle = '#ff7a1a';
      c.beginPath(); c.arc(x, y - 28, 12.5, Math.PI, 0); c.closePath(); c.fill();
      c.fillRect(x - 2, y - 30, 18, 4);
      c.fillStyle = '#222'; circle(x - 4, y - 23, 1.5); c.fill(); circle(x + 4, y - 23, 1.5); c.fill();
      // 名札
      c.fillStyle = '#fff'; rr(x - 20, y + 24, 40, 16, 8); c.fill();
      text('あなた', x, y + 32.5, `800 10px ${FONT}`, '#ff7a1a');
    },
    gate(k) {
      c.save(); c.translate(GATE_X, GATE_Y0); c.rotate(k * Math.PI / 2);
      c.fillStyle = 'rgba(0,0,0,.15)'; rr(-2, 3, 8, GATE_LEN, 4); c.fill();
      c.fillStyle = '#fff'; rr(-4, 0, 8, GATE_LEN, 4); c.fill();
      c.fillStyle = '#2f6bff';
      for (let i = 0; i < 4; i++) c.fillRect(-4, 4 + i * 10, 8, 5);
      c.restore();
      c.fillStyle = '#1c46b8'; circle(GATE_X, GATE_Y0, 6.5); c.fill();
      c.fillStyle = '#74a1ff'; circle(GATE_X - 1.5, GATE_Y0 - 1.5, 2.5); c.fill();
    },
  },

  // ---------------- ネオン：夜の繁華街 ----------------
  neon: {
    page: '#05060d',
    hud: { bg: '#0b0e1f', text: '#eaf2ff', sub: '#7c88b8', accent: '#ff4fd8', barBg: '#1b2140', bar: '#3df2ff', line: '#3df2ff55' },
    bubbleShape: 'round',
    req: { fill: '#0c1026', stroke: '#3df2ff', lw: 2, text: '#fff', sub: '#8fa0d8', glow: '#3df2ff' },
    org: { fill: '#0c1026', stroke: '#ff9a3d', lw: 2, text: '#ffb36b', sub: '#ff9a3d', glow: '#ff9a3d' },
    ok: '#b4ff39', ng: '#ff3b6b', outline: '#05060d', count: '#3df2ff',
    cols: ['#3df2ff', '#ff4fd8', '#b4ff39', '#ffd23d', '#9d7bff', '#ff7b3d'],
    bg() {
      c.fillStyle = '#0a0c1a'; c.fillRect(0, 0, W, SH);
      c.strokeStyle = 'rgba(61,242,255,.07)'; c.lineWidth = 1;
      for (let x = 0; x <= W; x += 24) line(x + .5, PLAZA_Y, x + .5, SH);
      for (let y = PLAZA_Y; y <= SH; y += 24) line(0, y + .5, W, y + .5);
      c.fillStyle = '#121733';
      c.fillRect(ROAD_X0, 0, ROAD_X1 - ROAD_X0, PLAZA_Y);
      c.fillRect(0, HROAD_Y0, W, HROAD_Y1 - HROAD_Y0);
      c.strokeStyle = 'rgba(255,79,216,.55)'; c.lineWidth = 2; c.setLineDash([10, 12]);
      line(ROAD_CX, 0, ROAD_CX, PLAZA_Y);
      line(0, (HROAD_Y0 + HROAD_Y1) / 2, W, (HROAD_Y0 + HROAD_Y1) / 2);
      c.setLineDash([]);
    },
    building(b, i) {
      const col = ['#ff4fd8', '#3df2ff', '#ffd23d', '#b4ff39'][i];
      c.fillStyle = '#141936'; rr(b.x, b.y, b.w, b.h, 8); c.fill();
      glow(col, 14); c.strokeStyle = col; c.lineWidth = 2.5;
      rr(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 8); c.stroke();
      const cx = b.x + b.w / 2 + (i % 2 ? 8 : -8), cy = b.y + b.h / 2;
      text(b.name, cx, cy, `800 15px ${FONT}`, col);
      noGlow();
    },
    door(d, k) {
      const x = d.x, y = d.y, s = d.side;
      c.fillStyle = '#0a0c1a'; c.fillRect(x - 5, y - DOOR_HALF, 10, DOOR_HALF * 2);
      if (k > 0.01) {
        const g = c.createLinearGradient(x, 0, x + s * 50, 0);
        g.addColorStop(0, `rgba(255,224,102,${0.5 * k})`); g.addColorStop(1, 'rgba(255,224,102,0)');
        c.fillStyle = g; c.fillRect(s > 0 ? x : x - 50, y - DOOR_HALF - 6, 50, DOOR_HALF * 2 + 12);
        glow('#ffe066', 16 * k); c.fillStyle = `rgba(255,224,102,${k})`;
        c.fillRect(x - 3, y - DOOR_HALF, 6, DOOR_HALF * 2); noGlow();
      }
      c.strokeStyle = '#4b5384'; c.lineWidth = 3;
      const len = DOOR_HALF * 2 * (1 - k);
      if (len > 1) line(x, y - DOOR_HALF, x, y - DOOR_HALF + len);
    },
    queueArea() {
      glow('#3df2ff', 10); c.strokeStyle = '#3df2ff'; c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(QBOX_X, GATE_Y0); c.lineTo(QBOX_X, QBOX_Y); c.lineTo(W + 5, QBOX_Y);
      c.moveTo(QBOX_X, GATE_Y0 + GATE_LEN); c.lineTo(QBOX_X, SH + 5);
      c.stroke();
      glow('#ff3b6b', 10); c.strokeStyle = '#ff3b6b'; c.lineWidth = 2.5;
      c.beginPath();
      for (const d of DIVS) { c.moveTo(d.x0, d.y); c.lineTo(d.x1, d.y); }
      c.stroke();
      noGlow();
    },
    person(p, x, y, walk, t) {
      const T = THEMES.neon;
      const col = T.cols[p.c % T.cols.length];
      const bob = walk ? -Math.abs(Math.sin(t * 12 + p.seed)) * 2 : 0;
      c.fillStyle = '#0f1430'; ell(x, y + bob, 11, 9); c.fill();
      c.strokeStyle = col; c.globalAlpha = .25; c.lineWidth = 6; c.stroke();
      c.globalAlpha = 1; c.lineWidth = 2; c.stroke();
      c.fillStyle = col; circle(x, y - 1 + bob, 3); c.fill();
    },
    player(x, y, a) {
      glow('#ff9a3d', 14); c.strokeStyle = '#ff9a3d'; c.lineWidth = 2.5; c.fillStyle = '#1a1230';
      circle(x, y - 34, 10); c.fill(); c.stroke();
      ell(x, y, 13, 22); c.fill(); c.stroke();
      c.lineCap = 'round'; line(x + 11, y - 8, x + 24, y - 8 - a * 14);
      for (const [i, ch] of ['あ', 'な', 'た'].entries()) text(ch, x, y - 12 + i * 12, `800 11px ${FONT}`, '#ffb36b');
      noGlow();
    },
    gate(k) {
      c.save(); c.translate(GATE_X, GATE_Y0); c.rotate(k * Math.PI / 2);
      glow('#4d7bff', 14); c.strokeStyle = '#6f95ff'; c.lineWidth = 3; c.fillStyle = '#121a44';
      rr(-5, 0, 10, GATE_LEN, 5); c.fill(); c.stroke();
      noGlow(); c.restore();
    },
  },
};

// ============================================================
//  ゲーム状態
// ============================================================
let themeKey = store.get(THEME_KEY, 'pop');
if (!THEMES[themeKey]) themeKey = 'pop';
let T = THEMES[themeKey];
let state = 'title';          // title | count | play | over
let g = null;
let hiScore = parseInt(store.get(HI_KEY, '0'), 10) || 0;
let clock = 0;                // 経過時間（アニメ用）
const doorK = [0, 0, 0, 0];
const reel = [0, 0, 0];       // リール表示（各桁の累積値）

function newPerson() {
  return { c: randi(0, 99), h: randi(0, 99), seed: rand(0, 10) };
}
function newGame() {
  g = {
    time: GAME_TIME, score: 0, combo: 0, maxCombo: 0, ok: 0, people: 0, miss: 0,
    req: null, nextReq: 0.9, lastDoor: -1,
    open: false, gateK: 0, openT: 0, acc: 0, pAnim: 0,
    queue: [], walkers: [], floats: [], countdown: 3.4,
  };
  for (let i = 0; i < SLOTS; i++) { const p = newPerson(); p.d = i * SP; g.queue.push(p); }
  updateBtn();
}

function newRequest() {
  const elapsed = GAME_TIME - g.time;
  const k = clamp(elapsed / GAME_TIME, 0, 1);
  const lo = 3 + Math.floor(k * 4);
  const hi = Math.round(8 + 22 * k);
  let door;
  do { door = randi(0, 3); } while (door === g.lastDoor);
  g.lastDoor = door;
  g.req = { door, n: randi(lo, hi), sent: 0, arrived: 0, locked: false, t: 0 };
}

function releaseOne() {
  const p = g.queue.shift();
  const pos = posAt(p.d);
  const d = DOORS[g.req.door];
  const j = rand(-10, 10);
  g.walkers.push({
    ...p, x: pos.x, y: pos.y, wi: 0,
    wp: [
      [GATE_X - 10, GATE_Y0 + 20],
      [GATE_X - 22, 392],
      [ROAD_CX + j, PLAZA_Y + 18],
      [ROAD_CX + j, d.y + rand(-6, 6)],
      [d.x + d.side * 2, d.y],
    ],
  });
  g.req.sent++;
}

function judge() {
  const r = g.req;
  const d = DOORS[r.door];
  const fx = d.x + d.side * 60, fy = d.y - 10;
  const diff = r.sent - r.n;
  if (diff === 0) {
    g.combo++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    const mult = 1 + 0.2 * Math.min(g.combo - 1, 10);
    const pts = Math.round((r.n * 10 + 100) * mult);
    g.score += pts; g.ok++; g.people += r.n;
    addFloat('ぴったり！', fx, fy, T.ok, 20);
    addFloat(`+${pts}` + (g.combo >= 2 ? `  ${g.combo}コンボ` : ''), fx, fy + 24, T.ok, 14);
  } else {
    g.combo = 0; g.miss++;
    addFloat(diff > 0 ? `${diff}人多い…` : `${-diff}人足りない…`, fx, fy, T.ng, 18);
  }
  g.req = null;
  g.nextReq = rand(0.5, 2);
}
function checkJudge() {
  const r = g.req;
  if (r && r.locked && r.arrived === r.sent) judge();
}
function addFloat(str, x, y, color, size) {
  g.floats.push({ str, x: clamp(x, 70, W - 70), y, color, size, t: 0 });
}

function toggleGate() {
  if (state !== 'play') return;
  g.open = !g.open;
  g.pAnim = 1;
  if (g.open) {
    g.openT = 0; g.acc = 1;           // 開けた瞬間に1人目が出る
  } else if (g.req && g.req.sent > 0 && !g.req.locked) {
    g.req.locked = true;              // 閉めた時点で集団の人数が確定
    checkJudge();
  }
  updateBtn();
}
function updateBtn() {
  const open = g && g.open;
  btn.classList.toggle('open', !!open);
  btn.querySelector('.l1').textContent = open ? '閉める' : '開ける';
  btn.disabled = state !== 'play';
}

// ============================================================
//  更新
// ============================================================
function update(dt) {
  clock += dt;
  if (state === 'count') {
    g.countdown -= dt;
    if (g.countdown <= 0) { state = 'play'; updateBtn(); }
  }
  if (state === 'play') {
    g.time -= dt;
    if (g.time <= 0) { g.time = 0; endGame(); }
  }
  if (state === 'play') {
    if (!g.req) { g.nextReq -= dt; if (g.nextReq <= 0) newRequest(); }
    if (g.req) g.req.t += dt;
    // 送り出し（開けている間に加速）
    if (g.open && g.req && !g.req.locked) {
      g.openT += dt;
      const k = Math.min(1, g.openT / RATE_RAMP);
      const rate = RATE_MIN + (RATE_MAX - RATE_MIN) * k * k;
      g.acc += rate * dt;
      while (g.acc >= 1) { g.acc -= 1; releaseOne(); }
    }
  }
  g.gateK += ((g.open ? 1 : 0) - g.gateK) * Math.min(1, dt * 18);
  g.pAnim = Math.max(0, g.pAnim - dt * 3);

  // 行列を詰める・補充
  const q = g.queue;
  for (let i = 0; i < q.length; i++) q[i].d = Math.max(i * SP, q[i].d - QUEUE_SPEED * dt);
  while (q.length < SLOTS) {
    const p = newPerson();
    p.d = Math.max(QLEN + SP, (q.length ? q[q.length - 1].d : 0) + SP);
    q.push(p);
  }

  // 案内中の人
  for (let i = g.walkers.length - 1; i >= 0; i--) {
    const w = g.walkers[i];
    let move = WALK * dt;
    while (move > 0 && w.wi < w.wp.length) {
      const [tx, ty] = w.wp[w.wi];
      const dx = tx - w.x, dy = ty - w.y, dist = Math.hypot(dx, dy);
      if (dist <= move) { w.x = tx; w.y = ty; move -= dist; w.wi++; }
      else { w.x += dx / dist * move; w.y += dy / dist * move; move = 0; }
    }
    if (w.wi >= w.wp.length) {
      g.walkers.splice(i, 1);
      if (g.req) { g.req.arrived++; checkJudge(); }
    }
  }

  for (let i = 0; i < 4; i++) {
    const target = g.req && g.req.door === i ? 1 : 0;
    doorK[i] += (target - doorK[i]) * Math.min(1, dt * 10);
  }

  // リール
  const shown = g.req ? g.req.sent : 0;
  for (let p = 0; p < reel.length; p++) {
    const tgt = Math.floor(shown / 10 ** p);
    reel[p] += (tgt - reel[p]) * Math.min(1, dt * 16);
    if (Math.abs(tgt - reel[p]) < 0.002) reel[p] = tgt;
  }

  for (let i = g.floats.length - 1; i >= 0; i--) {
    const f = g.floats[i];
    f.t += dt; f.y -= 22 * dt;
    if (f.t > 1.3) g.floats.splice(i, 1);
  }
}

// ============================================================
//  描画
// ============================================================
function bubblePath(shape, x, y, w, h) {
  if (shape === 'ellipse') ell(x, y, w / 2, h / 2);
  else rr(x - w / 2, y - h / 2, w, h, Math.min(16, h / 2));
}
function tailPath(x, y, w, h, tx, ty) {
  const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  const bx = x + dx / L * Math.min(w, h) * 0.2, by = y + dy / L * Math.min(w, h) * 0.2;
  c.beginPath();
  c.moveTo(bx + px * 9, by + py * 9); c.lineTo(tx, ty); c.lineTo(bx - px * 9, by - py * 9); c.closePath();
}
function drawBubble(st, x, y, w, h, tx, ty) {
  const shape = T.bubbleShape;
  c.save();
  c.lineJoin = 'round';
  if (st.shadow) {
    c.fillStyle = st.shadow;
    tailPath(x, y + 4, w, h, tx, ty + 4); c.fill();
    bubblePath(shape, x, y + 4, w, h); c.fill();
  }
  if (st.glow) glow(st.glow, 14);
  c.strokeStyle = st.stroke; c.lineWidth = st.lw * 2;
  tailPath(x, y, w, h, tx, ty); c.stroke();
  bubblePath(shape, x, y, w, h); c.stroke();
  noGlow();
  c.fillStyle = st.fill;
  tailPath(x, y, w, h, tx, ty); c.fill();
  bubblePath(shape, x, y, w, h); c.fill();
  c.restore();
}

function drawRequest() {
  const r = g.req;
  if (!r) return;
  const d = DOORS[r.door];
  const bx = d.x + d.side * 64, by = d.y - 26;
  const t = Math.min(1, r.t * 5);
  const s = 1 + 0.25 * Math.sin(t * Math.PI) * (1 - t) + (t < 1 ? (t - 1) * 0.6 : 0);
  c.save();
  c.translate(bx, by); c.scale(s, s);
  drawBubble(T.req, 0, 0, 112, 62, (d.x + d.side * 4) - bx, (d.y + 2) - by);
  c.font = `800 26px ${FONT}`;
  const nw = c.measureText(String(r.n)).width;
  c.font = `800 15px ${FONT}`;
  const uw = c.measureText('人').width;
  const x0 = -(nw + uw + 3) / 2;
  text(String(r.n), x0, -7, `800 26px ${FONT}`, T.req.text, 'left');
  text('人', x0 + nw + 3, -4, `800 15px ${FONT}`, T.req.text, 'left');
  text(r.locked ? 'まってま〜す' : 'くださ〜い', 0, 16, `500 10px ${FONT}`, T.req.sub);
  c.restore();
}

function drawOrange() {
  const x = 66, y = 362, w = 104, h = 56;
  drawBubble(T.org, x, y, w, h, PLAYER.x + 8, PLAYER.y - 50);
  // 表示する桁数
  let digits = 1;
  for (let p = reel.length - 1; p > 0; p--) if (reel[p] > 0.01) { digits = p + 1; break; }
  const DW = 17, DH = 30;
  const totalW = digits * DW + 4 + 16;
  let x0 = x - totalW / 2;
  c.save();
  c.beginPath(); c.rect(x0 - 2, y - DH / 2 - 2, digits * DW + 4, DH + 2); c.clip();
  for (let i = 0; i < digits; i++) {
    const p = digits - 1 - i;
    const v = reel[p];
    const base = Math.floor(v), frac = v - base;
    const cx = x0 + i * DW + DW / 2;
    const f = `800 27px ${FONT}`;
    text(String(((base % 10) + 10) % 10), cx, y - frac * DH, f, T.org.text);
    if (frac > 0.001) text(String((((base + 1) % 10) + 10) % 10), cx, y + (1 - frac) * DH, f, T.org.text);
  }
  c.restore();
  text('人', x0 + digits * DW + 4, y + 4, `800 14px ${FONT}`, T.org.sub, 'left');
}

function drawHUD() {
  const hd = T.hud;
  c.fillStyle = hd.bg; c.fillRect(0, 0, W, HUD);
  if (hd.line) { c.fillStyle = hd.line; c.fillRect(0, HUD - 1, W, 1); }
  const t = g ? Math.max(0, g.time) : GAME_TIME;
  text('のこり', 14, 13, `500 10px ${FONT}`, hd.sub, 'left');
  text(t.toFixed(1), 14, 31, `800 22px ${FONT}`, t <= 10 ? hd.accent : hd.text, 'left');
  text('スコア', W / 2, 13, `500 10px ${FONT}`, hd.sub);
  text(String(g ? g.score : 0), W / 2, 31, `800 22px ${FONT}`, hd.text);
  if (g && g.combo >= 2) {
    text('コンボ', W - 14, 13, `500 10px ${FONT}`, hd.sub, 'right');
    text(`×${g.combo}`, W - 14, 31, `800 22px ${FONT}`, hd.accent, 'right');
  } else {
    text('ハイスコア', W - 14, 13, `500 10px ${FONT}`, hd.sub, 'right');
    text(String(hiScore), W - 14, 31, `800 18px ${FONT}`, hd.text, 'right');
  }
  c.fillStyle = hd.barBg; c.fillRect(0, HUD - 4, W, 4);
  c.fillStyle = t <= 10 ? hd.accent : hd.bar; c.fillRect(0, HUD - 4, W * t / GAME_TIME, 4);
}

function outlinedText(str, x, y, size, color, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = size * 0.28; c.strokeStyle = T.outline;
  c.strokeText(str, x, y);
  c.fillStyle = color; c.fillText(str, x, y);
  c.restore();
}

function draw() {
  c.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
  c.clearRect(0, 0, W, H);
  c.save();
  c.translate(0, HUD);
  c.beginPath(); c.rect(0, 0, W, SH); c.clip();

  T.bg();
  BLOCKS.forEach((b, i) => T.building(b, i));
  DOORS.forEach((d, i) => T.door(d, doorK[i]));
  T.queueArea();

  // 人（y順に描いて重なりを自然に）
  const list = [];
  for (const p of g.queue) {
    const pos = posAt(p.d);
    if (pos.y < SH + 20) list.push([p, pos.x, pos.y, false]);
  }
  for (const w of g.walkers) list.push([w, w.x, w.y, true]);
  list.sort((a, b) => a[2] - b[2]);
  for (const [p, x, y, walk] of list) T.person(p, x, y, walk, clock);

  T.player(PLAYER.x, PLAYER.y, g.open ? 1 - g.pAnim * 0.3 : g.pAnim * 0.5);
  T.gate(g.gateK);

  drawRequest();
  drawOrange();

  for (const f of g.floats) outlinedText(f.str, f.x, f.y, f.size, f.color, f.t > 0.9 ? Math.max(0, 1 - (f.t - 0.9) / 0.4) : 1);

  if (state === 'count') {
    const n = Math.ceil(g.countdown - 0.4);
    const str = n > 0 ? String(n) : 'スタート！';
    const k = (g.countdown - 0.4) % 1;
    outlinedText(str, W / 2, 300, n > 0 ? 70 + k * 20 : 48, T.count);
  }
  c.restore();
  drawHUD();
}

// ============================================================
//  画面遷移
// ============================================================
function applyTheme(key) {
  themeKey = key; T = THEMES[key];
  gameEl.dataset.theme = key;
  document.documentElement.style.background = T.page;
  document.body.style.background = T.page;
  for (const b of document.querySelectorAll('.themes button')) b.classList.toggle('on', b.dataset.theme === key);
  store.set(THEME_KEY, key);
}
function startGame() {
  newGame();
  for (let i = 0; i < 4; i++) doorK[i] = 0;
  reel.fill(0);
  state = 'count';
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  updateBtn();
}
function endGame() {
  state = 'over';
  g.open = false;
  updateBtn();
  const isNew = g.score > hiScore;
  if (isNew) { hiScore = g.score; store.set(HI_KEY, String(hiScore)); }
  $('rScore').textContent = g.score;
  $('rOk').textContent = `${g.ok}回`;
  $('rPeople').textContent = `${g.people}人`;
  $('rMiss').textContent = `${g.miss}回`;
  $('rCombo').textContent = g.maxCombo;
  $('rNew').classList.toggle('hidden', !isNew);
  setTimeout(() => $('result').classList.remove('hidden'), 700);
}
function toTitle() {
  state = 'title';
  newGame();
  $('hiTitle').textContent = hiScore;
  $('result').classList.add('hidden');
  $('title').classList.remove('hidden');
  updateBtn();
}

// 入力
btn.addEventListener('pointerdown', e => { e.preventDefault(); toggleGate(); });
btn.addEventListener('click', e => { if (e.detail === 0) toggleGate(); }); // キーボードでボタン操作した場合
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') {
    if (e.repeat) return;
    if (state === 'play') { e.preventDefault(); toggleGate(); }
  }
});
document.addEventListener('contextmenu', e => e.preventDefault());
for (const b of document.querySelectorAll('.themes button')) b.addEventListener('click', () => applyTheme(b.dataset.theme));
$('startBtn').addEventListener('click', startGame);
$('retryBtn').addEventListener('click', startGame);
$('toTitleBtn').addEventListener('click', toTitle);

// テーマは URL (?theme=neon) でも指定可能
const qTheme = new URLSearchParams(location.search).get('theme');
applyTheme(THEMES[qTheme] ? qTheme : themeKey);
toTitle();

// テスト用フック（?debug のときだけ）
if (new URLSearchParams(location.search).has('debug')) {
  window.__q = { update, draw, toggleGate, startGame, get g() { return g; }, get state() { return state; } };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
})();
