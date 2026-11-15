// Curve di livello procedurali (rumore di valore + marching squares).
// Usate come sfondo ([data-topo]) e come terreno della mappa di missione.

function hash(x, y, seme) {
  let h = (x * 374761393 + y * 668265263 + seme * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const liscia = (t) => t * t * (3 - 2 * t);

function rumore(x, y, seme) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = liscia(x - xi), yf = liscia(y - yi);
  const a = hash(xi, yi, seme), b = hash(xi + 1, yi, seme);
  const c = hash(xi, yi + 1, seme), d = hash(xi + 1, yi + 1, seme);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function quota(x, y, seme = 7) {
  let v = 0, amp = 1, f = 1, tot = 0;
  for (let o = 0; o < 4; o++) {
    v += rumore(x * f, y * f, seme + o) * amp;
    tot += amp; amp *= 0.5; f *= 2.03;
  }
  return v / tot;
}

/**
 * Disegna le curve di livello su un contesto 2D.
 * opts: scala (frequenza), passo (px della griglia), livelli, colore, colore2 (ogni 5),
 *       dx/dy (spostamento del campo, per animarlo), seme
 */
export function disegnaCurve(ctx, w, h, opts = {}) {
  const {
    scala = 0.0032, passo = 12, livelli = 14, colore = 'rgba(255,255,255,.07)',
    colore2 = 'rgba(255,255,255,.14)', dx = 0, dy = 0, seme = 7, spessore = 1,
  } = opts;
  const nx = Math.ceil(w / passo) + 1, ny = Math.ceil(h / passo) + 1;
  const campo = new Float32Array(nx * ny);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = quota(i * passo * scala + dx, j * passo * scala + dy, seme);
    campo[j * nx + i] = v;
    if (v < min) min = v; if (v > max) max = v;
  }
  ctx.lineWidth = spessore;
  for (let l = 1; l < livelli; l++) {
    const soglia = min + (max - min) * (l / livelli);
    ctx.strokeStyle = l % 5 === 0 ? colore2 : colore;
    ctx.beginPath();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = campo[j * nx + i], b = campo[j * nx + i + 1];
      const c = campo[(j + 1) * nx + i + 1], d = campo[(j + 1) * nx + i];
      const k = (a > soglia) | ((b > soglia) << 1) | ((c > soglia) << 2) | ((d > soglia) << 3);
      if (k === 0 || k === 15) continue;
      const x = i * passo, y = j * passo;
      const t = (p, q) => (soglia - p) / (q - p);
      const top = [x + passo * t(a, b), y], right = [x + passo, y + passo * t(b, c)];
      const bottom = [x + passo * t(d, c), y + passo], left = [x, y + passo * t(a, d)];
      const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
      switch (k) {
        case 1: case 14: seg(left, top); break;
        case 2: case 13: seg(top, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(right, bottom); break;
        case 5: seg(left, top); seg(right, bottom); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, bottom); break;
        case 10: seg(top, right); seg(left, bottom); break;
      }
    }
    ctx.stroke();
  }
}
