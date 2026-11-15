// Comportamenti comuni a tutte le pagine: menu, comparse, sfondo a curve di
// livello, dimostrazione della chat, modulo di contatto.
import { disegnaCurve } from './topo.js';

const ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LINGUA = (document.documentElement.lang || 'it').slice(0, 2);
const L = {
  it: { apri: 'Apri il menu', chiudi: 'Chiudi il menu', manca: 'Mancano nome, email valida o messaggio.',
    aperto: (m) => `Si è aperto il tuo programma di posta. Se non è successo, scrivi a ${m}.`,
    nome: 'Nome', azienda: 'Azienda', arg: 'Argomento', contatto: 'Contatto' },
  en: { apri: 'Open menu', chiudi: 'Close menu', manca: 'Please add your name, a valid email and a message.',
    aperto: (m) => `Your email app should have opened. If it didn't, write to ${m}.`,
    nome: 'Name', azienda: 'Company', arg: 'Topic', contatto: 'Contact' },
  de: { apri: 'Menü öffnen', chiudi: 'Menü schließen', manca: 'Bitte Name, gültige E-Mail und Nachricht angeben.',
    aperto: (m) => `Ihr E-Mail-Programm sollte sich geöffnet haben. Falls nicht, schreiben Sie an ${m}.`,
    nome: 'Name', azienda: 'Firma', arg: 'Thema', contatto: 'Kontakt' },
}[LINGUA] || null;
const TL = L || { apri: 'Apri il menu', chiudi: 'Chiudi il menu' };

/* ------------------------------------------------------------ navigazione */
const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-nav-toggle]');
const aggiornaNav = () => nav?.classList.toggle('is-solid', scrollY > 24);
addEventListener('scroll', aggiornaNav, { passive: true });
aggiornaNav();
toggle?.addEventListener('click', () => {
  const aperto = nav.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(aperto));
  toggle.setAttribute('aria-label', aperto ? TL.chiudi : TL.apri);
});
document.querySelectorAll('[data-nav-links] a').forEach((a) =>
  a.addEventListener('click', () => { nav.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); }));

/* --------------------------------------------------------------- comparse */
const io = new IntersectionObserver((voci) => {
  for (const v of voci) if (v.isIntersecting) { v.target.classList.add('is-in'); io.unobserve(v.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
document.querySelectorAll('[data-reveal]').forEach((el, i) => {
  if (!el.style.getPropertyValue('--d')) {
    // ritardo a cascata per gli elementi fratelli
    const fratelli = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    el.style.setProperty('--d', `${Math.min(fratelli.indexOf(el), 6) * 0.07}s`);
  }
  io.observe(el);
});

/* ------------------------------------------- bagliore che segue il puntatore */
document.querySelectorAll('.product, .door').forEach((c) => {
  c.addEventListener('pointermove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`);
    c.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* -------------------------------------------- sfondo a curve di livello */
// il colore d'accento è quello dell'unità (variabile CSS --accent-rgb)
const accentoRGB = () => getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim() || '255, 90, 31';
// Si disegna UNA volta per dimensione: ricalcolarla di continuo rubava tempo al
// 3D che gira sopra (e lo faceva scattare).
document.querySelectorAll('canvas[data-topo]').forEach((cv) => {
  const ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let ultimo = '';
  const disegna = () => {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h || `${w}x${h}` === ultimo) return;
    ultimo = `${w}x${h}`;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    disegnaCurve(ctx, w, h, { passo: w < 700 ? 16 : 13,
      colore: 'rgba(255,255,255,.055)', colore2: `rgba(${accentoRGB()}, .16)` });
  };
  new ResizeObserver(() => requestAnimationFrame(disegna)).observe(cv);
});

/* ------------------------------------------------- dimostrazione della chat */
document.querySelectorAll('[data-chat]').forEach((chat) => {
  if (ridotto) return;
  const q = chat.querySelector('[data-chat-q]');
  const pensa = chat.querySelector('[data-chat-think]');
  const a = chat.querySelector('[data-chat-a]');
  const testo = chat.querySelector('[data-chat-text]');
  const fonti = chat.querySelector('[data-chat-cites]');
  const html = testo.innerHTML;
  chat.classList.add('is-armed');
  let partito = false;
  const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
  const avvia = async () => {
    if (partito) return; partito = true;
    q.classList.add('is-shown'); await attendi(700);
    pensa.classList.add('is-shown'); await attendi(1500);
    pensa.style.display = 'none';
    testo.innerHTML = ''; a.classList.add('is-shown');
    // scrive parola per parola, conservando il grassetto
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    for (const nodo of [...tmp.childNodes]) {
      const dest = nodo.nodeType === 3 ? testo.appendChild(document.createTextNode(''))
        : testo.appendChild(nodo.cloneNode(false));
      const parole = nodo.textContent.split(/(\s+)/);
      for (const p of parole) { (dest.nodeType === 3 ? dest : dest).textContent += p; await attendi(28); }
    }
    await attendi(250); fonti.classList.add('is-shown');
  };
  new IntersectionObserver(([v], o) => { if (v.isIntersecting) { avvia(); o.disconnect(); } }, { threshold: 0.4 }).observe(chat);
});

/* ------------------------------------------------- modulo di contatto */
// I bottoni con data-interesse preselezionano l'argomento del modulo.
document.querySelectorAll('[data-interesse]').forEach((b) => b.addEventListener('click', () => {
  const r = document.querySelector(`input[name="interesse"][data-chiave="${b.dataset.interesse}"]`);
  if (r) r.checked = true;
}));
// Preselezione secondo la pagina
const unita = document.body.className.match(/unita-(\w+)/)?.[1];
const preferito = { droni: 'droni', ai: 'ai', investitori: 'investitori' }[unita];
if (preferito) {
  const r = document.querySelector(`input[name="interesse"][data-chiave="${preferito}"]`);
  if (r) r.checked = true;
}

document.querySelectorAll('[data-form]').forEach((form) => {
  const msg = form.querySelector('[data-form-msg]');
  const posta = document.querySelector('[data-mail]')?.textContent.trim() || 'info@bampa.it';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    for (const campo of form.querySelectorAll('[required]')) {
      const valido = campo.value.trim() && (campo.type !== 'email' || /\S+@\S+\.\S+/.test(campo.value));
      campo.classList.toggle('is-bad', !valido);
      if (!valido) ok = false;
    }
    if (!ok) { msg.textContent = TL.manca; return; }
    const d = new FormData(form);
    const oggetto = `[bampa.net] ${d.get('interesse') || TL.contatto} — ${d.get('nome')}`;
    const corpo = [
      d.get('messaggio'), '', '—',
      `${TL.nome}: ${d.get('nome')}`,
      d.get('azienda') ? `${TL.azienda}: ${d.get('azienda')}` : null,
      `Email: ${d.get('email')}`,
      `${TL.arg}: ${d.get('interesse') || '-'}`,
    ].filter((x) => x !== null).join('\n');
    location.href = `mailto:${posta}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;
    msg.textContent = TL.aperto(posta);
  });
});
