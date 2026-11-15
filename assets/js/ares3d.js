// Visore 3D di ARES MINI.
//
// Il modello (assets/3d/ares_mini.glb) è il modello esecutivo del drone,
// esportato da strumenti/esporta_ares_glb.py. Ha un nodo "tilt" col pivot
// sull'asse di basculamento: ruotandolo i rotori anteriori passano da crociera
// (0°) a hover (90°). I materiali arrivano solo come NOMI e qui diventano
// materiali fisici: colori e finiture si cambiano in LIVREA, senza riesportare.
//
// Tre modi:
//   data-ares="storia"   la posa segue lo scroll: ogni [data-pose] è una scena
//   data-ares="vetrina"  gira da solo e alterna hover e crociera
//   [data-ares-esplora]  un bottone che apre il modello a tutto schermo:
//                        rotazione, zoom (rotella o pizzico), spostamento,
//                        cursore hover↔crociera, vista interna
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ?v= cambia a ogni pubblicazione (build.py): il browser non mescola mai un modello
// vecchio con il codice nuovo
const VERSIONE = document.documentElement.dataset.versione || '';
// misura dei tempi di caricamento: ?tempi nell'indirizzo li scrive in console
const DEBUG = location.search.includes('debug');
const T0 = performance.now();
const tempi = { modulo: Math.round(T0) };
const segna = (k) => { tempi[k] = Math.round(performance.now()); };
const MODELLO = new URL(`../3d/ares_mini.glb?v=${VERSIONE}`, import.meta.url).href;
const ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RAD = Math.PI / 180;
const INTERNO = new URL(`../3d/ares_mini_interno.glb?v=${VERSIONE}`, import.meta.url).href;

// ------------------------------------------------------------ testi
const LINGUA = (document.documentElement.lang || 'it').slice(0, 2);
const T = {
  it: { carico: 'Carico il modello…', nogl: 'Il browser non supporta la grafica 3D', noglb: 'Modello 3D non disponibile',
        hover: 'HOVER', trans: 'TRANSIZIONE', croc: 'CROCIERA', interna: 'INTERNA', esterna: 'ESTERNA',
        titolo: 'ARES MINI · modello esecutivo', tilt: 'Rotori', vista: 'Vista interna', reset: 'Ripristina',
        anima: 'Transizione', chiudi: 'Chiudi',
        aiuto: 'Trascina per ruotare · rotella o pizzico per lo zoom · tasto destro o due dita per spostare' },
  en: { carico: 'Loading the model…', nogl: 'Your browser does not support 3D graphics', noglb: '3D model unavailable',
        hover: 'HOVER', trans: 'TRANSITION', croc: 'CRUISE', interna: 'INSIDE', esterna: 'OUTSIDE',
        titolo: 'ARES MINI · production model', tilt: 'Rotors', vista: 'Inside view', reset: 'Reset',
        anima: 'Transition', chiudi: 'Close',
        aiuto: 'Drag to rotate · scroll or pinch to zoom · right-click or two fingers to pan' },
  de: { carico: 'Modell wird geladen…', nogl: 'Ihr Browser unterstützt keine 3D-Grafik', noglb: '3D-Modell nicht verfügbar',
        hover: 'SCHWEBEN', trans: 'TRANSITION', croc: 'REISEFLUG', interna: 'INNEN', esterna: 'AUSSEN',
        titolo: 'ARES MINI · Fertigungsmodell', tilt: 'Rotoren', vista: 'Innenansicht', reset: 'Zurücksetzen',
        anima: 'Transition', chiudi: 'Schließen',
        aiuto: 'Ziehen zum Drehen · Scrollen oder Zwei-Finger-Zoom · Rechtsklick oder zwei Finger zum Verschieben' },
}[LINGUA] || null;
const t = T || { carico: 'Carico il modello…' };

// ------------------------------------------------------------ livrea
// Livrea "aquila", stilizzata: nero opaco dominante e arancio papaya in due
// curve per ala. La linea sul bordo d'attacco è la spalla, la seconda curva che
// si stacca e finisce a spillo è la remigante, le lame sullo stabilizzatore la coda.
// solo dove nella realtà si sceglie un colore (la tela e il guscio stampato).
// Tutti i componenti comprati hanno il loro colore vero.
const LIVREA = {
  scuro: 0x111215,       // tela e guscio della gondola
  scuro2: 0x1a1c20,      // altre parti stampate (PETG nero)
  accento: 0xff6a00,     // arancio papaya
  // squame dell'ala: passo (m), quanto si inclina la normale, quanto scurisce il bordo
  // squame dell'ala: crescita di ogni fila verso il bordo d'uscita, larghezza/lunghezza,
  // quanto si inclina la normale, quanto scurisce il bordo, quanto schiarisce il centro
  crescita: 0.13, snellezza: 0.62, rilievo: 0.32, ombra: 0.5, luce: 0.06,
  // la tela è opaca e la luce piena: a riflettanza piena il rosso satura e il
  // tono vira al salmone. Con questa frazione resta papaya.
  riflettanza: 0.42,
};

// Geometria dell'ala misurata sul modello (m, coordinate del visore: muso
// verso -z, x lungo l'apertura). Servono a far seguire alla livrea la forma.
const GLSL_ALA = () => `
float bordoAttacco(float u) { return u < 0.11 ? mix(-0.166, -0.112, smoothstep(0.0, 0.11, u)) : -0.112 + 0.42 * (u - 0.11); }
float bordoUscita(float u)  { return mix(-0.012, 0.024, smoothstep(0.15, 0.276, u)); }
// la lama: parte larga sul bordo d'attacco al centro, si assottiglia curvando
// verso la punta e verso il bordo d'uscita, come il flusso dell'aria
bool lama(vec3 p) {
  float u = abs(p.x);
  float s = (p.z - bordoAttacco(u)) / max(bordoUscita(u) - bordoAttacco(u), 0.01);
  float t = clamp(u / 0.268, 0.0, 1.0);
  float centro = mix(0.12, 0.40, pow(t, 1.4));
  float larga = 0.15 * pow(1.0 - t, 0.8) + 0.012;
  return s > -0.05 && s < 1.02 && abs(s - centro) < larga * 0.5;
}
// la remigante: una seconda curva che nasce dalla spalla a metà apertura e si
// allunga verso il bordo d'uscita in punta, finendo a spillo
bool penne(vec3 p) {
  float u = abs(p.x);
  float s = (p.z - bordoAttacco(u)) / max(bordoUscita(u) - bordoAttacco(u), 0.01);
  float t = clamp((u - 0.10) / 0.16, 0.0, 1.0);
  float centro = mix(0.27, 0.95, pow(t, 0.75));
  float larga = 0.10 * (1.0 - t) * smoothstep(0.0, 0.35, t) + 0.006;
  return u > 0.10 && u < 0.26 && s < 1.0 && abs(s - centro) < larga * 0.5;
}
// i fianchi della gondola: due curve che partono basse dal muso, salgono verso
// poppa, si separano e finiscono a spillo (y relativo al velivolo, non al mondo)
bool fianchi(vec3 p, vec3 n) {
  if (abs(n.x) < 0.35) return false;
  float k = (p.z + 0.17) / 0.30;
  if (k < 0.0 || k > 1.0) return false;
  float y = p.y;
  // una sola curva sottile, più corta: un accenno, non una decorazione piena
  float q = clamp((k - 0.18) / 0.62, 0.0, 1.0);
  if (k < 0.18 || k > 0.80) return false;
  float c1 = 0.050 + 0.018 * pow(q, 1.3);
  float w1 = 0.0042 * pow(sin(3.14159 * q), 0.9) + 0.0003;
  return abs(y - c1) < w1 * 0.5;
}
// LE SQUAME DELL'ALA, come piume: file lungo la corda (z verso poppa), ogni
// squama un'ellisse allungata col bordo tondo verso il bordo d'uscita, e quella
// davanti sopra quella dietro. Restituisce (d, qx, qz): d < 1 dentro la squama
// visibile, q la posizione nella squama (serve a inclinare la normale: cupola).
// Griglia log-polare: ogni fila è ${Math.round(LIVREA.crescita * 100)}% più lunga della precedente e
// le squame restano proporzionate, come le piume da quelle minute del bordo
// d'attacco a quelle lunghe verso il bordo d'uscita.
vec2 griglia(vec2 p) {
  float w = max(p.y + 0.19, 0.005);
  float a = ${LIVREA.crescita.toFixed(3)};
  return vec2(p.x / (w * a * ${LIVREA.snellezza.toFixed(3)}), log(w) / log(1.0 + a));
}
vec3 squama(vec2 p) {
  vec2 g = griglia(p);
  float r0 = floor(g.y);
  vec3 vince = vec3(2.0, 0.0, 0.0);
  for (int k = 2; k >= -1; k--) {             // da poppa a prua: vince la più avanti
    float r = r0 + float(k);
    float sh = mod(r, 2.0) * 0.5;
    float cx = floor(g.x - sh) + 0.5 + sh;
    vec3 migliore = vec3(2.0, 0.0, 0.0);
    for (int i = -1; i <= 1; i++) {
      vec2 q = (g - vec2(cx + float(i), r)) / vec2(0.66, 0.98);
      float d = length(q);
      if (d < migliore.x) migliore = vec3(d, q);
    }
    if (migliore.x < 1.0) vince = migliore;
  }
  return vince;
}
// la stessa lama, in scala, sullo stabilizzatore (x fino a 0.071, z 0.178-0.244)
bool lamaCoda(vec3 p) {
  float t = clamp(abs(p.x) / 0.071, 0.0, 1.0);
  float s = (p.z - 0.178) / 0.066;
  float centro = mix(0.15, 0.75, pow(t, 1.25));
  float larga = 0.17 * pow(1.0 - t, 0.8) + 0.03;
  return t > 0.12 && abs(s - centro) < larga * 0.5;
}`;

// Le squame: colore (il bordo che sta sotto la squama davanti è in ombra) e
// normale (ogni squama è una piccola cupola). Sotto una certa grandezza a
// schermo si spengono, se no tremolano. Solo sull'ala.
const SQUAME_COLORE = `
  vec2 gSq = griglia(vec2(abs(vMondo.x), vMondo.z));
  nitido = clamp(1.6 - 2.2 * length(fwidth(gSq)), 0.0, 1.0);
  sq = squama(vec2(abs(vMondo.x), vMondo.z));
  float bordo = smoothstep(0.72, 1.0, sq.x) * nitido;
  diffuseColor.rgb *= 1.0 - ${LIVREA.ombra.toFixed(3)} * bordo + ${LIVREA.luce.toFixed(3)} * (1.0 - sq.x) * nitido;`;
const SQUAME_NORMALE = `
  {
    vec3 inc = vec3(sign(vMondo.x) * sq.y, 0.0, sq.z) * ${LIVREA.rilievo.toFixed(3)} * (1.0 + 2.0 * smoothstep(0.8, 1.0, sq.x)) * nitido;
    normal = normalize(normal + (viewMatrix * vec4(inc, 0.0)).xyz);
  }`;

// Le decorazioni si disegnano nello shader, dalla posizione nel mondo: niente
// texture, e la forma si regola cambiando i numeri qui sopra.
// Un solo programma per tutte le superfici con la livrea: il tipo (0 ala, 1 coda,
// 2 vasca) è un uniform. Ogni variante in più era uno shader da preparare in
// più al caricamento (~40 ms l'uno).
const TIPI = { ala: 0, coda: 1, vasca: 2 };
function decora(materiale, tipo) {
  materiale.onBeforeCompile = (sh) => {
    sh.uniforms.uAccento = { value: new THREE.Color(LIVREA.accento) };
    sh.uniforms.uTipo = { value: TIPI[tipo] };
    sh.uniforms.uQuota = { value: 0 };     // quota del velivolo: la si toglie a y
    materiale.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uQuota;\nvarying vec3 vMondo;\nvarying vec3 vNormMondo;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMondo = (modelMatrix * vec4(transformed, 1.0)).xyz - vec3(0.0, uQuota, 0.0);\nvNormMondo = normalize(mat3(modelMatrix) * objectNormal);');
    // l'ala si sposta in verticale col volo: conta solo x e z
    const cond = '(uTipo == 0 && (lama(vMondo) || penne(vMondo))) || (uTipo == 1 && lamaCoda(vMondo)) || (uTipo == 2 && fianchi(vMondo, vNormMondo))';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAccento;\nuniform int uTipo;\nvarying vec3 vMondo;\nvarying vec3 vNormMondo;' + GLSL_ALA())
      .replace('#include <color_fragment>', `#include <color_fragment>\nif (${cond}) diffuseColor.rgb = uAccento * ${LIVREA.riflettanza.toFixed(3)};\nvec3 sq = vec3(2.0); float nitido = 0.0;\nif (uTipo == 0) {` + SQUAME_COLORE + '\n}')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uTipo == 0) {' + SQUAME_NORMALE + '\n}');
  };
  materiale.customProgramCacheKey = () => 'livrea';
  return materiale;
}

function materiali() {
  // MeshStandardMaterial: shader più leggero da compilare e da disegnare. Le
  // chiavi del physical (clearcoat, specularIntensity) qui si ignorano.
  const P = (o) => {
    const { clearcoat, clearcoatRoughness, specularIntensity, ...std } = o;
    return new THREE.MeshStandardMaterial(std);
  };
  // il film coincide col profilo delle centine: polygonOffset lo tiene davanti
  // la tela resta MeshPhysical: solo lui permette di abbassare il riflesso
  // speculare (specularIntensity), e senza un nero opaco diventa argento
  const film = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.62,
    specularIntensity: 0.22, envMapIntensity: 0.6, side: THREE.DoubleSide, polygonOffset: true,
    polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });
  return {
    film_nucleo:         decora(film(LIVREA.scuro), 'ala'),
    film_pannelli:       decora(film(LIVREA.scuro), 'ala'),
    film_elevoni:        decora(film(LIVREA.scuro), 'ala'),
    film_stabilizzatore: decora(film(LIVREA.scuro), 'coda'),
    film:                decora(film(LIVREA.scuro), 'ala'),      // GLB vecchi
    film_accento:        decora(film(LIVREA.scuro), 'ala'),
    petg_gondola:  decora(film(LIVREA.scuro, { polygonOffset: false, roughness: 0.7 }), 'vasca'),
    petg:          P({ color: LIVREA.scuro2, roughness: 0.6, specularIntensity: 0.3 }),
    carbonio:      P({ color: 0x0c0d10, roughness: 0.2, metalness: 0.35 }),
    balsa:         P({ color: 0xdcc08f, roughness: 0.82 }),
    compensato:    P({ color: 0xc89f68, roughness: 0.78 }),
    tiglio:        P({ color: 0xe6d3a9, roughness: 0.78 }),
    acciaio:       P({ color: 0xd2d5da, metalness: 1, roughness: 0.24 }),
    nylon:         P({ color: 0xefede6, roughness: 0.6 }),
    motore:        P({ color: 0x45484e, metalness: 0.85, roughness: 0.34 }),   // EMAX ECO II, campana anodizzata
    elica:         P({ color: 0x0e0f11, roughness: 0.35, clearcoat: 0.4 }),     // Gemfan VORTEX
    servo:         P({ color: 0x16171a, roughness: 0.5 }),                     // EMAX ES08MD II, ES9051
    squadretta:    P({ color: 0x232529, roughness: 0.45 }),                    // la squadretta del servo del tilt
    batteria:      P({ color: 0x2a2c30, roughness: 0.4, clearcoat: 0.5 }),     // Tattu 4S
    camera:        P({ color: 0x0b0b0c, roughness: 0.25, clearcoat: 0.9 }),
    rame:          P({ color: 0xc8805a, metalness: 1, roughness: 0.28 }),
    antenna:       P({ color: 0x18191b, roughness: 0.5 }),
    pcb:           P({ color: 0x141517, roughness: 0.42, metalness: 0.15 }),   // Matek, Radxa: PCB nero
  };
}
// i materiali che diventano trasparenti nella vista interna
const GUSCI = ['film_nucleo', 'film_pannelli', 'film_elevoni', 'film_stabilizzatore', 'film', 'film_accento', 'petg_gondola'];

// ogni GLB si scarica una volta sola, anche con più visori nella pagina
const promesse = {};
function caricaGLB(url, progresso) {
  if (!promesse[url]) {
    promesse[url] = new GLTFLoader().loadAsync(url, (e) => {
      if (!progresso || !T) return;
      progresso.textContent = e.total ? `${t.carico} ${Math.round((e.loaded / e.total) * 100)}%`
        : `${t.carico} ${(e.loaded / 1e6).toFixed(1)} MB`;
    });
  }
  return promesse[url];
}

// Il meccanismo del tilt: ogni corpo mobile (culla, manovella, asta, snodi,
// squadretta, motore, elica) ha nel GLB la sua posa a ogni angolo, calcolata
// dalla cinematica vera del progetto. Qui si interpola fra due angoli vicini.
function corpiMobili(radice, gltf) {
  const dati = gltf.parser.json.extras?.mobili || {};
  const angoli = gltf.parser.json.extras?.tilt_gradi || [];
  const fuori = [];
  radice.traverse((o) => {
    if (!o.name.startsWith('mob_')) return;
    const d = dati[o.name.slice(4)];
    if (!d) return;
    // la posizione è quella del BARICENTRO del pezzo: interpolata così, un pezzo che
    // rotola su sé stesso (l'asta) non gira attorno al velivolo
    fuori.push({ nodo: o, angoli, q: d.q.map((a) => new THREE.Quaternion(...a)), t: d.c.map((a) => new THREE.Vector3(...a)) });
  });
  return fuori;
}
function posaMobili(mobili, gradi) {
  for (const m of mobili) {
    const a = m.angoli, n = a.length;
    const g = Math.min(a[n - 1], Math.max(a[0], gradi));
    let i = 0;
    while (i < n - 2 && a[i + 1] < g) i++;
    const f = (g - a[i]) / (a[i + 1] - a[i]);
    m.nodo.quaternion.slerpQuaternions(m.q[i], m.q[i + 1], f);
    m.nodo.position.lerpVectors(m.t[i], m.t[i + 1], f);
  }
}
function vestiModello(radice, M) {
  radice.traverse((o) => {
    if (!o.isMesh) return;
    const nome = o.material?.name;
    if (M[nome]) o.material = M[nome];
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

// ------------------------------------------------------------ scena comune
async function creaScena(canvas, progresso, radiceErrore) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    if (progresso) progresso.textContent = t.nogl;
    radiceErrore?.querySelector('.loader__ring')?.remove();
    return null;
  }
  // qualità secondo il dispositivo: telefoni e macchine piccole partono più leggeri
  const debole = matchMedia('(max-width: 860px)').matches || (navigator.hardwareConcurrency || 8) <= 4
    || (navigator.deviceMemory || 8) <= 4;
  let rapporto = Math.min(devicePixelRatio || 1, debole ? 1.25 : 1.5);
  renderer.setPixelRatio(rapporto);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // l'ombra si ricalcola solo quando il drone cambia forma o quota: girargli
  // intorno con la camera non la cambia
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scena.environmentIntensity = 1.3;

  // luci: principale con ombra, controluce caldo che stacca la sagoma, riempimento freddo
  const chiave = new THREE.DirectionalLight(0xffffff, 2.8);
  chiave.position.set(1.4, 2.6, 1.2);
  chiave.castShadow = true;
  chiave.shadow.mapSize.set(debole ? 512 : 1024, debole ? 512 : 1024);
  Object.assign(chiave.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 6 });
  chiave.shadow.bias = -0.0004;
  chiave.shadow.normalBias = 0.01;
  scena.add(chiave);
  const controluce = new THREE.DirectionalLight(0xffd2a8, 2.6);
  controluce.position.set(-1.8, 0.8, -1.6);
  scena.add(controluce);
  const riempi = new THREE.DirectionalLight(0xc8e6ff, 0.8);
  riempi.position.set(-1.2, 0.4, 1.8);
  scena.add(riempi);

  const pavimento = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.38 }));
  pavimento.rotation.x = -Math.PI / 2;
  pavimento.receiveShadow = true;
  scena.add(pavimento);
  const disco = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,128,0,.22)'); r.addColorStop(0.5, 'rgba(255,128,0,.06)'); r.addColorStop(1, 'rgba(255,128,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.001;
    scena.add(m); return m;
  })();

  let gltf;
  try {
    gltf = await caricaGLB(MODELLO, progresso);   // già partito all'avvio del modulo
    segna('glb');
  } catch (e) {
    if (progresso) progresso.textContent = t.noglb;
    radiceErrore?.querySelector('.loader__ring')?.remove();
    console.error(e);
    return null;
  }
  // ogni visore ha la sua copia del modello e i suoi materiali
  const M = materiali();
  const aereo = gltf.scene.clone(true);
  vestiModello(aereo, M);
  const mobili = corpiMobili(aereo, gltf);
  const box = new THREE.Box3().setFromObject(aereo);
  const centro = box.getCenter(new THREE.Vector3());
  const dim = box.getSize(new THREE.Vector3());
  aereo.position.set(-centro.x, -box.min.y, -centro.z);
  const gruppo = new THREE.Group();
  gruppo.add(aereo);
  scena.add(gruppo);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 30);
  let sporco = true;           // c'è qualcosa da ridisegnare anche se la posa non cambia
  const ridimensiona = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    sporco = true;
  };
  new ResizeObserver(ridimensiona).observe(canvas);
  ridimensiona();
  // gli shader si compilano qui, in parallelo dove il browser lo permette: senza,
  // il primo fotogramma bloccava la pagina mentre il modello era già "pronto"
  segna('scena');
  try { await renderer.compileAsync(scena, camera); } catch (e) { /* browser vecchi: si compila al primo fotogramma */ }
  segna('shader');

  // l'interno (struttura in legno, elettronica, servi) arriva dopo, e solo
  // dove serve la vista interna: il primo caricamento resta leggero
  let interno = null, chiesto = false, ultimoTilt = 90;
  const caricaInterno = () => {
    if (chiesto) return;
    chiesto = true;
    caricaGLB(INTERNO).then((gi) => {
      interno = gi.scene.clone(true);
      vestiModello(interno, M);
      mobili.push(...corpiMobili(interno, gi));
      interno.visible = false;
      aereo.add(interno);
      posaMobili(mobili, ultimoTilt);
      renderer.shadowMap.needsUpdate = true;
      sporco = true;
    }).catch((e) => console.error(e));
  };

  // se il dispositivo arranca (fotogrammi oltre i 28 ms), si scende a una
  // densità di pixel 1: una volta sola, senza far scattare l'immagine
  const durate = [];
  let ultimoT = 0;
  const misura = (ora) => {
    if (ultimoT && rapporto > 1 && durate.length < 40) {
      durate.push(ora - ultimoT);
      if (durate.length === 40) {
        const mediana = durate.sort((a, b) => a - b)[20];
        if (mediana > 28) { rapporto = 1; renderer.setPixelRatio(1); ridimensiona(); }
      }
    }
    ultimoT = ora;
  };

  let ultimaQuota = null;
  return {
    renderer, scena, camera, gruppo, M, dim, disco, pavimento, caricaInterno,
    // disegna solo se serve: `cambiato` lo dice chi muove la camera o la posa
    disegna(cambiato) {
      if (!cambiato && !sporco) { ultimoT = 0; return; }
      sporco = false;
      misura(performance.now());
      renderer.render(scena, camera);
    },
    raggio: Math.max(dim.x, dim.z) / 2,
    altezza: dim.y * 0.45,
    // stato comune a tutti i modi
    imposta({ tilt: gradi = 90, xray = 0, lift = 0 }) {
      if (gradi !== ultimoTilt || !this.posato) {
        posaMobili(mobili, gradi); ultimoTilt = gradi; this.posato = true;
        renderer.shadowMap.needsUpdate = true;
      }
      if (lift !== ultimaQuota) { ultimaQuota = lift; renderer.shadowMap.needsUpdate = true; }
      if (xray > 0.001) caricaInterno();
      if (interno) interno.visible = xray > 0.02;
      gruppo.position.y = lift;
      const s = 1 + lift * 3;
      disco.scale.set(s, s, s);
      disco.material.opacity = 1 - Math.min(0.7, lift * 4);
      pavimento.material.opacity = 0.38 - Math.min(0.2, lift);
      for (const k of GUSCI) {
        const m = M[k]; const op = 1 - xray * 0.9;
        m.transparent = op < 0.999; m.opacity = op; m.depthWrite = op > 0.6;
      }
      for (const m of Object.values(M)) if (m.userData.shader) m.userData.shader.uniforms.uQuota.value = lift;
    },
  };
}

function hudTesto(gradi) {
  return gradi > 70 ? t.hover : gradi > 15 ? t.trans : t.croc;
}

// ------------------------------------------------------------ pose
function leggiPosa(s) {
  // mira: 0 guarda il centro del velivolo, 1 il punto (tx, ty, tz) in metri
  const p = { az: 30, el: 15, d: 1, tilt: 90, xray: 0, lift: 0, sx: 0, sy: 0, mira: 0, tx: 0, ty: 0, tz: 0 };
  for (const kv of (s || '').trim().split(/\s+/)) {
    const [k, v] = kv.split(':');
    if (k in p && v !== undefined) p[k] = parseFloat(v);
  }
  return p;
}
const mescola = (a, b, k) => { const o = {}; for (const x in a) o[x] = a[x] + (b[x] - a[x]) * k; return o; };
const morbida = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------ storia e vetrina
async function avvia(radice) {
  const modo = radice.dataset.ares;
  const storia = modo === 'storia';
  const canvas = radice.querySelector('[data-ares-canvas]');
  const loader = radice.querySelector('[data-ares-loader]');
  const progresso = radice.querySelector('[data-ares-progress]');
  if (progresso && T) progresso.textContent = t.carico;
  const hud = {
    modo: radice.querySelector('[data-hud-modo]'), tilt: radice.querySelector('[data-hud-tilt]'),
    vista: radice.querySelector('[data-hud-vista]'), bar: radice.querySelector('[data-hud-bar]'),
  };
  const passi = [...radice.querySelectorAll('[data-pose]')];
  // ?posa=az:90 el:0 tilt:0 ... blocca il modello su una posa: serve a regolare le scene
  const posaFissa = new URLSearchParams(location.search).get('posa');

  const S = await creaScena(canvas, progresso, radice);
  if (!S) return;
  loader?.classList.add('is-done');
  radice.dataset.prontoMs = Math.round(performance.now());   // misura: ms dall'apertura della pagina
  requestAnimationFrame(() => requestAnimationFrame(() => { segna('primo_fotogramma'); tempi.programmi = S.renderer.info.programs.length; tempi.disegni = S.renderer.info.render.calls; tempi.triangoli = S.renderer.info.render.triangles; radice.dataset.tempi = JSON.stringify(tempi); if (location.search.includes('tempi')) { console.log('tempi', JSON.stringify(tempi)); navigator.sendBeacon?.('/_tempi', JSON.stringify({ pagina: location.pathname, larghezza: innerWidth, ...tempi })); } }));
  // la vista interna arriva più avanti nella storia: l'interno si scarica a riposo
  if (storia) setTimeout(() => S.caricaInterno(), 3500);
  radice.dataset.ingombro = [S.dim.x, S.dim.y, S.dim.z].map((v) => v.toFixed(3)).join(' × ');

  let posa = storia && passi.length ? leggiPosa(passi[0].dataset.pose) : leggiPosa('az:35 el:14 d:.72 tilt:90 lift:.06');
  let attuale = { ...posa };
  const trascina = { yaw: 0, pitch: 0, attivo: false, x: 0, y: 0 };
  const largo = () => innerWidth > 860;

  function posaDaScroll() {
    // ogni passo ha un punto d'ancora: il suo centro al centro dello schermo
    const centri = passi.map((p) => { const r = p.getBoundingClientRect(); return r.top + r.height / 2 - innerHeight / 2; });
    let i = 0;
    while (i < centri.length - 1 && centri[i + 1] <= 0) i++;
    const a = leggiPosa(passi[i].dataset.pose);
    let attivo = i;
    if (i < centri.length - 1 && centri[i] <= 0) {
      const k = Math.min(1, Math.max(0, -centri[i] / (centri[i + 1] - centri[i])));
      if (k > 0.5) attivo = i + 1;
      posa = mescola(a, leggiPosa(passi[i + 1].dataset.pose), morbida(k));
    } else posa = a;
    passi.forEach((p, n) => p.classList.toggle('is-active', n === attivo));
  }

  function applica(p, tempo) {
    const { camera } = S;
    const az = (p.az + trascina.yaw) * RAD;
    const el = Math.min(85, Math.max(-5, p.el + trascina.pitch)) * RAD;
    // il velivolo deve stare nell'altezza E in una frazione della larghezza
    // (su PC ~40%, accanto al testo; su telefono ~85%, sopra al testo)
    const tv = Math.tan((camera.fov / 2) * RAD), th = tv * camera.aspect;
    const frazione = storia && largo() ? 0.4 : 0.85;
    const dist = p.d * Math.max((S.raggio * 1.15) / tv, S.raggio / (frazione * th));
    S.imposta({ tilt: p.tilt, xray: p.xray, lift: p.lift });
    const bersaglio = new THREE.Vector3(0, S.altezza + p.lift * 0.6, 0)
      .lerp(new THREE.Vector3(p.tx, p.ty + p.lift, p.tz), p.mira);
    camera.position.set(
      bersaglio.x + dist * Math.cos(el) * Math.sin(az),
      bersaglio.y + dist * Math.sin(el),
      bersaglio.z - dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(bersaglio);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const sx = !storia || largo() ? p.sx : 0, sy = !storia || largo() ? p.sy : 0.2;
    camera.setViewOffset(w, h, -sx * w, sy * h, w, h);
  }

  function hudAggiorna(p) {
    if (!hud.tilt) return;
    const g = Math.round(p.tilt);
    hud.tilt.textContent = g;
    hud.modo.textContent = hudTesto(g);
    if (hud.vista) hud.vista.textContent = p.xray > 0.5 ? t.interna : t.esterna;
    if (hud.bar) hud.bar.style.transform = `scaleX(${g / 90})`;
  }

  // trascinamento con il mouse (su telefono il dito scorre la pagina)
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    trascina.attivo = true; trascina.x = e.clientX; trascina.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    radice.querySelector('[data-ares-hint]')?.classList.add('is-hidden');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!trascina.attivo) return;
    trascina.yaw -= (e.clientX - trascina.x) * 0.35;
    trascina.pitch += (e.clientY - trascina.y) * 0.2;
    trascina.x = e.clientX; trascina.y = e.clientY;
  });
  const lascia = () => { trascina.attivo = false; };
  canvas.addEventListener('pointerup', lascia);
  canvas.addEventListener('pointercancel', lascia);

  let visibile = true;
  new IntersectionObserver(([v]) => { visibile = v.isIntersecting; }).observe(radice);
  const orologio = new THREE.Clock();
  let tempo = 0;
  (function fotogramma() {
    requestAnimationFrame(fotogramma);
    if (!visibile || document.body.classList.contains('esplora-aperta')) return;
    const dt = Math.min(orologio.getDelta(), 0.05);
    tempo += dt;
    if (posaFissa) posa = leggiPosa(posaFissa);
    else if (storia && passi.length) posaDaScroll();
    else {
      // vetrina: gira e alterna hover e crociera
      const fase = ridotto ? 0 : (Math.sin(tempo * 0.6) + 1) / 2;
      posa = { ...posa, az: ridotto ? 35 : 35 + tempo * 14, tilt: 90 * morbida(Math.min(1, Math.max(0, fase * 1.4 - 0.2))),
        lift: 0.03 + 0.05 * fase, el: 14, d: 0.72, sx: 0, sy: 0 };
    }
    const k = ridotto || posaFissa ? 1 : 1 - Math.exp(-dt * 5);
    const prima = { ...attuale, yaw: trascina.yaw, pitch: trascina.pitch };
    attuale = mescola(attuale, posa, k);
    if (!trascina.attivo) { trascina.yaw *= 1 - dt * 0.8; trascina.pitch *= 1 - dt * 0.8; }
    let scarto = Math.abs(trascina.yaw - prima.yaw) + Math.abs(trascina.pitch - prima.pitch);
    for (const x in attuale) scarto += Math.abs(attuale[x] - prima[x]);
    const cambiato = scarto > 1e-4 || !storia;
    // la camera si mette in posa SEMPRE (costa niente): al primo fotogramma la
    // posa non è "cambiata", e senza questo la camera restava sotto il drone
    applica(attuale, tempo);
    if (cambiato) hudAggiorna(attuale);
    S.disegna(cambiato);
    if (DEBUG) {
      // dove sta il drone sullo schermo (-1..1): per controllare le scene senza guardarle
      const b = new THREE.Box3().setFromObject(S.gruppo), v = new THREE.Vector3(), lo = [9, 9], hi = [-9, -9];
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(S.camera);
        lo[0] = Math.min(lo[0], v.x); lo[1] = Math.min(lo[1], v.y); hi[0] = Math.max(hi[0], v.x); hi[1] = Math.max(hi[1], v.y);
      }
      radice.dataset.schermo = [...lo, ...hi].map((x) => x.toFixed(2)).join(' ') + ' scroll ' + Math.round(scrollY);
    }
  })();
}

// ------------------------------------------------------------ esplora (tutto schermo)
let dialogo = null;
async function apriEsplora() {
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'esplora';
    dialogo.innerHTML = `
      <canvas class="esplora__canvas" aria-label="${t.titolo}"></canvas>
      <div class="loader" data-loader><div class="loader__ring"></div><span data-prog>${t.carico}</span></div>
      <header class="esplora__top">
        <p class="esplora__title"><span class="dot"></span> ${t.titolo}</p>
        <button class="esplora__close" data-chiudi aria-label="${t.chiudi}">✕</button>
      </header>
      <div class="esplora__bar">
        <label class="esplora__tilt">${t.tilt} <b data-tlbl>90°</b>
          <input type="range" min="0" max="90" value="90" data-tilt aria-label="${t.tilt}">
          <span class="esplora__modo" data-tmodo>${t.hover}</span></label>
        <button class="btn btn--small btn--ghost" data-anima>▶ ${t.anima}</button>
        <button class="btn btn--small btn--ghost" data-xray aria-pressed="false">${t.vista}</button>
        <button class="btn btn--small btn--ghost" data-reset>${t.reset}</button>
      </div>
      <p class="esplora__help">${t.aiuto}</p>`;
    document.body.appendChild(dialogo);
    const chiudi = () => { dialogo.close(); };
    dialogo.querySelector('[data-chiudi]').addEventListener('click', chiudi);
    dialogo.addEventListener('close', () => document.body.classList.remove('esplora-aperta'));
    dialogo.showModal();
    document.body.classList.add('esplora-aperta');

    const canvas = dialogo.querySelector('canvas');
    const S = await creaScena(canvas, dialogo.querySelector('[data-prog]'), dialogo);
    if (!S) return;
    dialogo.querySelector('[data-loader]').classList.add('is-done');
    setTimeout(() => S.caricaInterno(), 1200);
    const controlli = new OrbitControls(S.camera, canvas);
    controlli.enableDamping = true;
    controlli.dampingFactor = 0.08;
    controlli.target.set(0, S.altezza, 0);
    controlli.minDistance = S.raggio * 0.6;
    controlli.maxDistance = S.raggio * 9;
    controlli.maxPolarAngle = Math.PI * 0.55;     // non si va sotto il pavimento
    controlli.autoRotate = !ridotto;
    controlli.autoRotateSpeed = 0.8;
    controlli.addEventListener('start', () => { controlli.autoRotate = false; });
    const iniziale = () => {
      const tv = Math.tan((S.camera.fov / 2) * RAD);
      const d = Math.max((S.raggio * 1.3) / tv, S.raggio / (0.7 * tv * S.camera.aspect));
      S.camera.position.set(d * 0.55, S.altezza + d * 0.32, -d * 0.78);
      controlli.target.set(0, S.altezza, 0);
      controlli.update();
    };
    iniziale();

    const stato = { tilt: 90, meta: 90, xray: 0, metaX: 0, anima: false, tempo: 0 };
    S.imposta({ tilt: stato.tilt, xray: 0, lift: 0 });     // i rotori nella posa indicata, da subito
    const cursore = dialogo.querySelector('[data-tilt]');
    const etichetta = dialogo.querySelector('[data-tlbl]');
    const modo = dialogo.querySelector('[data-tmodo]');
    const bAnima = dialogo.querySelector('[data-anima]');
    const bX = dialogo.querySelector('[data-xray]');
    cursore.addEventListener('input', () => { stato.meta = +cursore.value; stato.anima = false; bAnima.classList.remove('is-on'); });
    bAnima.addEventListener('click', () => { stato.anima = !stato.anima; bAnima.classList.toggle('is-on', stato.anima); });
    bX.addEventListener('click', () => {
      stato.metaX = stato.metaX ? 0 : 1;
      bX.setAttribute('aria-pressed', String(!!stato.metaX)); bX.classList.toggle('is-on', !!stato.metaX);
    });
    dialogo.querySelector('[data-reset]').addEventListener('click', () => {
      stato.meta = 90; stato.metaX = 0; stato.anima = false; cursore.value = 90;
      bX.classList.remove('is-on'); bAnima.classList.remove('is-on'); iniziale(); controlli.autoRotate = !ridotto;
    });

    const orologio = new THREE.Clock();
    (function fotogramma() {
      requestAnimationFrame(fotogramma);
      if (!dialogo.open) return;
      const dt = Math.min(orologio.getDelta(), 0.05);
      stato.tempo += dt;
      if (stato.anima) {
        stato.meta = 45 + 45 * Math.cos(stato.tempo * 0.9);
        cursore.value = Math.round(stato.meta);
      }
      const k = ridotto ? 1 : 1 - Math.exp(-dt * 6);
      const prima = stato.tilt + stato.xray;
      stato.tilt += (stato.meta - stato.tilt) * k;
      stato.xray += (stato.metaX - stato.xray) * k;
      const mosso = Math.abs(stato.tilt + stato.xray - prima) > 1e-4;
      if (mosso) {
        S.imposta({ tilt: stato.tilt, xray: stato.xray, lift: 0 });
        etichetta.textContent = `${Math.round(stato.tilt)}°`;
        modo.textContent = hudTesto(stato.tilt);
      }
      const camera = controlli.update();      // true finché la camera si muove (anche per inerzia)
      S.disegna(mosso || camera || controlli.autoRotate);
    })();
  } else {
    dialogo.showModal();
    document.body.classList.add('esplora-aperta');
  }
}

if (document.querySelector('[data-ares]')) caricaGLB(MODELLO, document.querySelector('[data-ares-progress]'));
document.querySelectorAll('[data-ares]').forEach(avvia);
document.querySelectorAll('[data-ares-esplora]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); apriEsplora(); }));
// droni.html?esplora apre direttamente il visore: è un link da condividere
if (new URLSearchParams(location.search).has('esplora')) apriEsplora();
