// Dimensionatore indicativo di un server AI locale (EPYC + più GPU).
//
// Memoria = pesi del modello + contesto degli utenti (KV cache) + margine.
//   pesi: data-pesi sul radio del modello (GB, quantizzazione ~4 bit)
//   KV:   data-kv (GB ogni 1000 token per utente, a 16 bit) × token × utenti,
//         con cache a 8 bit (×0.5) e un riempimento medio del 60%
// Le configurazioni sono in CONFIG: per cambiarle basta modificare la lista.

const CONFIG = [
  { nome: 'EPYC · 2 GPU', gpu: 2, vram: 48, ram: 256 },
  { nome: 'EPYC · 3 GPU', gpu: 3, vram: 72, ram: 256 },
  { nome: 'EPYC · 4 GPU', gpu: 4, vram: 96, ram: 512 },
  { nome: 'EPYC · 4 GPU professionali', gpu: 4, vram: 192, ram: 1024 },
];
const CONTESTI = [8, 16, 32, 64, 128];           // migliaia di token
const RIEMPIMENTO = 0.6, KV_8BIT = 0.5, MARGINE_GB = 4, MARGINE_REL = 0.08;

const LINGUA = (document.documentElement.lang || 'it').slice(0, 2);
const fmt = (n) => Math.round(n).toLocaleString({ it: 'it-IT', en: 'en-GB', de: 'de-DE' }[LINGUA] || 'it-IT');
const TESTI = {
  it: { contesto: (k) => `${k} mila token`, oltre: 'Più server, o GPU da datacenter',
    vram: 'Tutto nella memoria delle GPU: la configurazione più veloce.',
    ibrido: 'Ibrido: il contesto nelle GPU, gli strati in eccesso nella RAM a 8 canali. È qui che EPYC fa la differenza.',
    oltreT: 'Oltre una singola macchina: si divide il carico su più server o si passa a GPU da datacenter.',
    nomi: ['EPYC · 2 GPU', 'EPYC · 3 GPU', 'EPYC · 4 GPU', 'EPYC · 4 GPU professionali'] },
  en: { contesto: (k) => `${k}k tokens`, oltre: 'Several servers, or datacenter GPUs',
    vram: 'Everything in GPU memory: the fastest configuration.',
    ibrido: 'Hybrid: context in the GPUs, the extra layers in 8-channel RAM. This is where EPYC makes the difference.',
    oltreT: 'Beyond a single machine: the load is split across servers, or you move to datacenter GPUs.',
    nomi: ['EPYC · 2 GPUs', 'EPYC · 3 GPUs', 'EPYC · 4 GPUs', 'EPYC · 4 professional GPUs'] },
  de: { contesto: (k) => `${k} Tsd. Token`, oltre: 'Mehrere Server oder Rechenzentrums-GPUs',
    vram: 'Alles im GPU-Speicher: die schnellste Konfiguration.',
    ibrido: 'Hybrid: Kontext in den GPUs, überzählige Schichten im 8-Kanal-RAM. Genau hier macht EPYC den Unterschied.',
    oltreT: 'Mehr als eine Maschine: Die Last wird auf mehrere Server verteilt, oder man setzt Rechenzentrums-GPUs ein.',
    nomi: ['EPYC · 2 GPUs', 'EPYC · 3 GPUs', 'EPYC · 4 GPUs', 'EPYC · 4 Profi-GPUs'] },
};
const L = TESTI[LINGUA] || TESTI.it;
CONFIG.forEach((c, i) => { c.nome = L.nomi[i] || c.nome; });

document.querySelectorAll('[data-dimensionatore]').forEach((radice) => {
  const form = radice.querySelector('form');
  const $ = (s) => radice.querySelector(s);

  function calcola() {
    const m = form.querySelector('input[name="modello"]:checked');
    const utenti = +form.utenti.value;
    const ctxK = CONTESTI[+form.contesto.value];
    const pesi = +m.dataset.pesi;
    const kv = +m.dataset.kv * ctxK * utenti * KV_8BIT * RIEMPIMENTO;
    const tot = (pesi + kv) * (1 + MARGINE_REL) + MARGINE_GB;

    $('[data-out-utenti]').textContent = utenti;
    $('[data-out-contesto]').textContent = L.contesto(ctxK);
    $('[data-tot]').textContent = fmt(tot);
    $('[data-pesi]').textContent = fmt(pesi);
    $('[data-kv]').textContent = fmt(kv);
    $('[data-bar-pesi]').style.width = `${(pesi / (pesi + kv)) * 100}%`;
    $('[data-bar-kv]').style.width = `${(kv / (pesi + kv)) * 100}%`;

    // la più piccola che tiene tutto in VRAM; se nessuna, la più piccola ibrida
    // (il contesto deve comunque stare in VRAM: è lì che serve velocità)
    let scelta = CONFIG.find((c) => tot <= c.vram * 0.95);
    let modo = 'vram';
    if (!scelta) {
      scelta = CONFIG.find((c) => tot <= c.vram + c.ram * 0.85 && kv + MARGINE_GB <= c.vram * 0.7);
      modo = scelta ? 'ibrido' : 'oltre';
    }
    const c = scelta || CONFIG[CONFIG.length - 1];
    $('[data-cfg-nome]').textContent = modo === 'oltre' ? L.oltre : c.nome;
    $('[data-cfg-vram]').textContent = `${c.vram} GB`;
    $('[data-cfg-ram]').textContent = `${c.ram} GB`;
    $('[data-fit-vram]').style.width = `${Math.min(1, tot / c.vram) * 100}%`;
    $('[data-fit-ram]').style.width = `${Math.min(1, Math.max(0, tot - c.vram) / c.ram) * 100}%`;
    const v = $('[data-cfg-verdetto]');
    v.dataset.modo = modo;
    v.textContent = { vram: L.vram, ibrido: L.ibrido, oltre: L.oltreT }[modo];
  }

  form.addEventListener('input', calcola);
  calcola();
});
