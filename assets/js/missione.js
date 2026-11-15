// Mappa di missione animata: i quattro obiettivi del programma ARES.
//
// Ogni scenario è una voce di SCENARI con:
//   legenda   [[colore, testo], ...]
//   inizia()  prepara lo stato (chiamata a ogni cambio di scenario e a ogni giro)
//   disegna(c, t, dt)  disegna un fotogramma; c = { ctx, w, h, P(u,v), ... }
//                      restituisce il testo della lettura in basso
// Per aggiungere uno scenario: una voce qui, un bottone [data-scenario] e un
// pannello [data-pannello] con lo stesso nome nella pagina.
import { disegnaCurve } from './topo.js';

const ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
// l'accento (ARES, pulsanti) segue il colore dell'unità definito nel CSS
const ACC_RGB = getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim() || '255, 90, 31';
const ACCENTO = `rgb(${ACC_RGB})`;
const C = {
  arancio: ACCENTO, ambra: '#ffb15c', ciano: '#5cd3ff', viola: '#9b8cff',
  verde: '#4ade80', terra: '#b9a7ff', rosso: '#ff4d5e', giallo: '#ffd166', bianco: '#eef1f5', grigio: 'rgba(238,241,245,.45)',
};
const LARGHEZZA_M = 4000;   // la mappa rappresenta ~4 km

// ------------------------------------------------------------ testi (it / en / de)
const LINGUA = (document.documentElement.lang || 'it').slice(0, 2);
const TESTI = {
  it: { vera: 'posizione vera', stima: 'stima di bordo', ricon: 'riconoscimento del terreno', gnssNo: 'GNSS assente',
    gnssNoLbl: 'GNSS ASSENTE →', gnssSi: 'GNSS: presente · tra poco il segnale si perde',
    gnssErr: (e, n) => `GNSS: assente · errore di stima ${e} m · riconoscimenti ${n}`,
    robot: 'robot di terra', poi: "punto d'interesse", link: 'collegamento', base: 'BASE',
    squadra: (p, a, b, r) => `mappa esplorata ${p}% · punti d'interesse ${a}/${b} · robot in marcia ${r}`,
    ascolto: 'ARES in ascolto', sensore: 'sensore a terra', ignoto: 'drone sconosciuto', direz: 'direzione del segnale',
    sensLbl: 'SENSORE', rid: (b, l, m) => `${b} · Remote ID ${l ? 'letto' : 'assente'} · ${m} m`,
    contatto: (b, tri, m) => `contatto · ${b} · ${tri ? 'posizione triangolata' : 'solo direzione'} · distanza ${m} m`,
    nessuno: 'in ascolto su 2,4 e 5,8 GHz · nessun contatto', spettro: 'SPETTRO · 2,4 | 5,8 GHz',
    ril: 'rilevamento', ident: 'identificazione', allerta: 'allerta', pattuglia: 'pattuglia ARES', fissi: 'sensori fissi',
    sito: 'SITO', livelli: ['', 'RILEVATO', 'IDENTIFICATO', 'ALLERTA'], registro: 'registro', calma: 'zona sorvegliata · nessuna traccia' },
  en: { vera: 'true position', stima: 'onboard estimate', ricon: 'terrain match', gnssNo: 'no GNSS',
    gnssNoLbl: 'NO GNSS →', gnssSi: 'GNSS: available · the signal is about to drop',
    gnssErr: (e, n) => `GNSS: none · estimation error ${e} m · terrain matches ${n}`,
    robot: 'ground robot', poi: 'point of interest', link: 'data link', base: 'BASE',
    squadra: (p, a, b, r) => `area mapped ${p}% · points of interest ${a}/${b} · robots moving ${r}`,
    ascolto: 'ARES listening', sensore: 'ground sensor', ignoto: 'unknown drone', direz: 'signal bearing',
    sensLbl: 'SENSOR', rid: (b, l, m) => `${b} · Remote ID ${l ? 'read' : 'missing'} · ${m} m`,
    contatto: (b, tri, m) => `contact · ${b} · ${tri ? 'position triangulated' : 'bearing only'} · range ${m} m`,
    nessuno: 'listening on 2.4 and 5.8 GHz · no contact', spettro: 'SPECTRUM · 2.4 | 5.8 GHz',
    ril: 'detection', ident: 'identification', allerta: 'alert', pattuglia: 'ARES patrol', fissi: 'fixed sensors',
    sito: 'SITE', livelli: ['', 'DETECTED', 'IDENTIFIED', 'ALERT'], registro: 'log', calma: 'zone under watch · no tracks' },
  de: { vera: 'wahre Position', stima: 'Bordschätzung', ricon: 'Geländeabgleich', gnssNo: 'kein GNSS',
    gnssNoLbl: 'KEIN GNSS →', gnssSi: 'GNSS: verfügbar · gleich fällt das Signal aus',
    gnssErr: (e, n) => `GNSS: keines · Schätzfehler ${e} m · Geländeabgleiche ${n}`,
    robot: 'Bodenroboter', poi: 'Zielpunkt', link: 'Datenverbindung', base: 'BASIS',
    squadra: (p, a, b, r) => `Gebiet kartiert ${p} % · Zielpunkte ${a}/${b} · Roboter unterwegs ${r}`,
    ascolto: 'ARES hört mit', sensore: 'Bodensensor', ignoto: 'unbekannte Drohne', direz: 'Signalpeilung',
    sensLbl: 'SENSOR', rid: (b, l, m) => `${b} · Remote ID ${l ? 'gelesen' : 'fehlt'} · ${m} m`,
    contatto: (b, tri, m) => `Kontakt · ${b} · ${tri ? 'Position trianguliert' : 'nur Peilung'} · Entfernung ${m} m`,
    nessuno: 'hört auf 2,4 und 5,8 GHz · kein Kontakt', spettro: 'SPEKTRUM · 2,4 | 5,8 GHz',
    ril: 'Erkennung', ident: 'Identifizierung', allerta: 'Alarm', pattuglia: 'ARES-Patrouille', fissi: 'feste Sensoren',
    sito: 'OBJEKT', livelli: ['', 'ERKANNT', 'IDENTIFIZIERT', 'ALARM'], registro: 'Protokoll', calma: 'Zone überwacht · keine Spur' },
};
const L = TESTI[LINGUA] || TESTI.it;

// ------------------------------------------------------------ disegno di base
function drone(ctx, x, y, dir, colore, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir); ctx.scale(s, s);
  ctx.shadowColor = colore; ctx.shadowBlur = 14;
  ctx.fillStyle = colore;
  ctx.beginPath();   // ala fusa vista dall'alto, muso verso +x
  ctx.moveTo(11, 0); ctx.lineTo(-3, -13); ctx.lineTo(-7, -12); ctx.lineTo(-3, -3);
  ctx.lineTo(-10, -2); ctx.lineTo(-10, 2); ctx.lineTo(-3, 3); ctx.lineTo(-7, 12); ctx.lineTo(-3, 13);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function robot(ctx, x, y, dir, colore) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (const [a, b] of [[-6, -7], [3, -7], [-6, 5], [3, 5]]) ctx.fillRect(a, b, 4, 2.4);
  ctx.shadowColor = colore; ctx.shadowBlur = 10; ctx.fillStyle = colore;
  ctx.beginPath(); ctx.roundRect(-8, -5, 16, 10, 3); ctx.fill();
  ctx.fillStyle = 'rgba(7,9,12,.6)'; ctx.fillRect(2, -3, 4, 6);
  ctx.restore();
}
function intruso(ctx, x, y, colore, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.6);
  ctx.strokeStyle = colore; ctx.fillStyle = colore; ctx.lineWidth = 2;
  ctx.shadowColor = colore; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
  for (const [a, b] of [[-7, -7], [7, 7], [7, -7], [-7, 7]]) { ctx.beginPath(); ctx.arc(a, b, 3.6, 0, 7); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill();
  ctx.restore();
}
function etichetta(ctx, x, y, testo, colore, dx = 14, dy = -14) {
  ctx.save();
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
  const w = ctx.measureText(testo).width + 14;
  let ex = x + dx, ey = y + dy - 10;
  ex = Math.min(Math.max(ex, 6), ctx.canvas.clientWidth - w - 6);
  ctx.fillStyle = 'rgba(7,9,12,.82)'; ctx.strokeStyle = colore; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(ex, ey, w, 20, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = colore; ctx.fillText(testo, ex + 7, ey + 14);
  ctx.restore();
}
function anello(ctx, x, y, r, colore, alpha = 1, tratteggio) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = colore; ctx.lineWidth = 1.2;
  if (tratteggio) ctx.setLineDash(tratteggio);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
// punto lungo una spezzata (coordinate normalizzate), s in [0,1]
function lungo(punti, s) {
  const L = []; let tot = 0;
  for (let i = 1; i < punti.length; i++) {
    const d = Math.hypot(punti[i][0] - punti[i - 1][0], punti[i][1] - punti[i - 1][1]);
    L.push(d); tot += d;
  }
  let r = s * tot;
  for (let i = 0; i < L.length; i++) {
    if (r <= L[i] || i === L.length - 1) {
      const t = Math.min(1, r / L[i]), a = punti[i], b = punti[i + 1];
      return { u: a[0] + (b[0] - a[0]) * t, v: a[1] + (b[1] - a[1]) * t, dir: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    r -= L[i];
  }
}

// ------------------------------------------------------------ scenari
const SCENARI = {
  /* ---------- 01: navigazione senza GNSS ---------- */
  gnss: {
    get legenda() { return [[C.bianco, L.vera], [C.arancio, L.stima], [C.ciano, L.ricon], [C.rosso, L.gnssNo]]; },
    rotta: [[0.06, 0.8], [0.28, 0.58], [0.47, 0.66], [0.66, 0.36], [0.8, 0.42], [0.94, 0.16]],
    inizia() { this.s = 0; this.deriva = [0, 0]; this.vel = [0, 0]; this.scia = []; this.vera = []; this.fix = []; this.ultimo = 0; this.err = 0; },
    disegna(c, t, dt) {
      const { ctx, w, h, P } = c;
      this.s += dt / 16;
      if (this.s >= 1) this.inizia();
      // zona senza GNSS
      const x0 = P(0.27, 0)[0];
      ctx.save(); ctx.fillStyle = 'rgba(255,77,94,.06)'; ctx.fillRect(x0, 0, w - x0, h);
      ctx.strokeStyle = 'rgba(255,77,94,.5)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke(); ctx.restore();
      etichetta(ctx, x0, 30, L.gnssNoLbl, C.rosso, 8, 0);
      // rotta pianificata
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([2, 6]); ctx.lineWidth = 1.5; ctx.beginPath();
      this.rotta.forEach(([u, v], i) => { const [x, y] = P(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      for (const [u, v] of this.rotta) { const [x, y] = P(u, v); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
      const q = lungo(this.rotta, this.s);
      const senza = q.u > 0.27;
      // la stima deriva senza GNSS, e un riconoscimento la riporta a posto
      if (senza) {
        this.vel[0] += (Math.random() - 0.48) * dt * 0.02; this.vel[1] += (Math.random() - 0.45) * dt * 0.02;
        this.deriva[0] += this.vel[0] * dt; this.deriva[1] += this.vel[1] * dt;
        if (t - this.ultimo > 1.7) {
          this.ultimo = t;
          this.fix.push({ u: q.u, v: q.v, dir: q.dir, t, da: [q.u + this.deriva[0], q.v + this.deriva[1]] });
          this.deriva = [this.deriva[0] * 0.12, this.deriva[1] * 0.12]; this.vel = [0, 0];
        }
      }
      const est = { u: q.u + this.deriva[0], v: q.v + this.deriva[1] };
      this.vera.push([q.u, q.v]); this.scia.push([est.u, est.v]);
      // impronte della camera riconosciute
      for (const f of this.fix) {
        const eta = t - f.t, a = Math.max(0, 1 - eta / 2.5);
        if (a <= 0) continue;
        const [x, y] = P(f.u, f.v), [ex, ey] = P(...f.da), s = 26 + eta * 6;
        ctx.save(); ctx.translate(x, y); ctx.rotate(f.dir); ctx.globalAlpha = a;
        ctx.strokeStyle = C.ciano; ctx.fillStyle = 'rgba(92,211,255,.12)'; ctx.lineWidth = 1.5;
        ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore();
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.ciano; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
      }
      // scie
      const scia = (pts, colore, tratt) => {
        ctx.save(); ctx.strokeStyle = colore; ctx.lineWidth = 2; if (tratt) ctx.setLineDash(tratt);
        ctx.beginPath(); pts.forEach(([u, v], i) => { const [x, y] = P(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
      };
      scia(this.vera, 'rgba(238,241,245,.55)');
      scia(this.scia, C.arancio, [5, 4]);
      // incertezza
      const [ex, ey] = P(est.u, est.v);
      const errU = Math.hypot(...this.deriva);
      this.err = errU * LARGHEZZA_M;
      const r = 10 + (senza ? Math.min(40, (t - this.ultimo) * 16) : 0);
      ctx.save(); ctx.fillStyle = 'rgba(255,177,92,.08)'; ctx.strokeStyle = 'rgba(255,177,92,.5)';
      ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      const [x, y] = P(q.u, q.v);
      drone(ctx, x, y, q.dir, C.bianco, 1);
      ctx.fillStyle = C.arancio; ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 7); ctx.fill();
      return senza
        ? L.gnssErr(Math.round(this.err), this.fix.length)
        : L.gnssSi;
    },
  },

  /* ---------- 02: squadra aria-terra ---------- */
  squadra: {
    get legenda() { return [[C.arancio, 'ARES'], [C.terra, L.robot], [C.ambra, L.poi], [C.ciano, L.link]]; },
    inizia() {
      this.t0 = null; this.nebbia = null; this.trovati = new Set();
      this.base = [0.08, 0.9];
      this.poi = [[0.34, 0.3], [0.6, 0.6], [0.82, 0.24]];
      this.robot = this.poi.map((_, i) => ({ u: 0.07 + i * 0.03, v: 0.9 - i * 0.02, dir: -0.5, bersaglio: null }));
      this.coperti = new Uint8Array(40 * 25);
      const righe = 5, pts = [];
      for (let i = 0; i < righe; i++) {
        const v = 0.14 + (0.72 * i) / (righe - 1);
        pts.push(i % 2 ? [0.9, v] : [0.1, v], i % 2 ? [0.1, v] : [0.9, v]);
      }
      this.rotta = [this.base, ...pts, this.base];
    },
    disegna(c, t, dt) {
      const { ctx, w, h, P } = c;
      if (this.t0 === null) this.t0 = t;
      const s = (t - this.t0) / 26;
      if (s >= 1) { this.inizia(); return ''; }
      if (!this.nebbia || this.nebbia.width !== c.cv.width) {
        this.nebbia = document.createElement('canvas'); this.nebbia.width = c.cv.width; this.nebbia.height = c.cv.height;
        const n = this.nebbia.getContext('2d'); n.fillStyle = 'rgba(7,9,12,.82)'; n.fillRect(0, 0, this.nebbia.width, this.nebbia.height);
      }
      const q = lungo(this.rotta, s);
      const [x, y] = P(q.u, q.v);
      // la camera del drone scopre la mappa
      const n = this.nebbia.getContext('2d'), k = c.cv.width / w;
      n.globalCompositeOperation = 'destination-out';
      const g = n.createRadialGradient(x * k, y * k, 0, x * k, y * k, 46 * k);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g; n.beginPath(); n.arc(x * k, y * k, 46 * k, 0, 7); n.fill();
      const gi = Math.floor(q.u * 40), gj = Math.floor(q.v * 25);
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
        const ii = gi + a, jj = gj + b; if (ii >= 0 && ii < 40 && jj >= 0 && jj < 25) this.coperti[jj * 40 + ii] = 1;
      }
      ctx.drawImage(this.nebbia, 0, 0, w, h);
      // punti d'interesse scoperti → assegnati al robot
      this.poi.forEach(([u, v], i) => {
        const [px, py] = P(u, v);
        if (!this.trovati.has(i) && Math.hypot(px - x, py - y) < 40) { this.trovati.add(i); this.robot[i].bersaglio = [u, v]; }
        if (this.trovati.has(i)) {
          const pulse = (t * 1.5 + i) % 1;
          anello(ctx, px, py, 6 + pulse * 18, C.ambra, 1 - pulse);
          ctx.fillStyle = C.ambra; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
        }
      });
      // robot di terra
      for (const r of this.robot) {
        if (r.bersaglio) {
          const du = r.bersaglio[0] - r.u, dv = r.bersaglio[1] - r.v, d = Math.hypot(du, dv);
          if (d > 0.012) { r.dir = Math.atan2(dv * h, du * w); r.u += (du / d) * dt * 0.045; r.v += (dv / d) * dt * 0.045; }
        }
        const [rx, ry] = P(r.u, r.v);
        // collegamento col drone e pacchetti di dati
        ctx.save(); ctx.strokeStyle = 'rgba(92,211,255,.35)'; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(rx, ry); ctx.stroke(); ctx.restore();
        const f = (t * 0.8 + r.u) % 1;
        ctx.fillStyle = C.ciano; ctx.beginPath(); ctx.arc(x + (rx - x) * f, y + (ry - y) * f, 2.2, 0, 7); ctx.fill();
        if (r.bersaglio) { ctx.save(); ctx.strokeStyle = 'rgba(185,167,255,.45)'; ctx.setLineDash([2, 4]);
          const [bx, by] = P(...r.bersaglio); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore(); }
        robot(ctx, rx, ry, r.dir, C.terra);
      }
      // base
      const [bx, by] = P(...this.base);
      ctx.strokeStyle = 'rgba(238,241,245,.5)'; ctx.strokeRect(bx - 9, by - 9, 18, 18);
      etichetta(ctx, bx, by, L.base, C.grigio, 14, 4);
      anello(ctx, x, y, 46, C.arancio, 0.35, [2, 4]);
      drone(ctx, x, y, q.dir, C.arancio, 1);
      const pct = Math.round((this.coperti.reduce((a, b) => a + b, 0) / this.coperti.length) * 100);
      return L.squadra(pct, this.trovati.size, this.poi.length, this.robot.filter((r) => r.bersaglio).length);
    },
  },

  /* ---------- 03: rilevamento droni ---------- */
  rilevamento: {
    get legenda() { return [[C.arancio, L.ascolto], [C.terra, L.sensore], [C.rosso, L.ignoto], [C.ciano, L.direz]]; },
    inizia() {
      this.t0 = null;
      const lato = Math.random() < 0.5;
      this.da = lato ? [-0.05, 0.15 + Math.random() * 0.3] : [1.05, 0.2 + Math.random() * 0.3];
      this.a = lato ? [1.05, 0.55 + Math.random() * 0.35] : [-0.05, 0.6 + Math.random() * 0.3];
      this.banda = (Math.random() < 0.6 ? '2,4 GHz' : '5,8 GHz').replace(',', LINGUA === 'en' ? '.' : ',');
      this.rid = Math.random() < 0.5;
    },
    disegna(c, t, dt) {
      const { ctx, w, h, P } = c;
      if (this.t0 === null) this.t0 = t;
      const s = (t - this.t0) / 13;
      if (s >= 1) { this.inizia(); return ''; }
      const centro = P(0.5, 0.5);
      const ang = t * 0.5;
      const ax = centro[0] + Math.cos(ang) * 30, ay = centro[1] + Math.sin(ang) * 30;
      const R = Math.min(w, h) * 0.44;
      const sens = P(0.17, 0.78);
      // portata e impulsi di scansione
      ctx.save(); ctx.fillStyle = `rgba(${ACC_RGB},.04)`; ctx.beginPath(); ctx.arc(centro[0], centro[1], R, 0, 7); ctx.fill(); ctx.restore();
      anello(ctx, centro[0], centro[1], R, C.arancio, 0.5, [4, 6]);
      for (let i = 0; i < 3; i++) { const f = ((t * 0.45) + i / 3) % 1; anello(ctx, ax, ay, f * R, C.arancio, (1 - f) * 0.45); }
      // fascio rotante
      const sw = t * 1.8;
      ctx.save(); ctx.translate(ax, ay);
      const cono = ctx.createConicGradient(sw, 0, 0);
      cono.addColorStop(0, `rgba(${ACC_RGB},.28)`); cono.addColorStop(0.08, `rgba(${ACC_RGB},0)`); cono.addColorStop(1, `rgba(${ACC_RGB},0)`);
      ctx.fillStyle = cono; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); ctx.restore();
      // sensore a terra
      anello(ctx, sens[0], sens[1], R * 0.6, C.terra, 0.25, [2, 5]);
      ctx.fillStyle = C.terra; ctx.beginPath(); ctx.moveTo(sens[0], sens[1] - 9); ctx.lineTo(sens[0] - 7, sens[1] + 6); ctx.lineTo(sens[0] + 7, sens[1] + 6); ctx.fill();
      etichetta(ctx, sens[0], sens[1], L.sensLbl, C.terra, 12, 16);
      // intruso
      const iu = this.da[0] + (this.a[0] - this.da[0]) * s, iv = this.da[1] + (this.a[1] - this.da[1]) * s;
      const [ix, iy] = P(iu, iv);
      const dA = Math.hypot(ix - ax, iy - ay), dS = Math.hypot(ix - sens[0], iy - sens[1]);
      const visto = dA < R, vistoS = dS < R * 0.6;
      const raggio = (x0, y0) => {
        const a = Math.atan2(iy - y0, ix - x0) + (Math.random() - 0.5) * 0.06;
        ctx.save(); ctx.strokeStyle = C.ciano; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * R * 1.3, y0 + Math.sin(a) * R * 1.3); ctx.stroke(); ctx.restore();
      };
      if (visto) raggio(ax, ay);
      if (vistoS) raggio(sens[0], sens[1]);
      if (visto && vistoS) { anello(ctx, ix, iy, 16, C.ciano, 0.9); anello(ctx, ix, iy, 26, C.ciano, 0.4, [3, 3]); }
      intruso(ctx, ix, iy, visto ? C.rosso : 'rgba(255,77,94,.35)', t);
      const metri = Math.round((dA / w) * LARGHEZZA_M / 10) * 10;
      if (visto) etichetta(ctx, ix, iy, L.rid(this.banda, this.rid, metri), C.rosso, 16, -16);
      drone(ctx, ax, ay, ang + Math.PI / 2, C.arancio, 1);
      // spettro
      const sx = w - 190, sy = h - 74, sw2 = 170, sh = 50;
      ctx.save(); ctx.fillStyle = 'rgba(7,9,12,.75)'; ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.roundRect(sx - 8, sy - 20, sw2 + 16, sh + 34, 8); ctx.fill(); ctx.stroke();
      ctx.font = '500 9.5px ui-monospace, Menlo, monospace'; ctx.fillStyle = C.grigio; ctx.fillText(L.spettro, sx, sy - 7);
      const picco = this.banda === '2,4 GHz' ? 0.25 : 0.75;
      for (let i = 0; i < 34; i++) {
        const f = i / 33, rum = 0.12 + Math.random() * 0.12;
        const p = visto ? Math.exp(-((f - picco) ** 2) / 0.004) * 0.85 : 0;
        const hh = (rum + p) * sh;
        ctx.fillStyle = p > 0.2 ? C.rosso : 'rgba(255,177,92,.55)';
        ctx.fillRect(sx + i * (sw2 / 34), sy + sh - hh, sw2 / 34 - 1.5, hh);
      }
      ctx.restore();
      return visto
        ? L.contatto(this.banda, visto && vistoS, metri)
        : L.nessuno;
    },
  },

  /* ---------- 04: protezione di una zona ---------- */
  zona: {
    get legenda() { return [[C.giallo, L.ril], [C.ambra, L.ident], [C.rosso, L.allerta], [C.arancio, L.pattuglia], [C.terra, L.fissi]]; },
    inizia() {
      this.t0 = null; this.stato = 0; this.log = [];
      const a = Math.random() * Math.PI * 2;
      this.ingresso = a;
    },
    disegna(c, t, dt) {
      const { ctx, w, h, P } = c;
      if (this.t0 === null) this.t0 = t;
      const s = (t - this.t0) / 15;
      if (s >= 1) { this.inizia(); return ''; }
      const [cx, cy] = P(0.5, 0.52), B = Math.min(w, h);
      const anelli = [B * 0.46, B * 0.31, B * 0.17];
      const colori = [C.giallo, C.ambra, C.rosso];
      // anelli di copertura
      anelli.forEach((r, i) => {
        ctx.save(); ctx.fillStyle = colori[i]; ctx.globalAlpha = 0.035 + i * 0.015;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.restore();
        anello(ctx, cx, cy, r, colori[i], 0.55, [5, 6]);
      });
      // il sito protetto
      ctx.save(); ctx.fillStyle = 'rgba(238,241,245,.08)'; ctx.strokeStyle = 'rgba(238,241,245,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      [[-.08, -.05], [.03, -.08], [.09, -.02], [.07, .06], [-.02, .08], [-.09, .03]].forEach(([u, v], i) => {
        const x = cx + u * B, y = cy + v * B; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      etichetta(ctx, cx, cy, L.sito, C.bianco, -18, 4);
      // sensori fissi
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.6, x = cx + Math.cos(a) * anelli[1] * 1.05, y = cy + Math.sin(a) * anelli[1] * 1.05;
        anello(ctx, x, y, B * 0.12, C.terra, 0.18);
        ctx.fillStyle = C.terra; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
      }
      // pattuglie
      for (let i = 0; i < 2; i++) {
        const a = t * 0.32 + i * Math.PI, r = anelli[0] * 0.82;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        drone(ctx, x, y, a + Math.PI / 2, C.arancio, 0.9);
      }
      // l'intruso entra, viene seguito, poi si allontana
      const fase = s < 0.62 ? s / 0.62 : 1 - (s - 0.62) / 0.38;
      const dist = B * 0.62 - fase * (B * 0.62 - anelli[2] * 0.75);
      const ix = cx + Math.cos(this.ingresso) * dist, iy = cy + Math.sin(this.ingresso) * dist;
      const livello = dist < anelli[2] ? 3 : dist < anelli[1] ? 2 : dist < anelli[0] ? 1 : 0;
      const nomi = L.livelli;
      if (livello > this.stato) {
        this.stato = livello;
        const sec = (t - this.t0).toFixed(1);
        this.log.push(`${sec}s ${nomi[livello].toLowerCase()}`);
      }
      const col = livello ? colori[livello - 1] : 'rgba(255,77,94,.4)';
      if (livello) {
        ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ix, iy); ctx.stroke(); ctx.restore();
        anello(ctx, ix, iy, 14 + Math.sin(t * 6) * 3, col, 0.9);
        etichetta(ctx, ix, iy, nomi[livello], col, 16, -14);
      }
      intruso(ctx, ix, iy, col, t);
      return this.log.length ? `${L.registro} · ${this.log.join(' → ')}` : L.calma;
    },
  },
};

// ------------------------------------------------------------ montaggio
document.querySelectorAll('[data-missione]').forEach((radice) => {
  const cv = radice.querySelector('[data-missione-canvas]');
  const ctx = cv.getContext('2d');
  const legenda = radice.querySelector('[data-missione-legenda]');
  const lettura = radice.querySelector('[data-missione-lettura]');
  const tabs = [...radice.querySelectorAll('[data-scenario]')];
  const pannelli = [...radice.querySelectorAll('[data-pannello]')];
  const terreno = document.createElement('canvas');
  let w = 0, h = 0, dpr = 1, nome = tabs[0].dataset.scenario, visibile = false, tempo = 0, ultimo = performance.now();

  const P = (u, v) => [u * w, v * h];
  const c = { ctx, cv, get w() { return w; }, get h() { return h; }, P };

  function dimensiona() {
    w = cv.clientWidth; h = cv.clientHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    terreno.width = cv.width; terreno.height = cv.height;
    const t = terreno.getContext('2d');
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.fillStyle = '#0a0e14'; t.fillRect(0, 0, w, h);
    disegnaCurve(t, w, h, { scala: 0.0052, passo: 9, livelli: 18, seme: 21,
      colore: 'rgba(255,255,255,.06)', colore2: 'rgba(255,177,92,.16)' });
    t.strokeStyle = 'rgba(255,255,255,.035)'; t.lineWidth = 1;
    for (let i = 1; i < 10; i++) { t.beginPath(); t.moveTo((w * i) / 10, 0); t.lineTo((w * i) / 10, h); t.moveTo(0, (h * i) / 10); t.lineTo(w, (h * i) / 10); t.stroke(); }
    SCENARI[nome].nebbia = null;
  }

  function scegli(n) {
    nome = n;
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.scenario === n)));
    pannelli.forEach((p) => { p.hidden = p.dataset.pannello !== n; });
    const s = SCENARI[n];
    legenda.innerHTML = s.legenda.map(([col, txt]) => `<span><i style="background:${col}"></i>${txt}</span>`).join('');
    s.inizia();
    if (ridotto) fotogramma(performance.now(), 6);
  }
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => scegli(b.dataset.scenario));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); n.click();
    });
  });

  function fotogramma(ora, forza) {
    let dt = Math.min(0.05, (ora - ultimo) / 1000); ultimo = ora;
    if (forza) {   // movimento ridotto: un solo fotogramma significativo
      SCENARI[nome].inizia();
      let tt = 0; for (let k = 0; k < forza * 30; k++) { tt += 1 / 30; ctx.drawImage(terreno, 0, 0, w, h); lettura.textContent = SCENARI[nome].disegna(c, tt, 1 / 30); }
      return;
    }
    tempo += dt;
    ctx.drawImage(terreno, 0, 0, w, h);
    const testo = SCENARI[nome].disegna(c, tempo, dt);
    if (testo) lettura.textContent = testo;
  }

  new ResizeObserver(() => { dimensiona(); if (ridotto) fotogramma(performance.now(), 6); }).observe(cv);
  new IntersectionObserver(([v]) => { visibile = v.isIntersecting; ultimo = performance.now(); }).observe(cv);
  scegli(nome);
  if (!ridotto) {
    const ciclo = (ora) => { requestAnimationFrame(ciclo); if (visibile && w) fotogramma(ora); };
    requestAnimationFrame(ciclo);
  }
});
