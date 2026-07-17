// ── Color math utilities ──────────────────────────────────────────────────

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// sRGB linearisation
function toLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// sRGB → OKLab → OKLCH
function rgbToOklch(r, g, b) {
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);

  // sRGB → LMS (OKLab matrix 1)
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

  // LMS → OKLab
  const L  = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a  = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(a * a + bk * bk);
  let H = Math.atan2(bk, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  return [
    parseFloat(L.toFixed(3)),
    parseFloat(C.toFixed(3)),
    parseFloat(H.toFixed(2))
  ];
}

// ── Harmony calculators ───────────────────────────────────────────────────

function harmonyColors(h, s, l, type) {
  const base = { h, s, l };

  const mk = (dh, ds = 0, dl = 0) => {
    const nh = ((h + dh) % 360 + 360) % 360;
    const ns = Math.min(100, Math.max(0, s + ds));
    const nl = Math.min(100, Math.max(0, l + dl));
    return { h: nh, s: ns, l: nl };
  };

  switch (type) {
    case 'analogous':
      return [base, mk(-30), mk(30)];
    case 'complementary':
      return [base, mk(180)];
    case 'split':
      return [base, mk(150), mk(210)];
    case 'double-split':
      return [base, mk(-30), mk(30), mk(150), mk(210)];
    case 'triadic':
      return [base, mk(120), mk(240)];
    case 'tetradic':
      return [base, mk(90), mk(180), mk(270)];
    case 'rectangle':
      return [base, mk(60), mk(180), mk(240)];
    default:
      return [base];
  }
}

function swatchHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}
