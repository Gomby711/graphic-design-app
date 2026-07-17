// ── Canvas setup ─────────────────────────────────────────────────────────

const wheelCanvas = document.getElementById('colorWheel');
const wCtx = wheelCanvas.getContext('2d');

const SIZE    = 440;
const CX      = SIZE / 2, CY = SIZE / 2;
const WHEEL_R = 210;   // color wheel radius
const HUB_R   = 0;     // no hub — wheel fills to center

// ── Draw inner colour wheel ───────────────────────────────────────────────

// The base wheel image (hue × saturation at L=50) is constant, so build it
// once and cache it. Redrawing all ~194k pixels on every drag/slider move was
// locking the main thread on phones (freeze / no scroll).
let wheelBase = null;
function buildWheelBase() {
  const imageData = wCtx.createImageData(SIZE, SIZE);
  const data = imageData.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - CX, dy = y - CY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > WHEEL_R || dist < HUB_R) continue;

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      const sat = ((dist - HUB_R) / (WHEEL_R - HUB_R)) * 100;
      const [r, g, b] = hslToRgb(angle, sat, 50);

      const idx = (y * SIZE + x) * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
    }
  }
  wheelBase = imageData;
}

function drawWheel(harmonyList) {
  if (!wheelBase) buildWheelBase();
  wCtx.clearRect(0, 0, SIZE, SIZE);
  wCtx.putImageData(wheelBase, 0, 0);

  // Harmony dots on wheel (from Figma ColorWheel.tsx)
  if (harmonyList) {
    harmonyList.slice(1).forEach(c => {
      const a = (c.h) * (Math.PI / 180);
      const dist = (c.s / 100) * (WHEEL_R - HUB_R) + HUB_R;
      const x = CX + Math.cos(a) * dist;
      const y = CY + Math.sin(a) * dist;

      wCtx.beginPath();
      wCtx.arc(x, y, 8, 0, Math.PI * 2);
      wCtx.fillStyle = `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
      wCtx.fill();
      wCtx.strokeStyle = '#ffffff';
      wCtx.lineWidth = 2;
      wCtx.stroke();
    });
  }

  // Main selector dot
  const mainA = currentH * (Math.PI / 180);
  const mainDist = (currentS / 100) * (WHEEL_R - HUB_R) + HUB_R;
  const mx = CX + Math.cos(mainA) * mainDist;
  const my = CY + Math.sin(mainA) * mainDist;

  wCtx.beginPath();
  wCtx.arc(mx, my, 12, 0, Math.PI * 2);
  wCtx.fillStyle = '#ffffff';
  wCtx.fill();
  wCtx.strokeStyle = '#000000';
  wCtx.lineWidth = 2.5;
  wCtx.stroke();
}

// ── Update color value display ────────────────────────────────────────────

function updateValues(r, g, b) {
  const hex = rgbToHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [oL, oC, oH] = rgbToOklch(r, g, b);

  document.getElementById('hexVal').textContent   = hex;
  document.getElementById('rgbVal').textContent   = `${r}, ${g}, ${b}`;
  document.getElementById('hslVal').textContent   = `${h}°, ${s}%, ${l}%`;
  const oklchEl = document.getElementById('oklchVal');
  if (oklchEl) oklchEl.textContent = `${oL}, ${oC}, ${oH}°`;

  document.getElementById('mainSwatch').style.background = hex;
  document.getElementById('cursor').style.background = hex;

  // Update lightness slider gradient
  const sl = document.getElementById('lightnessSlider');
  sl.style.background = `linear-gradient(to right,
    hsl(${currentH}, ${currentS}%, 0%),
    hsl(${currentH}, ${currentS}%, 50%),
    hsl(${currentH}, ${currentS}%, 100%))`;
}

// ── Harmony definitions (from Figma HarmonyDiagram + ColorHarmonySelector) ──

// Faithful copy of the Figma ColorHarmonySelector set. `value` maps to the
// existing colormath harmonyColors() types; `diagram` holds the dot angles.
const HARMONY_DEFS = [
  { value: 'complementary', label: 'Complementary', short: '2 colors', angles: '180°',        diagram: [0, 180] },
  { value: 'split',         label: 'Split-Comp',    short: '3 colors', angles: '150° / 210°', diagram: [0, 150, 210] },
  { value: 'analogous',     label: 'Analogous',     short: '3 colors', angles: '±30°',        diagram: [-30, 0, 30] },
  { value: 'triadic',       label: 'Triadic',       short: '3 colors', angles: '120°',        diagram: [0, 120, 240] },
  { value: 'rectangle',     label: 'Tetradic',      short: '4 colors', angles: '60° rect',    diagram: [0, 60, 180, 240] },
  { value: 'tetradic',      label: 'Square',        short: '4 colors', angles: '90°',         diagram: [0, 90, 180, 270] },
];

let currentHarmony = 'complementary';

// Mini wheel diagram — mirrors the Figma HarmonyDiagram component.
function harmonyDiagramSVG(angles, baseHue, accent, size = 32) {
  const c = size / 2, R = size * 0.38;
  const dotR = Math.max(3, size * 0.07);
  const ringW = size > 60 ? 1.5 : 1;
  const lineW = size > 60 ? 1 : 0.5;

  const p = a => {
    const rad = ((a - 90) * Math.PI) / 180;
    return { x: c + Math.cos(rad) * R, y: c + Math.sin(rad) * R };
  };

  const lines = angles.slice(1).map(a => {
    const a0 = p(angles[0]), ai = p(a);
    return `<line x1="${a0.x.toFixed(2)}" y1="${a0.y.toFixed(2)}" x2="${ai.x.toFixed(2)}" y2="${ai.y.toFixed(2)}" stroke="rgba(255,255,255,0.07)" stroke-width="${lineW}"/>`;
  }).join('');

  const dots = angles.map((a, i) => {
    const pt = p(a);
    const hue = ((baseHue + a) % 360 + 360) % 360;
    const fill = i === 0 && accent ? accent : `hsl(${hue}, 65%, 55%)`;
    return `<circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="${dotR}" fill="${fill}" stroke="rgba(0,0,0,0.4)" stroke-width="${i === 0 ? 1.5 : 1}"/>`;
  }).join('');

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${ringW}"/>
    ${lines}${dots}
  </svg>`;
}

function renderHarmonyGrid(baseHue) {
  const list = document.getElementById('harmonyGrid');
  if (!list) return;
  const accent = swatchHex(currentH, currentS, currentL);
  list.innerHTML = HARMONY_DEFS.map(def => {
    const active = def.value === currentHarmony;
    return `<button class="hsel-btn${active ? ' active' : ''}" data-harmony="${def.value}"${active ? ` style="border-left-color:${accent}"` : ''}>
      <span class="hsel-diagram">${harmonyDiagramSVG(def.diagram, baseHue, accent, 32)}</span>
      <span class="hsel-info">
        <span class="hsel-label">${def.label}</span>
        <span class="hsel-angles">${def.angles}</span>
      </span>
      <span class="hsel-count">${def.short}</span>
    </button>`;
  }).join('');

  list.querySelectorAll('.hsel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentHarmony = btn.dataset.harmony;
      refresh();
    });
  });
}

const HARMONY_LABELS = {
  'complementary':  'Complementary — 180°',
  'split':          'Split-Complementary — 150° / 210°',
  'analogous':      'Analogous — ±30°',
  'triadic':        'Triadic — 120°',
  'rectangle':      'Tetradic — 60° rect',
  'tetradic':       'Square — 90°',
};

function updateHarmonyPanel(h, s, l) {
  const colors = harmonyColors(h, s, l, currentHarmony);

  const swatches = colors.map(c => {
    const hex = swatchHex(c.h, c.s, c.l);
    return `<div class="h-swatch-wrap" style="background:${hex}" data-hex="${hex}" title="Click to copy ${hex}">
      <span class="h-hex">${hex}</span>
    </div>`;
  }).join('');

  document.getElementById('harmonyPanel').innerHTML = `
    <div class="harmony-title">${HARMONY_LABELS[currentHarmony]}</div>
    <div class="harmony-swatches">${swatches}</div>`;

  // Studio heading readouts (no-op on pages that lack these elements)
  const nameEl = document.getElementById('harmonyName');
  if (nameEl) nameEl.textContent = HARMONY_LABELS[currentHarmony];
  const countEl = document.getElementById('harmonyCount');
  if (countEl) countEl.textContent = `${colors.length} colors`;

  return colors;
}

// ── Tints / Shades / Tones (from Figma App.tsx getTintsAndShades) ─────────
// One line per harmony color: a pure anchor swatch (0%) + three mixes, so the
// whole selected harmony is covered. Each variation is the base color mixed
// toward white (tint), black (shade) or gray (tone) by a labelled percentage.

const TST_MIX = [25, 50, 75];   // how much white / black / gray is added

function mixRgb(base, target, p) {
  return [
    Math.round(base[0] + (target[0] - base[0]) * p),
    Math.round(base[1] + (target[1] - base[1]) * p),
    Math.round(base[2] + (target[2] - base[2]) * p),
  ];
}

function tstChip(hex, pct, isBase) {
  const pctLabel = pct > 0 ? `<span class="tst-chip-pct">${pct}%</span>` : '';
  return `<div class="tst-chip${isBase ? ' tst-chip-base' : ''}" style="background:${hex}"
            data-hex="${hex}" title="Click to copy ${hex}">
      ${pctLabel}
      <span class="tst-chip-hex">${hex}</span>
    </div>`;
}

function renderTSTColumn(container, colors, anchorL, target) {
  container.innerHTML = colors.map(c => {
    const base = hslToRgb(c.h, c.s, anchorL);
    const anchorHex = rgbToHex(base[0], base[1], base[2]);
    const chips = TST_MIX.map(p => {
      const [r, g, b] = mixRgb(base, target, p / 100);
      return tstChip(rgbToHex(r, g, b), p, false);
    }).join('');
    return `<div class="tst-color-line">
      ${tstChip(anchorHex, 0, true)}
      <div class="tst-chips">${chips}</div>
    </div>`;
  }).join('');
}

function updateTST(h, s, l) {
  const colors = harmonyColors(h, s, l, currentHarmony);
  renderTSTColumn(document.getElementById('tintSwatches'),  colors, l, [255, 255, 255]); // + white
  renderTSTColumn(document.getElementById('shadeSwatches'), colors, l, [0, 0, 0]);       // + black
  renderTSTColumn(document.getElementById('toneSwatches'),  colors, l, [128, 128, 128]); // + gray
}

// ── Interaction ───────────────────────────────────────────────────────────

let currentH = 0, currentS = 100, currentL = 50;

let _rafPending = false;
function refresh() {
  const [r, g, b] = hslToRgb(currentH, currentS, currentL);
  updateValues(r, g, b); // text updates immediately — cheap
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      const harmonyList = harmonyColors(currentH, currentS, currentL, currentHarmony);
      drawWheel(harmonyList);
      renderHarmonyGrid(currentH);
      updateHarmonyPanel(currentH, currentS, currentL);
      updateTST(currentH, currentS, currentL);
      updateCPBar();
    });
  }
}

function pickFromWheel(event) {
  const rect = wheelCanvas.getBoundingClientRect();
  const scaleX = SIZE / rect.width;
  const scaleY = SIZE / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const dx = x - CX, dy = y - CY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > WHEEL_R) {
    return;
  }

  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  currentH = angle;
  currentS = ((dist - HUB_R) / (WHEEL_R - HUB_R)) * 100;

  const cssScale = rect.width / SIZE;
  const cursor = document.getElementById('cursor');
  cursor.style.display = 'block';
  cursor.style.left = (x * cssScale) + 'px';
  cursor.style.top  = (y * cssScale) + 'px';

  refresh();
}

let isDragging = false;
const wheelWrapper = wheelCanvas.parentElement;

wheelCanvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  wheelWrapper.classList.add('dragging');
  pickFromWheel(e);
});

wheelCanvas.addEventListener('mousemove', (e) => {
  if (isDragging) pickFromWheel(e);
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  wheelWrapper.classList.remove('dragging');
  slDragging = false;
  hueDragging = false;
});

// Touch support for color wheel
function touchPoint(e) { return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }; }

wheelCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isDragging = true;
  wheelWrapper.classList.add('dragging');
  pickFromWheel(touchPoint(e));
}, { passive: false });

wheelCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (isDragging) pickFromWheel(touchPoint(e));
}, { passive: false });

window.addEventListener('touchend', () => {
  isDragging = false;
  wheelWrapper.classList.remove('dragging');
  slDragging = false;
  hueDragging = false;
});

// Lightness slider
document.getElementById('lightnessSlider').addEventListener('input', function () {
  currentL = Number(this.value);
  document.getElementById('lightnessInput').value = currentL;
  refresh();
});

// Lightness number input
document.getElementById('lightnessInput').addEventListener('input', function () {
  const val = Math.min(100, Math.max(0, Number(this.value) || 0));
  currentL = val;
  document.getElementById('lightnessSlider').value = val;
  refresh();
});

// ── Color Picker Bar (from Figma ColorPickerBar + ColorPaletteDisplay) ────

let slDragging = false, hueDragging = false, pickerOpen = false;

const slCanvas    = document.getElementById('slCanvas');
const slCtx       = slCanvas.getContext('2d');
const hueTrack    = document.getElementById('hueTrack');
const hueThumb    = document.getElementById('hueThumb');
const pickerPopup = document.getElementById('pickerPopup');

function drawSLCanvas() {
  const W = slCanvas.width, H = slCanvas.height;
  const img = slCtx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (x / W) * 100;
      const l = 100 - (y / H) * 100;
      const [r, g, b] = hslToRgb(currentH, s, l);
      const i = (y * W + x) * 4;
      d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
    }
  }
  slCtx.putImageData(img, 0, 0);

  // Crosshair at current position
  const cx = (currentS / 100) * W;
  const cy = (1 - currentL / 100) * H;
  slCtx.beginPath();
  slCtx.arc(cx, cy, 7, 0, Math.PI * 2);
  slCtx.strokeStyle = '#fff';
  slCtx.lineWidth = 2.5;
  slCtx.stroke();
  slCtx.beginPath();
  slCtx.arc(cx, cy, 7, 0, Math.PI * 2);
  slCtx.strokeStyle = 'rgba(0,0,0,0.35)';
  slCtx.lineWidth = 1;
  slCtx.stroke();
}

function updateHueThumb() {
  hueThumb.style.left = (currentH / 360 * 100) + '%';
}

function pickSL(e) {
  const rect = slCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
  currentS = (x / rect.width) * 100;
  currentL = 100 - (y / rect.height) * 100;
  document.getElementById('lightnessSlider').value = Math.round(currentL);
  document.getElementById('lightnessInput').value = Math.round(currentL);
  refresh();
}

function pickHue(e) {
  const rect = hueTrack.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  currentH = (x / rect.width) * 360;
  refresh();
}

function generatePalette(type) {
  const h = currentH, s = currentS, l = currentL;
  switch (type) {
    case 'tailwind': {
      const offset = l - 55;
      const lv = (base) => Math.min(100, Math.max(0, Math.round(base + offset)));
      return [
        {h, s:s*0.3, l:lv(97), lbl:'50'},  {h, s:s*0.5, l:lv(94), lbl:'100'},
        {h, s:s*0.7, l:lv(86), lbl:'200'}, {h, s:s*0.8, l:lv(77), lbl:'300'},
        {h, s:s*0.9, l:lv(66), lbl:'400'}, {h, s,        l:lv(55), lbl:'500'},
        {h, s,        l:lv(45), lbl:'600'}, {h, s,        l:lv(36), lbl:'700'},
        {h, s,        l:lv(27), lbl:'800'}, {h, s,        l:lv(18), lbl:'900'},
        {h, s,        l:lv(10), lbl:'950'},
      ];
    }
    case 'shades': {
      return Array.from({length:11}, (_,i) => {
        const lval = Math.round(l * (1 - i / 10));
        return {h, s, l:lval, lbl:`${lval}%`};
      });
    }
    case 'tints':
      return Array.from({length:11}, (_,i) => ({h, s:s*(1-i*0.09), l:l+((100-l)*i*0.09), lbl:`T${i}`}));
    case 'tones':
      return Array.from({length:11}, (_,i) => ({h, s:s*(1-i*0.1), l, lbl:`G${i}`}));
    case 'analogous':
      return Array.from({length:11}, (_,i) => ({h:((h+(i-5)*6)%360+360)%360, s, l, lbl:`${(i-5)*6}°`}));
    case 'complementary':
      return [{h,s,l,lbl:'Base'},{h:(h+180)%360,s,l,lbl:'Comp'}];
    case 'split-complementary':
      return [{h,s,l,lbl:'Base'},{h:(h+150)%360,s,l,lbl:'S1'},{h:(h+210)%360,s,l,lbl:'S2'}];
    case 'triadic':
      return [{h,s,l,lbl:'T1'},{h:(h+120)%360,s,l,lbl:'T2'},{h:(h+240)%360,s,l,lbl:'T3'}];
    case 'tetradic':
      return [{h,s,l,lbl:'Te1'},{h:(h+60)%360,s,l,lbl:'Te2'},{h:(h+180)%360,s,l,lbl:'Te3'},{h:(h+240)%360,s,l,lbl:'Te4'}];
    case 'square':
      return [{h,s,l,lbl:'Sq1'},{h:(h+90)%360,s,l,lbl:'Sq2'},{h:(h+180)%360,s,l,lbl:'Sq3'},{h:(h+270)%360,s,l,lbl:'Sq4'}];
    default: return [];
  }
}

function renderPaletteStrip() {
  const type = document.getElementById('paletteSelect').value;
  const palette = generatePalette(type);
  document.getElementById('paletteStrip').innerHTML = palette.map(c => {
    const hex = swatchHex(c.h, c.s, c.l);
    const isMatch = Math.abs(c.h - currentH) < 5 &&
                    Math.abs(c.s - currentS) < 5 &&
                    Math.abs(c.l - currentL) < 5;
    return `<div class="ps-cell" style="background:${hex}" data-hex="${hex}" title="Click to copy">
      ${isMatch ? '<div class="ps-dot"></div>' : ''}
      <span class="ps-label">${hex}</span>
    </div>`;
  }).join('');
}

function updateCPBar() {
  if (pickerOpen) { drawSLCanvas(); updateHueThumb(); }
  renderPaletteStrip();
}

// Picker button toggle
document.getElementById('mainSwatch').addEventListener('click', (e) => {
  e.stopPropagation();
  pickerOpen = !pickerOpen;
  pickerPopup.style.display = pickerOpen ? 'block' : 'none';
  if (pickerOpen) { drawSLCanvas(); updateHueThumb(); }
});

document.getElementById('pickerClose').addEventListener('click', () => {
  pickerOpen = false;
  pickerPopup.style.display = 'none';
});

// Close popup on outside click / tap
function closePickerIfOutside(e) {
  if (pickerOpen && !document.getElementById('mainSwatchWrap').contains(e.target)) {
    pickerOpen = false;
    pickerPopup.style.display = 'none';
  }
}
document.addEventListener('mousedown', closePickerIfOutside);
document.addEventListener('touchstart', closePickerIfOutside, { passive: true });

// SL canvas drag
slCanvas.addEventListener('mousedown', (e) => { slDragging = true; pickSL(e); });
slCanvas.addEventListener('mousemove', (e) => { if (slDragging) pickSL(e); });

// SL canvas touch
slCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); slDragging = true; pickSL(e.touches[0]); }, { passive: false });
slCanvas.addEventListener('touchmove',  (e) => { e.preventDefault(); if (slDragging) pickSL(e.touches[0]); },  { passive: false });

// Hue track drag
hueTrack.addEventListener('mousedown', (e) => { hueDragging = true; pickHue(e); });
hueTrack.addEventListener('mousemove', (e) => { if (hueDragging) pickHue(e); });

// Hue track touch
hueTrack.addEventListener('touchstart', (e) => { e.preventDefault(); hueDragging = true; pickHue(e.touches[0]); }, { passive: false });
hueTrack.addEventListener('touchmove',  (e) => { e.preventDefault(); if (hueDragging) pickHue(e.touches[0]); },  { passive: false });

// Palette dropdown
document.getElementById('paletteSelect').addEventListener('change', renderPaletteStrip);

// ── Copy-to-clipboard system ──────────────────────────────────────────────

function copyWithFeedback(el, text) {
  if (!text) return;
  const write = () => {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1000);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(write).catch(write);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    write();
  }
}

// Main swatch value blocks
document.querySelectorAll('.value-block').forEach(block => {
  block.addEventListener('click', () => {
    copyWithFeedback(block, block.querySelector('.val').textContent.trim());
  });
});

// Cpbar value chips
document.querySelectorAll('.cpbar-val').forEach(chip => {
  chip.addEventListener('click', () => {
    copyWithFeedback(chip, chip.querySelector('.cpbar-num').textContent.trim());
  });
});

// Harmony swatch cards (delegated — re-rendered each refresh)
document.getElementById('harmonyPanel').addEventListener('click', e => {
  const wrap = e.target.closest('.h-swatch-wrap');
  if (wrap) copyWithFeedback(wrap, wrap.dataset.hex);
});

// Palette strip cells
document.getElementById('paletteStrip').addEventListener('click', e => {
  const cell = e.target.closest('.ps-cell');
  if (cell) copyWithFeedback(cell, cell.dataset.hex);
});

// Tints / Shades / Tones chips (delegated — re-rendered each refresh)
['tintSwatches', 'shadeSwatches', 'toneSwatches'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    const chip = e.target.closest('.tst-chip');
    if (chip) copyWithFeedback(chip, chip.dataset.hex);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────

refresh();
