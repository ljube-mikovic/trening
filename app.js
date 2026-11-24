/* Trening – kućni trening i mršavljenje. Svi podaci ostaju na telefonu (localStorage). */
'use strict';

/* ========================= POMOĆNE FUNKCIJE ========================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LOC = 'sr-Latn-RS';
const fmt = (n, d = 0) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSigned = (n, d = 1) => (n == null || isNaN(n)) ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n), d);
const parseNum = v => { if (v == null) return NaN; const s = String(v).trim().replace(/\s/g, '').replace(',', '.'); return s === '' ? NaN : Number(s); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DAY = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota'];
const DAY_S = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'];
const MON = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const MON_S = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

// Datumi se čuvaju kao 'YYYY-MM-DD' (lokalno vreme)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const dnum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const fromDnum = n => { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const diffDays = (a, b) => dnum(a) - dnum(b);
const dow = s => parse(s).getDay();
const monday = s => addDays(s, -((dow(s) + 6) % 7));
const fmtDate = s => { const d = parse(s); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.`; };
const fmtDateTbl = s => { const d = parse(s); return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}.`; };
const fmtDateShort = s => { const d = parse(s); return `${d.getDate()}. ${MON_S[d.getMonth()]}`; };
const fmtDateLong = s => { const d = parse(s); return `${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}.`; };

/* ========================= PODACI ========================= */
const KEY = 'forma.v1';
const DEFAULTS = {
  settings: {
    name: 'Ljube', age: 44, height: 188, startWeight: null, startDate: '2026-11-25', targetWeight: 95, targetDate: '2027-07-01',
    kcalGoal: 2200, stepsGoal: 6000, kmGoal: 4.5, level: 0, rest: 60, theme: 'auto', sound: true, vibrate: true
  },
  weights: [],        // {id, date, kg}
  daily: {},          // 'YYYY-MM-DD': {steps, kcal, km}
  workouts: [],       // {id, date, key, title, minutes, sets, total}
  active: null,       // trening u toku
  loads: {},          // istorija tegova po vežbi: id -> [{date, kg, full}]
  badges: {},         // otključana dostignuća: id -> datum
  onboarded: false,
  ui: { stepsMetric: 'steps', stepsPeriod: 7, weightPeriod: 'all', actPeriod: 14, installHidden: false, repWeek: 0 }
};
let S = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw) return structuredClone(DEFAULTS);
    if (raw.onboarded === undefined && ((raw.weights || []).length || (raw.workouts || []).length)) raw.onboarded = true;
    return {
      ...structuredClone(DEFAULTS), ...raw,
      settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
      ui: { ...DEFAULTS.ui, ...(raw.ui || {}) }
    };
  } catch (e) { return structuredClone(DEFAULTS); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Greška pri čuvanju podataka'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ========================= VEŽBE ========================= */
// r = ponavljanja, s = sekunde, per = dodatak (po nozi...), alt = zamena bez skokova (prvi mesec)
const EX = {
  warm:        { n: 'Zagrevanje: brzi hod u mestu + kruženje ramenima i kukovima', yt: 'beginner low impact warm up 5 minutes', s: 300, fixed: true, sets1: true, noRest: true },
  // grudi / triceps
  bench_db:    { w: 1, n: 'Potisak bučicama na ravnoj klupi', yt: 'dumbbell bench press proper form', r: 10 },
  incline_db:  { w: 1, n: 'Potisak bučicama na kosoj klupi', yt: 'incline dumbbell press form', r: 10 },
  pushup_h:    { n: 'Sklekovi na šipkicama', yt: 'push up handles push ups form', r: 8, note: 'Po potrebi na kolenima ili sa rukama na klupi.' },
  db_fly:      { w: 1, n: 'Razvlačenje bučicama na ravnoj klupi', yt: 'dumbbell chest fly form', r: 12 },
  dips:        { n: 'Propadanja na razboju', yt: 'parallel bar dips beginner', r: 6, note: 'Početak: noge na podu ili pomoć elastične trake.' },
  ez_skull:    { w: 1, n: 'Francuski potisak krivom (EZ) šipkom', yt: 'ez bar skull crusher form', r: 10 },
  band_push:   { n: 'Ekstenzija tricepsa sa elastičnom trakom', yt: 'resistance band tricep pushdown', r: 15 },
  close_push:  { n: 'Sklekovi uskim hvatom na šipkicama', yt: 'close grip push ups', r: 8, note: 'Po potrebi na kolenima.' },
  // noge / zadnjica
  goblet:      { w: 1, n: 'Goblet čučanj sa ruskim zvonom', yt: 'kettlebell goblet squat form', r: 10 },
  bar_rdl:     { w: 1, n: 'Rumunsko mrtvo dizanje šipkom', yt: 'barbell romanian deadlift form', r: 10 },
  db_rdl:      { w: 1, n: 'Rumunsko mrtvo dizanje bučicama', yt: 'dumbbell romanian deadlift form', r: 10 },
  rev_lunge:   { w: 1, n: 'Iskorak unazad sa bučicama', yt: 'dumbbell reverse lunge form', r: 8, per: 'po nozi', note: 'Prvih nedelja uz oslonac jednom rukom.' },
  hip_thrust:  { w: 1, n: 'Podizanje kukova sa leđima na klupi (šipka)', yt: 'barbell hip thrust bench', r: 12 },
  glute_br:    { n: 'Glute most (podizanje kukova sa poda)', yt: 'glute bridge exercise', r: 12 },
  band_walk:   { n: 'Bočni hod sa elastičnom trakom', yt: 'resistance band lateral walk', r: 12, per: 'po strani' },
  calf:        { w: 1, n: 'Podizanje na prste sa bučicama', yt: 'dumbbell standing calf raise', r: 15 },
  kb_dl:       { w: 1, n: 'Mrtvo dizanje ruskim zvonom', yt: 'kettlebell deadlift form', r: 12 },
  bar_dl:      { w: 1, n: 'Mrtvo dizanje šipkom', yt: 'barbell deadlift beginner form', r: 8 },
  // kondicija / stomak
  kb_swing:    { w: 1, n: 'Zamasi ruskim zvonom', yt: 'kettlebell swing proper form', r: 15 },
  rope:        { n: 'Preskakanje vijače', yt: 'jump rope beginner', s: 45, alt: 'march' },
  burpee:      { n: 'Burpee', yt: 'burpee proper form', r: 8, alt: 'kb_swing2' },
  march:       { n: 'Brzi hod u mestu (visoko podizanje kolena)', yt: 'marching in place high knees low impact', s: 60 },
  kb_swing2:   { w: 1, n: 'Zamasi ruskim zvonom (lakši tempo)', yt: 'kettlebell swing proper form', r: 12 },
  climber:     { n: 'Penjač sporo, ruke na klupi', yt: 'incline mountain climbers slow', s: 30 },
  plank:       { n: 'Plank na podlakticama', yt: 'forearm plank proper form', s: 30 },
  side_plank:  { n: 'Bočni plank', yt: 'side plank beginner', s: 20, per: 'po strani' },
  dead_bug:    { n: 'Mrtva buba (dead bug)', yt: 'dead bug exercise form', r: 10, per: 'po strani' },
  knee_tuck:   { n: 'Privlačenje kolena sedeći na klupi', yt: 'seated knee tucks on bench', r: 12 },
  hang_knee:   { n: 'Podizanje kolena u visu na šipki', yt: 'hanging knee raises', r: 8 },
  rus_twist:   { w: 1, n: 'Ruski zaokret sa bučicom', yt: 'russian twist dumbbell', r: 12, per: 'po strani' },
  farmer:      { w: 1, n: 'Farmerski hod sa bučicama', yt: 'farmers walk dumbbells form', s: 40 },
  // leđa / biceps
  pullup_b:    { n: 'Zgibovi uz pomoć elastične trake', yt: 'band assisted pull ups', r: 5, note: 'Ako ne ide: spori negativni zgibovi (spuštanje 3–5 s).' },
  band_pulldn: { n: 'Povlačenje trake ka grudima (traka na šipki za zgibove)', yt: 'resistance band lat pulldown', r: 12 },
  bar_row:     { w: 1, n: 'Veslanje šipkom u pretklonu', yt: 'barbell bent over row form', r: 10 },
  db_row:      { w: 1, n: 'Veslanje bučicom jednom rukom na klupi', yt: 'one arm dumbbell row bench', r: 10, per: 'po ruci' },
  pull_apart:  { n: 'Razvlačenje elastične trake ispred grudi', yt: 'band pull apart', r: 15 },
  ez_curl:     { w: 1, n: 'Pregib krivom (EZ) šipkom', yt: 'ez bar curl form', r: 10 },
  hammer:      { w: 1, n: 'Hammer pregib bučicama', yt: 'hammer curl form', r: 10 },
  hang:        { n: 'Vis na šipki za zgibove', yt: 'dead hang pull up bar', s: 20 },
  // ramena / ruke
  db_ohp:      { w: 1, n: 'Potisak bučicama iznad glave, sedeći na kosoj klupi', yt: 'seated dumbbell shoulder press', r: 10 },
  lat_raise:   { w: 1, n: 'Odručenje bučicama', yt: 'dumbbell lateral raise form', r: 12 },
  arnold:      { w: 1, n: 'Arnold potisak bučicama', yt: 'arnold press form', r: 10 },
  face_pull:   { n: 'Face pull sa elastičnom trakom', yt: 'resistance band face pull', r: 15 },
  oh_ext:      { w: 1, n: 'Ekstenzija tricepsa bučicom iznad glave', yt: 'overhead dumbbell tricep extension', r: 12 },
  conc_curl:   { w: 1, n: 'Koncentrisani pregib bučicom', yt: 'concentration curl form', r: 10, per: 'po ruci' },
  kb_halo:     { w: 1, n: 'Halo kruženje ruskim zvonom oko glave', yt: 'kettlebell halo', r: 8, per: 'po smeru' },
  // istezanje i mobilnost
  cat_cow:     { n: 'Mačka – krava', yt: 'cat cow stretch', r: 10, mob: true },
  wgs:         { n: 'Istezanje „najbolje na svetu“ (iskorak sa rotacijom)', yt: 'worlds greatest stretch', r: 5, per: 'po strani', mob: true },
  hip_flex:    { n: 'Istezanje pregibača kuka u klečećem iskoraku', yt: 'kneeling hip flexor stretch', s: 30, per: 'po strani', mob: true },
  hamstring:   { n: 'Istezanje zadnje lože (traka oko stopala)', yt: 'lying hamstring stretch band', s: 30, per: 'po nozi', mob: true },
  thoracic:    { n: 'Rotacija grudnog dela kičme u bočnom ležanju', yt: 'open book thoracic rotation', r: 8, per: 'po strani', mob: true },
  dislocate:   { n: 'Kruženje ramena sa trakom (napred – nazad)', yt: 'band shoulder dislocates', r: 10, mob: true },
  deep_sq:     { n: 'Zadržavanje u dubokom čučnju uz oslonac', yt: 'assisted deep squat hold', s: 30, mob: true },
  cobra:       { n: 'Kobra (istezanje stomaka i kičme)', yt: 'cobra stretch', s: 30, mob: true },
  child:       { n: 'Položaj deteta', yt: 'child pose stretch', s: 45, mob: true },
  pec_str:     { n: 'Istezanje grudi uz dovratak', yt: 'doorway chest stretch', s: 30, per: 'po strani', mob: true }
};

const SESSIONS = {
  fullA:     { t: 'Celo telo A', sub: 'Lagan početak – osnovni pokreti', ex: ['warm', 'goblet', 'pushup_h', 'db_row', 'db_ohp', 'glute_br', 'dead_bug', 'plank'] },
  fullB:     { t: 'Celo telo B', sub: 'Lagan početak – zadnji lanac i leđa', ex: ['warm', 'kb_dl', 'rev_lunge', 'incline_db', 'band_pulldn', 'pull_apart', 'farmer', 'side_plank'] },
  cardio:    { t: 'Kondicija i stomak', sub: 'Izvodi kao krug: vežbu za vežbom, odmor posle kruga', ex: ['warm', 'kb_swing', 'rope', 'climber', 'burpee', 'dead_bug', 'knee_tuck', 'rus_twist', 'plank'] },
  chest:     { t: 'Grudi i triceps', sub: 'Potisci, sklekovi i propadanja', ex: ['warm', 'bench_db', 'incline_db', 'pushup_h', 'db_fly', 'dips', 'ez_skull', 'band_push'] },
  legs:      { t: 'Noge i zadnjica', sub: 'Čučnjevi, iskoraci i kukovi', ex: ['warm', 'goblet', 'bar_rdl', 'rev_lunge', 'hip_thrust', 'band_walk', 'calf'] },
  back:      { t: 'Leđa i biceps', sub: 'Zgibovi, veslanja i pregibi', ex: ['warm', 'pullup_b', 'bar_row', 'db_row', 'pull_apart', 'ez_curl', 'hammer', 'hang'] },
  shoulders: { t: 'Ramena i ruke', sub: 'Potisci, odručenja, triceps i biceps', ex: ['warm', 'db_ohp', 'lat_raise', 'arnold', 'face_pull', 'close_push', 'oh_ext', 'conc_curl', 'kb_halo'] },
  full:      { t: 'Celo telo', sub: 'Snaga i kondicija u jednom treningu', ex: ['warm', 'bar_dl', 'goblet', 'pushup_h', 'bar_row', 'db_ohp', 'kb_swing', 'farmer', 'plank'] },
  mobility:  { t: 'Istezanje i mobilnost', sub: 'Mirno disanje, bez bola – samo prijatno istezanje', ex: ['cat_cow', 'wgs', 'hip_flex', 'hamstring', 'thoracic', 'dislocate', 'pec_str', 'deep_sq', 'cobra', 'child'] }
};
// raspored po fazama; ključ = dan u nedelji (0 = nedelja)
const PHASES = {
  1: { name: 'Navikavanje', desc: '3 treninga nedeljno', days: { 1: 'fullA', 3: 'cardio', 5: 'fullB' } },
  2: { name: 'Izgradnja', desc: '4 treninga nedeljno', days: { 1: 'chest', 2: 'legs', 4: 'back', 6: 'full' } },
  3: { name: 'Pun plan', desc: '7 dana nedeljno', days: { 1: 'chest', 2: 'legs', 3: 'cardio', 4: 'back', 5: 'shoulders', 6: 'full', 0: 'mobility' } }
};
const LEVELS = ['Početnik', 'Srednji', 'Napredni'];

function weekNo(date) {
  const st = S.settings.startDate;
  if (date < st) return 1;
  return Math.floor(diffDays(monday(date), monday(st)) / 7) + 1;
}
const phaseOf = date => { const w = weekNo(date); return w <= 2 ? 1 : w <= 4 ? 2 : 3; };
const noJumps = date => diffDays(date, S.settings.startDate) < 28;
function sessionFor(date) { return PHASES[phaseOf(date)].days[dow(date)] || null; }
const totalWeeks = () => Math.max(1, Math.ceil((diffDays(S.settings.targetDate, S.settings.startDate) + 1) / 7));

function buildSession(key, date) {
  const lvl = S.settings.level;
  const sess = SESSIONS[key];
  const items = sess.ex.map(id => {
    let e = EX[id], swapped = null;
    if (e.alt && noJumps(date)) { swapped = e.n; id = e.alt; e = EX[id]; }
    let sets = e.sets1 ? 1 : e.mob ? [1, 2, 2][lvl] : [2, 3, 4][lvl];
    let reps = null, secs = null;
    if (e.r) reps = Math.round(e.r * [1, 1.2, 1.4][lvl]);
    if (e.s) secs = e.fixed ? e.s : Math.round(e.s * [1, 1.25, 1.5][lvl] / 5) * 5;
    return { id, n: e.n, yt: e.yt, sets, reps, secs, per: e.per, note: e.note, swapped, w: !!e.w, noRest: !!e.noRest || !!e.mob };
  });
  const est = Math.round(items.reduce((a, x) => a + x.sets * ((x.secs || x.reps * 3.5) + (x.noRest ? 10 : S.settings.rest)), 0) / 60);
  return { key, t: sess.t, sub: sess.sub, items, est };
}
const doseText = x => `${x.sets} × ${x.secs ? (x.secs >= 120 ? Math.round(x.secs / 60) + ' min' : x.secs + ' s') : x.reps}${x.per ? ' ' + x.per : ''}`;
const ytUrl = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

/* ========================= TEŽINA – PRORAČUNI ========================= */
const weights = () => [...S.weights].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
function startW() { if (S.settings.startWeight) return S.settings.startWeight; const w = weights(); return w.length ? w[0].kg : null; }
function planAt(date) {
  const sw = startW(); if (sw == null) return null;
  const { startDate, targetDate, targetWeight } = S.settings;
  const t = clamp(diffDays(date, startDate) / Math.max(1, diffDays(targetDate, startDate)), 0, 1);
  return sw + (targetWeight - sw) * t;
}
const BMI = kg => kg / Math.pow(S.settings.height / 100, 2);
const bmiCat = b => b < 18.5 ? 'Pothranjenost' : b < 25 ? 'Normalna' : b < 30 ? 'Prekomerna' : b < 35 ? 'Gojaznost I' : b < 40 ? 'Gojaznost II' : 'Gojaznost III';

function weightStats() {
  const w = weights(); const sw = startW(); const tw = S.settings.targetWeight;
  if (!w.length || sw == null) return null;
  const last = w[w.length - 1];
  const cur = last.kg;
  const lost = sw - cur;
  const left = cur - tw;
  const pct = clamp(lost / (sw - tw), 0, 1);
  const t = today();
  const daysLeft = Math.max(0, diffDays(S.settings.targetDate, t));
  const weeksLeft = daysLeft / 7;
  const needRate = weeksLeft > 0 ? left / weeksLeft : null;
  const plan = planAt(last.date);
  const vsPlan = cur - plan; // negativno = ispred plana
  // stvarni tempo – linearna regresija poslednjih do 8 merenja
  let rate = null, eta = null;
  const pts = w.slice(-8);
  if (pts.length >= 2 && diffDays(pts[pts.length - 1].date, pts[0].date) >= 6) {
    const xs = pts.map(p => dnum(p.date)), ys = pts.map(p => p.kg);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    const slope = den ? num / den : 0; // kg po danu
    rate = -slope * 7;
    if (left <= 0) eta = last.date;
    else if (slope < -0.005) eta = fromDnum(dnum(last.date) + Math.ceil(left / -slope));
  }
  if (left <= 0) eta = eta || last.date;
  return { w, last, cur, sw, tw, lost, left, pct, daysLeft, weeksLeft, needRate, plan, vsPlan, rate, eta };
}
function statusOf(vs) {
  if (vs == null) return { cls: 'neutral', txt: '–' };
  if (Math.abs(vs) < 0.3) return { cls: 'good', txt: 'Na planu' };
  if (vs < 0) return { cls: 'good', txt: `Ispred plana ${fmt(-vs, 1)} kg` };
  return { cls: vs < 1.5 ? 'warn' : 'bad', txt: `Iza plana ${fmt(vs, 1)} kg` };
}
// podsetnik za nedeljno merenje
function weighReminder() {
  const t = today(); const w = weights();
  if (!w.length) return t >= addDays(S.settings.startDate, -1) ? 'start' : null;
  const lastSun = addDays(t, -dow(t));
  if (lastSun <= S.settings.startDate) return null;
  const has = w.some(x => x.date >= lastSun);
  if (has) return null;
  return dow(t) === 0 ? 'sunday' : 'missed';
}

/* ========================= AKTIVNOST ========================= */
const woOn = d => S.workouts.filter(w => w.date === d);
function sumMinutes(from, to) { const r = S.workouts.filter(w => w.date >= from && w.date <= to); return { min: r.reduce((a, w) => a + w.minutes, 0), n: r.length }; }
function streak() {
  // niz dana po planu: urađen trening ili planirani dan odmora; današnji dan ne prekida niz
  const st = S.settings.startDate; let d = today(), n = 0;
  if (!S.workouts.length || d < st) return 0;
  if (woOn(d).length) n++;
  d = addDays(d, -1);
  while (d >= st && (woOn(d).length || !sessionFor(d))) { n++; d = addDays(d, -1); }
  return n;
}
function bestStreakWorkoutDays() {
  const days = [...new Set(S.workouts.map(w => w.date))].sort(); let best = 0, cur = 0, prev = null;
  days.forEach(d => { cur = prev && diffDays(d, prev) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; });
  return best;
}

/* ========================= DNEVNI UNOS ========================= */
const METRICS = {
  steps: { lbl: 'Koraci', unit: 'koraka', short: '', d: 0, goal: () => S.settings.stepsGoal, ok: v => v >= S.settings.stepsGoal, best: 'max' },
  kcal:  { lbl: 'Kalorije', unit: 'kcal', short: 'kcal', d: 0, goal: () => S.settings.kcalGoal, ok: v => v > 0 && v <= S.settings.kcalGoal, best: 'min' },
  km:    { lbl: 'Kilometri', unit: 'km', short: 'km', d: 1, goal: () => S.settings.kmGoal, ok: v => v >= S.settings.kmGoal, best: 'max' }
};
const dayVal = (d, m) => { const r = S.daily[d]; return r && r[m] != null && r[m] !== '' ? Number(r[m]) : null; };
function periodStats(m, days, endDate = today()) {
  const list = []; for (let i = days - 1; i >= 0; i--) { const d = addDays(endDate, -i); list.push({ d, v: dayVal(d, m) }); }
  const vals = list.filter(x => x.v != null && x.v > 0);
  const sum = vals.reduce((a, x) => a + x.v, 0);
  const avg = vals.length ? sum / vals.length : null;
  const def = METRICS[m];
  let best = null; vals.forEach(x => { if (!best || (def.best === 'max' ? x.v > best.v : x.v < best.v)) best = x; });
  const inGoal = vals.filter(x => def.ok(x.v)).length;
  return { list, vals, sum, avg, best, inGoal };
}


/* ========================= DOSTIGNUĆA ========================= */
const BICON = {
  dumb: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.2 3 2.5 3.5C11 9 11 6 12 3Z"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7 12a5 5 0 0 1 10 0M12 12l2.4-3.2M8 17h8"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5A3 3 0 0 1 16 10M12 13v4M8.5 20.5h7M9.5 17h5"/></svg>',
  steps: '<svg viewBox="0 0 24 24"><path d="M8 3.5c1.7 0 2.5 2 2.5 4.5S9.6 12.5 8 12.5 5.5 10.5 5.5 8 6.3 3.5 8 3.5ZM16 8.5c1.7 0 2.5 2 2.5 4.5S17.6 17.5 16 17.5 13.5 15.5 13.5 13s.8-4.5 2.5-4.5ZM6 15.5l4 .5-.5 3.5a2 2 0 0 1-4-.5zM14 20.5l4 .5"/></svg>',
  fork: '<svg viewBox="0 0 24 24"><path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 8h3.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8.5 15l2.5 2.5 4.5-5"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/></svg>'
};
const totalMin = () => S.workouts.reduce((a, w) => a + w.minutes, 0);
const lostKg = () => { const w = weights(), sw = startW(); return w.length && sw ? sw - Math.min(...w.map(x => x.kg)) : 0; };
function maxRun(m) {
  const days = Object.keys(S.daily).sort(); let best = 0, cur = 0, prev = null;
  days.forEach(d => { const v = dayVal(d, m); if (v != null && v > 0 && METRICS[m].ok(v)) { cur = prev && diffDays(d, prev) === 1 ? cur + 1 : 1; prev = d; best = Math.max(best, cur); } else { cur = 0; prev = null; } });
  return best;
}
const maxSteps = () => Math.max(0, ...Object.keys(S.daily).map(d => dayVal(d, 'steps') || 0));
const bmiProg = lim => { const w = weights(); if (!w.length) return [0, 1]; const st = BMI(startW()), cur = BMI(Math.min(...w.map(x => x.kg))); return st < lim ? [1, 1] : [Math.max(0, st - cur), st - lim + 0.001]; };
const BADGES = [
  { id: 'wo1', t: 'Prvi korak', d: 'Završi prvi trening', ic: 'dumb', c: '#B6F23E', p: () => [S.workouts.length, 1] },
  { id: 'wo10', t: '10 treninga', d: 'Završi 10 treninga', ic: 'dumb', c: '#B6F23E', p: () => [S.workouts.length, 10] },
  { id: 'wo25', t: '25 treninga', d: 'Završi 25 treninga', ic: 'dumb', c: '#B6F23E', p: () => [S.workouts.length, 25] },
  { id: 'wo50', t: '50 treninga', d: 'Završi 50 treninga', ic: 'dumb', c: '#B6F23E', p: () => [S.workouts.length, 50] },
  { id: 'wo100', t: '100 treninga', d: 'Završi 100 treninga', ic: 'trophy', c: '#FBBF24', p: () => [S.workouts.length, 100] },
  { id: 'min500', t: '500 minuta', d: '500 minuta treninga ukupno', ic: 'clock', c: '#5EEAD4', p: () => [totalMin(), 500] },
  { id: 'min2000', t: '2.000 minuta', d: '2.000 minuta treninga ukupno', ic: 'clock', c: '#5EEAD4', p: () => [totalMin(), 2000] },
  { id: 'str7', t: 'Nedelja po planu', d: 'Niz od 7 dana bez propuštenog treninga', ic: 'flame', c: '#FF9F43', p: () => [streak(), 7] },
  { id: 'str30', t: 'Mesec po planu', d: 'Niz od 30 dana bez propuštenog treninga', ic: 'flame', c: '#FF9F43', p: () => [streak(), 30] },
  { id: 'kg2', t: 'Prva 2 kg', d: 'Skini prva 2 kg', ic: 'scale', c: '#34D399', p: () => [lostKg(), 2] },
  { id: 'kg5', t: 'Minus 5 kg', d: 'Skini 5 kg od starta', ic: 'scale', c: '#34D399', p: () => [lostKg(), 5] },
  { id: 'kg10', t: 'Minus 10 kg', d: 'Skini 10 kg od starta', ic: 'scale', c: '#34D399', p: () => [lostKg(), 10] },
  { id: 'kg15', t: 'Minus 15 kg', d: 'Skini 15 kg od starta', ic: 'scale', c: '#34D399', p: () => [lostKg(), 15] },
  { id: 'kg20', t: 'Minus 20 kg', d: 'Skini 20 kg od starta', ic: 'scale', c: '#34D399', p: () => [lostKg(), 20] },
  { id: 'goal', t: 'Cilj dostignut', d: 'Dostigni ciljnu težinu', ic: 'trophy', c: '#FBBF24', p: () => [lostKg(), Math.max(0.1, (startW() || 0) - S.settings.targetWeight)] },
  { id: 'bmi30', t: 'BMI ispod 30', d: 'Spusti BMI ispod 30', ic: 'heart', c: '#7AA2FF', p: () => bmiProg(30) },
  { id: 'steps10k', t: '10.000 koraka', d: 'Jedan dan sa 10.000+ koraka', ic: 'steps', c: '#A78BFA', p: () => [maxSteps(), 10000] },
  { id: 'stepsRun7', t: '7 dana koraka', d: '7 dana zaredom u cilju koraka', ic: 'steps', c: '#A78BFA', p: () => [maxRun('steps'), 7] },
  { id: 'kcalRun7', t: '7 dana ishrane', d: '7 dana zaredom u kalorijskom cilju', ic: 'fork', c: '#FB7185', p: () => [maxRun('kcal'), 7] },
  { id: 'weigh8', t: 'Disciplina', d: '8 unetih merenja težine', ic: 'cal', c: '#FACC15', p: () => [S.weights.length, 8] }
];
const badgeDone = b => { const [v, g] = b.p(); return g > 0 && v >= g; };
function checkBadges(silent) {
  const nw = BADGES.filter(b => !S.badges[b.id] && badgeDone(b));
  nw.forEach(b => S.badges[b.id] = today());
  if (nw.length) save();
  return silent ? [] : nw;
}
function recomputeBadges() { Object.keys(S.badges).forEach(id => { const b = BADGES.find(x => x.id === id); if (!b || !badgeDone(b)) delete S.badges[id]; }); checkBadges(true); save(); }
const badgeIc = (b, locked, big) => `<div class="badge-ic ${locked ? 'locked' : ''} ${big ? 'big' : ''}" style="--bc:${b.c}">${BICON[b.ic]}</div>`;
function badgesGrid() {
  return `<div class="badges">${BADGES.map(b => {
    const on = !!S.badges[b.id]; const [v, g] = b.p(); const pr = clamp(v / g, 0, 1);
    return `<button class="badge ${on ? 'on' : ''}" data-b="${b.id}">${badgeIc(b, !on)}<b>${b.t}</b>${on ? `<small>${fmtDateShort(S.badges[b.id])}</small>` : `<div class="bar"><i data-w="${(pr * 100).toFixed(0)}%" style="background:${b.c}"></i></div>`}</button>`;
  }).join('')}</div>`;
}
function badgeInfo(id) {
  const b = BADGES.find(x => x.id === id); const on = S.badges[id]; const [v, g] = b.p();
  openSheet(`<div class="empty" style="padding-top:4px">${badgeIc(b, !on, true)}<h3 style="font-size:22px;margin-top:16px">${b.t}</h3><p style="margin:0">${b.d}</p>
    <p style="margin:10px 0 0;font-weight:700;color:${on ? 'var(--good)' : 'var(--muted)'}">${on ? 'Otključano ' + fmtDateLong(on) : `Napredak: ${fmt(Math.min(v, g), v % 1 || g % 1 ? 1 : 0)} / ${fmt(g, g % 1 ? 1 : 0)}`}</p></div>
    <button class="btn ghost block" id="bOk">Zatvori</button>`, el => $('#bOk', el).onclick = () => closeSheet());
}
function badgeSheet(list) {
  if (!list.length) return;
  openSheet(`<div class="empty" style="padding-top:4px"><div class="badge-row">${list.slice(0, 3).map(b => badgeIc(b, false, true)).join('')}</div>
    <h3 style="font-size:24px;margin-top:18px">${list.length > 1 ? 'Nova dostignuća!' : 'Novo dostignuće!'}</h3>
    ${list.map(b => `<p style="margin:4px 0 0"><b style="color:var(--text)">${b.t}</b> – ${b.d.toLowerCase()}</p>`).join('')}</div>
    <button class="btn primary block" id="bOk">Super!</button>`, el => $('#bOk', el).onclick = () => closeSheet());
  confetti();
}
const afterSave = () => setTimeout(() => badgeSheet(checkBadges()), 450);

/* ========================= KONFETE ========================= */
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const cols = [cssVar('--accent'), '#34D399', '#7AA2FF', '#FF9F43', '#FB7185', '#FACC15'];
  const P = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - .5) * 80, y: H * .38, vx: (Math.random() - .5) * 13, vy: -Math.random() * 14 - 5,
    r: Math.random() * 6, vr: (Math.random() - .5) * .35, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, col: cols[Math.random() * cols.length | 0] }));
  const t0 = performance.now();
  (function f(t) {
    const e = t - t0; c.clearRect(0, 0, W, H);
    P.forEach(p => { p.vy += .32; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.max(0, 1 - e / 2800); c.fillStyle = p.col;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); c.restore(); });
    if (e < 2800) requestAnimationFrame(f); else cv.remove();
  })(t0);
}

/* ========================= NEDELJNI IZVEŠTAJ ========================= */
function weekReport(m) {
  const end = addDays(m, 6), t = today(), last = end < t ? end : t, st = S.settings;
  let planned = 0, elapsed = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(m, i); if (d >= st.startDate && sessionFor(d)) planned++; if (d <= last && d >= st.startDate) elapsed++; }
  const wo = S.workouts.filter(w => w.date >= m && w.date <= end);
  const doneDays = new Set(wo.map(w => w.date)).size;
  const minutes = wo.reduce((a, w) => a + w.minutes, 0);
  const days = []; for (let d = m; d <= last; d = addDays(d, 1)) days.push(d);
  const sv = days.map(d => dayVal(d, 'steps')).filter(v => v > 0), kv = days.map(d => dayVal(d, 'kcal')).filter(v => v > 0);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const avgSteps = avg(sv), avgKcal = avg(kv);
  const stepsOk = sv.filter(v => METRICS.steps.ok(v)).length, kcalOk = kv.filter(v => METRICS.kcal.ok(v)).length;
  const w = weights(); const wIn = [...w].reverse().find(x => x.date >= m && x.date <= end); const wPrev = [...w].reverse().find(x => x.date < m);
  const change = wIn && wPrev ? wIn.kg - wPrev.kg : null;
  // procena potrošnje: Mifflin-St Jeor (muškarac) × faktor aktivnosti po koracima + trening
  let deficit = null;
  const kgRef = (wIn || [...w].reverse().find(x => x.date <= end) || { kg: startW() }).kg;
  if (avgKcal && kgRef) {
    const bmr = 10 * kgRef + 6.25 * st.height - 5 * st.age + 5;
    const f = avgSteps == null ? 1.2 : avgSteps < 4000 ? 1.2 : avgSteps < 7000 ? 1.3 : avgSteps < 10000 ? 1.4 : 1.5;
    deficit = bmr * f + minutes * 5 / 7 - avgKcal;
  }
  const n = Math.max(1, elapsed);
  const score = clamp((planned ? Math.min(1, doneDays / planned) : 1) * .4 + (stepsOk / n) * .3 + (kcalOk / n) * .3, 0, 1);
  const grade = !elapsed ? 'Nedelja još nije počela' : score >= .85 ? 'Odlična nedelja' : score >= .65 ? 'Dobra nedelja' : score >= .4 ? 'Solidna nedelja' : 'Ima prostora za bolje';
  return { m, end, planned, doneDays, wo, minutes, avgSteps, avgKcal, stepsOk, kcalOk, nSteps: sv.length, nKcal: kv.length, change, deficit, score, grade, elapsed };
}
function reportCard(r, title, nav) {
  const rng = `${parse(r.m).getDate()}. ${MON_S[parse(r.m).getMonth()]} – ${parse(r.end).getDate()}. ${MON_S[parse(r.end).getMonth()]}`;
  const mini = (l, v, sub, col) => `<div class="mini"><div class="lbl">${l}</div><div class="val num" ${col ? `style="color:${col}"` : ''}>${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const chCol = r.change == null ? null : r.change < 0 ? 'var(--good)' : r.change > 0 ? 'var(--bad)' : null;
  return `<div class="card report"><div class="card-head" style="align-items:flex-start"><div><div class="card-sub">${title} · ${rng}</div><h2 style="font-size:21px;margin-top:4px">${r.grade}</h2></div>
    ${ring(r.score, fmt(r.score * 100, 0), 'poena', 'sm', r.score >= .65 ? 'var(--good)' : r.score >= .4 ? 'var(--accent)' : 'var(--warn)')}</div>
    ${nav ? `<div class="row" style="margin:-4px 0 12px"><button class="btn ghost sm" data-rw="-1">‹ Prethodna</button><button class="btn ghost sm" data-rw="1" ${S.ui.repWeek >= 0 ? 'disabled' : ''}>Sledeća ›</button></div>` : ''}
    <div class="grid3" style="margin-bottom:10px">
      ${mini('Treninzi', `${r.doneDays}/${r.planned}`, `${r.minutes} min`)}
      ${mini('Koraci ø', r.avgSteps != null ? fmt(r.avgSteps) : '–', `${r.stepsOk}/${r.nSteps || 0} u cilju`)}
      ${mini('Kalorije ø', r.avgKcal != null ? fmt(r.avgKcal) : '–', `${r.kcalOk}/${r.nKcal || 0} u cilju`)}</div>
    <div class="grid2" style="margin-bottom:0;gap:10px">
      ${mini('Težina', r.change != null ? fmtSigned(r.change) + ' kg' : '–', r.change != null ? 'u odnosu na prethodno merenje' : 'nema merenja ove nedelje', chCol)}
      ${mini('Deficit (procena)', r.deficit != null ? (r.deficit >= 0 ? '−' : '+') + fmt(Math.abs(r.deficit), 0) + ' kcal' : '–', r.deficit != null ? `dnevno · ≈ ${fmt(Math.max(0, r.deficit) * 7 / 7700, 2)} kg/ned.` : 'unesi kalorije', r.deficit != null ? (r.deficit > 0 ? 'var(--good)' : 'var(--warn)') : null)}</div></div>`;
}

/* ========================= SAVET DANA ========================= */
const TIPS = [
  'Proteini u svakom obroku (meso, riba, jaja, sir, mahunarke) čuvaju mišiće dok mršaviš i duže te drže sitim.',
  'Čaša-dve vode pre obroka pomaže da pojedeš manje, a da ne budeš gladan.',
  'Meri se uvek pod istim uslovima: nedeljom ujutru, posle toaleta, pre doručka.',
  'Težina dnevno skače i do 1–2 kg zbog vode i soli. Gledaj trend na grafikonu, ne pojedinačno merenje.',
  'Šetnja od 10–15 minuta posle ručka ili večere lako donese 1.500 koraka i pomaže varenju.',
  'San od 7–8 sati smanjuje glad i želju za slatkišima narednog dana.',
  'Tehnika pre težine: ako poslednja dva ponavljanja ne možeš čisto, teg je pretežak.',
  'Kad dva treninga zaredom uradiš sve serije istim tegom, sledeći put dodaj malo – aplikacija će ti predložiti.',
  'Neka povrće zauzme pola tanjira: puno volumena, malo kalorija.',
  'Sokovi, gazirana pića i pivo se lako potcene. Upiši i tečne kalorije.',
  'Isplaniraj obroke unapred – najviše kalorija „prođe“ kad smo gladni i nespremni.',
  'Bol u zglobu nije normalan deo treninga. Smanji teg ili preskoči vežbu.',
  'Zagrevanje od 5 minuta smanjuje rizik od povrede i poboljšava učinak.',
  'Brojanje kalorija ne mora biti savršeno – važno je da bude dosledno.',
  'Stepenice umesto lifta i parkiranje dalje od ulaza – mali koraci se sabiraju.',
  'Alkohol ima 7 kcal po gramu i smanjuje kontrolu apetita. Ako piješ, uračunaj ga.',
  'Jedan loš obrok ne kvari nedelju. Sledeći obrok vrati u plan i nastavi.',
  'Jedi sporije – sitost stiže tek 15–20 minuta posle početka obroka.',
  'Spuštaj teg kontrolisano, 2–3 sekunde. Više efekta, manje opterećenja zglobova.',
  'Kardio ne mora biti trčanje: brzi hod je odličan i štedi kolena.',
  'Fotografiši se jednom mesečno – ogledalo i odeća pokažu napredak koji vaga ne vidi.',
  'Obim struka je odličan pokazatelj gubitka masti. Meri ga u visini pupka, uz merenje težine.',
  'Grickalice drži van vidokruga, a voće na vidnom mestu.',
  'Ako si gladan između obroka, popij vodu i sačekaj 10 minuta.',
  'Izdah pri naporu (podizanje), udah pri spuštanju tega.',
  'Doslednost pobeđuje savršenstvo – tri prosečna treninga vrede više od jednog savršenog.',
  'Vikend je kad se najčešće probije kalorijski cilj. Isplaniraj ga unapred.',
  'Istezanje posle treninga i nedeljom pomaže oporavku kukova i leđa.',
  'Doručak bogat proteinima (jaja, jogurt, sir) olakšava kontrolu apetita do ručka.',
  'Ne gladuj – preveliki deficit vodi u umor, gubitak mišića i prejedanje.'
];
const tipToday = () => TIPS[((dnum(today()) % TIPS.length) + TIPS.length) % TIPS.length];
function greeting() { const h = new Date().getHours(); return `${h < 5 ? 'Laku noć' : h < 11 ? 'Dobro jutro' : h < 18 ? 'Dobar dan' : 'Dobro veče'}, ${S.settings.name || 'šampione'}`; }

/* ========================= UVODNI EKRAN ========================= */
function onboarding(step = 0) {
  let el = $('#onb');
  if (!el) { el = document.createElement('section'); el.id = 'onb'; el.className = 'onb'; document.body.appendChild(el); }
  const st = S.settings;
  const dots = `<div class="onb-dots">${[0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
  const f = (k, l, v, u, mode = 'decimal', type = 'text') => `<label class="field"><span>${l}</span><div class="input-unit"><input class="input num" data-o="${k}" type="${type}" ${type === 'text' ? `inputmode="${mode}"` : ''} value="${v}">${u ? `<em>${u}</em>` : ''}</div></label>`;
  let body = '';
  if (step === 0) body = `<div class="onb-hero"><img src="icons/icon-512.png" alt=""><h1>Dobro došao${st.name ? ', ' + st.name : ''}</h1>
    <p>Tvoj lični trener i dnevnik napretka – sve na jednom mestu, radi i bez interneta.</p></div>
    <div class="onb-feats">${[['dumb', 'Plan treninga', 'Za tvoju kućnu opremu, sa postepenim početkom'], ['scale', 'Težina i cilj', 'Plan do cilja, tempo i procena datuma'], ['steps', 'Koraci i kalorije', 'Dnevni ciljevi, grafikoni i nedeljni izveštaj'], ['trophy', 'Dostignuća', 'Nagrade za doslednost i svaki skinuti kilogram']]
      .map(([ic, t, d]) => `<div class="onb-feat"><span>${BICON[ic]}</span><div><b>${t}</b><small>${d}</small></div></div>`).join('')}</div>`;
  if (step === 1) body = `<h2 class="onb-h">Tvoj cilj</h2><p class="lead">Proveri podatke – sve možeš kasnije da promeniš u podešavanjima.</p>
    <div class="grid2" style="margin:0">${f('name', 'Ime', st.name || '', '', 'text')}${f('age', 'Godine', st.age, 'god.', 'numeric')}</div>
    <div class="grid2" style="margin:0">${f('height', 'Visina', st.height, 'cm', 'numeric')}${f('targetWeight', 'Ciljna težina', fmt(st.targetWeight, 1), 'kg')}</div>
    <div class="grid2" style="margin:0">${f('startDate', 'Start plana', st.startDate, '', '', 'date')}${f('targetDate', 'Rok', st.targetDate, '', '', 'date')}</div>
    <div class="grid2" style="margin:0">${f('kcalGoal', 'Kalorije dnevno', st.kcalGoal, 'kcal', 'numeric')}${f('stepsGoal', 'Koraci dnevno', st.stepsGoal, '', 'numeric')}</div>
    <div class="onb-sum" id="onbSum"></div>`;
  if (step === 2) body = `<h2 class="onb-h">Nivo i navike</h2><p class="lead">Počni kao početnik. Nivo povećaj kad ti treninzi postanu laki.</p>
    <div class="onb-levels">${LEVELS.map((l, i) => `<button class="onb-level ${st.level === i ? 'on' : ''}" data-lv="${i}"><b>${l}</b><small>${[2, 3, 4][i]} serije po vežbi</small></button>`).join('')}</div>
    <div class="card flat" style="background:var(--card);margin-top:16px"><div class="row" style="gap:12px;align-items:flex-start"><span class="onb-ic">${BICON.cal}</span>
      <div><b>Nedeljno merenje</b><div class="small muted" style="font-weight:600;margin-top:2px">Početnu težinu unosiš u ${DAY[dow(st.startDate)].toLowerCase()}, ${fmtDateLong(st.startDate)} ujutru. Posle toga – svake nedelje ujutru.</div></div></div>
      <button class="btn ghost block mt" id="oIcs">${ICON.cal} Dodaj podsetnik u kalendar</button></div>
    ${deferredPrompt ? `<button class="btn ghost block" id="oInst">${ICON.install} Instaliraj aplikaciju</button>` : ''}`;
  el.innerHTML = `<div class="onb-in">${dots}<div class="onb-body">${body}</div><div class="onb-nav">${step ? '<button class="btn ghost" data-ob>Nazad</button>' : ''}<button class="btn primary" data-on>${step === 2 ? 'Počni' : 'Dalje'}</button></div></div>`;
  el.scrollTop = 0;
  const readStep1 = () => {
    let ok = true;
    $$('[data-o]', el).forEach(i => {
      const k = i.dataset.o; let v = i.value;
      if (k === 'name') { st.name = v.trim().slice(0, 20); return; }
      if (i.type === 'date') { if (v) st[k] = v; return; }
      v = parseNum(v); if (isNaN(v) || v <= 0) { ok = false; return; }
      st[k] = ['age', 'height', 'kcalGoal', 'stepsGoal'].includes(k) ? Math.round(v) : v;
    });
    if (st.targetDate <= st.startDate) { toast('Rok mora biti posle starta'); return false; }
    if (!ok) toast('Proveri unete brojeve');
    return ok;
  };
  const sum = () => { const b = $('#onbSum', el); if (!b) return; const sd = $('[data-o="startDate"]', el).value, td = $('[data-o="targetDate"]', el).value;
    const wks = sd && td ? Math.ceil((diffDays(td, sd) + 1) / 7) : 0;
    b.innerHTML = `<b>${wks} nedelja</b> do cilja · prvi trening: ${sd ? DAY[dow(sd)].toLowerCase() + ' ' + fmtDateShort(sd) : '–'}<br><span>Faze: 2 nedelje navikavanja → 2 nedelje izgradnje → pun plan.</span>`; };
  sum(); $$('[data-o]', el).forEach(i => i.addEventListener('input', sum));
  $$('[data-lv]', el).forEach(b => b.onclick = () => { st.level = +b.dataset.lv; save(); haptic(10); $$('[data-lv]', el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#oIcs', el) && ($('#oIcs', el).onclick = makeICS);
  $('#oInst', el) && ($('#oInst', el).onclick = doInstall);
  $('[data-ob]', el) && ($('[data-ob]', el).onclick = () => onboarding(step - 1));
  $('[data-on]', el).onclick = () => {
    if (step === 1 && !readStep1()) return;
    save(); haptic(10);
    if (step < 2) return onboarding(step + 1);
    S.onboarded = true; save(); el.classList.add('out'); setTimeout(() => el.remove(), 300); go('danas');
  };
}

/* ========================= UI OSNOVA ========================= */
let TAB = 'danas', charts = {}, NOANIM = false, showAllWo = false;
const TITLES = { danas: 'Danas', trening: 'Trening', tezina: 'Težina i cilj', koraci: 'Koraci i kalorije', aktivnost: 'Aktivnost', podesavanja: 'Podešavanja' };
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function destroyCharts() { Object.values(charts).forEach(c => c && c.destroy()); charts = {}; }

function go(tab, opts = {}) {
  if (tab === 'trening' && !opts.keepScroll) {
    viewDate = today(); viewSession = null;
    if (S.active && S.active.date === viewDate && S.active.key !== sessionFor(viewDate)) viewSession = S.active.key;
  }
  TAB = tab; destroyCharts();
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#topTitle').textContent = tab === 'danas' ? greeting() : TITLES[tab];
  $('#topTitle').classList.toggle('greet', tab === 'danas');
  const t = today(); const d = parse(t);
  $('#topEyebrow').textContent = `${DAY[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}`;
  const btn = $('#btnSettings');
  btn.innerHTML = tab === 'podesavanja'
    ? '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';
  const v = $('#view');
  NOANIM = !!opts.keepScroll;
  v.innerHTML = `<div class="screen ${NOANIM ? 'noanim' : ''}" id="scr"></div>`;
  ({ danas: renderDanas, trening: renderTrening, tezina: renderTezina, koraci: renderKoraci, aktivnost: renderAktivnost, podesavanja: renderPodesavanja })[tab]($('#scr'), opts);
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
  $('#weightDot').hidden = !weighReminder();
  updateActiveBar();
}
function updateActiveBar() {
  const ab = $('#activeBar'); const on = S.active && S.active.date === today() && TAB !== 'trening';
  ab.hidden = !on; document.body.classList.toggle('has-ab', !!on);
  if (on) ab.innerHTML = `<span class="live">Trening u toku · ${SESSIONS[S.active.key].t}</span><b>${elapsedTxt(S.active)} ›</b>`;
}
setInterval(() => { if (S.active) updateActiveBar(); }, 30000);
$$('.tabbar button').forEach(b => b.addEventListener('click', () => { haptic(8); if (TAB !== b.dataset.tab) go(b.dataset.tab); }));
$('#activeBar').addEventListener('click', () => { haptic(10); go('trening'); });
$('#btnSettings').addEventListener('click', () => go(TAB === 'podesavanja' ? 'danas' : 'podesavanja'));

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2300); }

function openSheet(html, onMount) {
  const sc = $('#scrim'), sh = $('#sheet');
  $('#sheetBody').innerHTML = html;
  if (sh.hidden || sh.classList.contains('out')) history.pushState({ sheet: 1 }, '');
  sc.hidden = false; sh.hidden = false; sc.classList.remove('out'); sh.classList.remove('out');
  sc.onclick = () => closeSheet();
  onMount && onMount($('#sheetBody'));
}
function closeSheet(fromPop) {
  const sc = $('#scrim'), sh = $('#sheet');
  if (sh.hidden || sh.classList.contains('out')) return;
  if (fromPop !== true && history.state && history.state.sheet) { ignorePop = true; history.back(); }
  sc.classList.add('out'); sh.classList.add('out');
  setTimeout(() => { if (!sh.classList.contains('out')) return; sc.hidden = true; sh.hidden = true; sc.classList.remove('out'); sh.classList.remove('out'); $('#sheetBody').innerHTML = ''; }, 230);
}
function confirmSheet({ title, text, ok = 'Potvrdi', danger = false, onOk }) {
  openSheet(`<h2>${title}</h2><p class="lead">${text}</p>
    <div class="row"><button class="btn ghost" data-x>Otkaži</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button></div>`, b => {
    $('[data-x]', b).onclick = () => closeSheet();
    $('[data-ok]', b).onclick = () => { closeSheet(); onOk(); };
  });
}

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17l9-10"/></svg>',
  play: '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9L15.5 12Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7 12a5 5 0 0 1 10 0M12 12l2.4-3.2M8 17h8"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 21V9m0 0-5 5m5-5 5 5M4 3h16"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  install: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 8v7m0 0-3-3m3 3 3-3"/></svg>'
};
function ring(pct, center, sub, cls = '', color) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
  return `<div class="ring ${cls}"><svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="${r}"/>
    <circle class="prg" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${NOANIM ? off : c}" data-off="${off}" ${color ? `style="stroke:${color}"` : ''}/></svg>
    <div class="c"><b class="num">${center}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}
function animateIn(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ring .prg', root).forEach(p => p.setAttribute('stroke-dashoffset', p.dataset.off));
    $$('.bar > i', root).forEach(i => i.style.width = i.dataset.w);
  }));
}

/* ========================= EKRAN: DANAS ========================= */
function renderDanas(el) {
  const t = today(), st = S.settings;
  const key = sessionFor(t), wk = weekNo(t), ph = phaseOf(t), before = t < st.startDate;
  const done = woOn(t);
  const ws = weightStats();
  const rem = weighReminder();
  const dv = S.daily[t] || {};
  const steps = dv.steps || 0, kcal = dv.kcal || 0;
  let html = '<div class="stagger">';

  if (deferredPrompt && !S.ui.installHidden) html += `<div class="banner" style="background:var(--accent-soft)"><div class="ic" style="background:var(--accent);color:var(--accent-ink)">${ICON.install}</div><div><b>Instaliraj aplikaciju</b><span>Radi bez interneta, preko celog ekrana</span></div><button class="btn sm primary" id="bInstall">Instaliraj</button></div>`;
  if (rem) html += reminderBanner(rem);

  // plan info
  html += `<div class="card flat" style="background:var(--card2);padding:14px 16px">
    <div class="row" style="justify-content:space-between">
      <div><div class="small muted" style="font-weight:700">${before ? 'Start plana' : `Nedelja ${wk} od ${totalWeeks()}`}</div>
      <div style="font-weight:800">${before ? fmtDateLong(st.startDate) + ' (sreda)' : `Faza: ${PHASES[ph].name} · ${PHASES[ph].desc}`}</div></div>
      <span class="pill acc">${LEVELS[st.level]}</span></div></div>`;

  // današnji trening
  if (before) {
    const fk = sessionFor(st.startDate), fs = buildSession(fk, st.startDate);
    html += `<div class="card hero"><div class="card-sub">Prvi trening · ${DAY[dow(st.startDate)].toLowerCase()}, ${fmtDateShort(st.startDate)}</div>
      <h2 style="font-size:24px;margin-top:4px">${fs.t}</h2><div class="card-sub" style="margin-top:4px">${fs.sub}</div>
      <div class="wo-meta"><span class="pill neutral">${fs.items.length} vežbi</span><span class="pill neutral">~${fs.est} min</span><span class="pill neutral">Bez skokova</span></div>
      <button class="btn ghost block mt" id="goFirst">Pogledaj vežbe</button></div>`;
  } else if (key) {
    const s = buildSession(key, t);
    const isDone = done.some(w => w.key === key);
    html += `<div class="card hero">
      <div class="wo-hero"><div><div class="card-sub">Današnji trening</div><h2 style="font-size:24px;margin-top:4px">${s.t}</h2>
      <div class="card-sub" style="margin-top:4px">${s.sub}</div></div>
      ${isDone ? `<span class="pill good"><i></i>Urađeno</span>` : (S.active && S.active.key === key ? `<span class="pill warn live">U toku</span>` : '')}</div>
      <div class="wo-meta"><span class="pill neutral">${s.items.length} vežbi</span><span class="pill neutral">~${s.est} min</span>${noJumps(t) ? '<span class="pill neutral">Bez skokova</span>' : ''}</div>
      <button class="btn primary block mt" id="goWo">${isDone ? 'Pogledaj trening' : `${ICON.play} ${S.active && S.active.key === key ? 'Nastavi trening' : 'Počni trening'}`}</button></div>`;
  } else {
    html += `<div class="card hero"><div class="card-sub">Današnji plan</div><h2 style="font-size:24px;margin-top:4px">Dan odmora</h2>
      <p class="muted" style="margin:6px 0 0;font-weight:500">Odmor je deo napretka. Prošetaj i skupi korake – cilj je ${fmt(st.stepsGoal)}.</p>
      <button class="btn ghost block mt" id="goMob">Opciono: istezanje i mobilnost</button></div>`;
  }

  // koraci i kalorije
  const sp = steps / st.stepsGoal, kp = kcal / st.kcalGoal;
  html += `<div class="grid2">
    <div class="card stat" data-go="koraci"><div class="today-tile">${ring(sp, fmt(Math.round(sp * 100)) + '%', '', 'sm', sp >= 1 ? 'var(--good)' : null)}
      <div class="grow"><div class="lbl">Koraci</div><div class="val num" style="font-size:20px">${fmt(steps)}</div><div class="hint">cilj ${fmt(st.stepsGoal)}</div></div></div></div>
    <div class="card stat" data-go="koraci"><div class="today-tile">${ring(Math.min(kp, 1), fmt(Math.round(kp * 100)) + '%', '', 'sm', kcal > st.kcalGoal ? 'var(--warn)' : kcal ? 'var(--good)' : null)}
      <div class="grow"><div class="lbl">Kalorije</div><div class="val num" style="font-size:20px">${fmt(kcal)}</div><div class="hint">do ${fmt(st.kcalGoal)}</div></div></div></div></div>
  <button class="btn ghost block" id="quickDay" style="margin-bottom:14px">${ICON.plus} Unesi korake i kalorije za danas</button>`;

  // težina
  if (ws) {
    const sts = statusOf(ws.vsPlan);
    html += `<div class="card" data-go="tezina"><div class="card-head"><h2>Težina</h2><span class="pill ${sts.cls}"><i></i>${sts.txt}</span></div>
      <div class="row" style="align-items:flex-end;justify-content:space-between"><div><span style="font-size:36px;font-weight:800;letter-spacing:-.03em" class="num">${fmt(ws.cur, 1)}</span><span class="muted" style="font-weight:700"> kg</span></div>
      <div style="text-align:right"><div class="small muted" style="font-weight:700">Skinuto</div><div style="font-weight:800;color:var(--good)" class="num">${fmtSigned(-ws.lost, 1)} kg</div></div></div>
      <div class="bar mt"><i data-w="${(ws.pct * 100).toFixed(1)}%"></i></div>
      <div class="row small muted" style="justify-content:space-between;margin-top:8px;font-weight:700"><span>${fmt(ws.sw, 1)} kg</span><span>${fmt(ws.pct * 100, 0)}% puta</span><span>${fmt(ws.tw, 0)} kg</span></div></div>`;
  }

  // nedeljni izveštaj nedeljom (tekuća) i ponedeljkom (prošla nedelja)
  if (!before && (dow(t) === 0 || dow(t) === 1)) {
    const m = dow(t) === 0 ? monday(t) : addDays(monday(t), -7);
    if (addDays(m, 6) >= st.startDate) html += reportCard(weekReport(m), dow(t) === 0 ? 'Nedeljni izveštaj' : 'Prošla nedelja');
  }
  // nedelja
  html += `<div class="card"><div class="card-head"><h2>Ova nedelja</h2><span class="card-sub">${weekSummary(t)}</span></div>${weekStrip(t)}</div>`;
  html += `<div class="card tip"><div class="tip-ic">${BICON.bulb}</div><div><div class="card-sub" style="font-weight:800;color:var(--accent)">Savet dana</div><p>${tipToday()}</p></div></div>`;
  html += '</div>';
  el.innerHTML = html;
  animateIn(el);
  $('#goWo', el) && ($('#goWo', el).onclick = () => go('trening'));
  $('#goFirst', el) && ($('#goFirst', el).onclick = () => { go('trening'); viewDate = st.startDate; viewSession = null; go('trening', { keepScroll: true }); });
  $('#goMob', el) && ($('#goMob', el).onclick = () => go('trening', { session: 'mobility' }));
  $('#quickDay', el).onclick = () => dailySheet(t);
  $$('[data-go]', el).forEach(c => c.onclick = () => go(c.dataset.go));
  $('#bInstall', el) && ($('#bInstall', el).onclick = doInstall);
  bindReminder(el);
}
function reminderBanner(rem) {
  const map = {
    start: ['Unesi početnu težinu', `Start plana: ${fmtDate(S.settings.startDate)} ujutru`],
    sunday: ['Nedeljno merenje', 'Izmeri se ujutru, pre doručka'],
    missed: ['Propušteno merenje', 'Nisi uneo težinu od nedelje']
  }[rem];
  return `<div class="banner"><div class="ic">${ICON.bell}</div><div><b>${map[0]}</b><span>${map[1]}</span></div><button class="btn sm primary" data-weigh>Unesi</button></div>`;
}
function bindReminder(el) { $$('[data-weigh]', el).forEach(b => b.onclick = () => weightSheet()); }
function weekSummary(t) {
  const m = monday(t); let plan = 0, done = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(m, i); const k = sessionFor(d); if (k && d >= S.settings.startDate) { plan++; if (woOn(d).length) done++; } }
  return `${done} / ${plan} treninga`;
}
function weekStrip(t, selected) {
  const m = monday(t); let h = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(m, i), k = sessionFor(d), dn = woOn(d).length > 0, isT = d === t;
    const pre = d < S.settings.startDate;
    const bg = dn ? 'var(--good)' : isT ? 'var(--accent-soft)' : 'var(--card2)';
    const col = dn ? '#fff' : isT ? 'var(--accent)' : k && !pre ? 'var(--text)' : 'var(--faint)';
    h += `<div style="text-align:center"><div class="small muted" style="font-weight:700;margin-bottom:6px">${DAY_S[dow(d)]}</div>
      <div style="height:40px;border-radius:12px;display:grid;place-items:center;background:${bg};color:${col};font-weight:800;font-size:14px;${isT ? 'outline:2px solid var(--accent);outline-offset:-2px' : ''}">
      ${dn ? '<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12.5 10 17l9-10"/></svg>' : pre ? '·' : k ? parse(d).getDate() : '–'}</div></div>`;
  }
  return h + '</div>';
}

/* ========================= EKRAN: TRENING ========================= */
let viewSession = null, viewDate = null;
function renderTrening(el, opts = {}) {
  const t = today();
  if (opts.session) { viewSession = opts.session; viewDate = t; }
  if (!viewDate) viewDate = t;
  const key = viewSession || sessionFor(viewDate);
  const m = monday(t);
  let h = '<div class="daychips">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(m, i), k = sessionFor(d);
    const on = d === viewDate;
    h += `<button class="daychip ${on ? 'on' : ''} ${k ? '' : 'rest'} ${d === t ? 'today' : ''}" data-d="${d}">
      ${woOn(d).length ? '<span class="done"></span>' : ''}<b>${DAY_S[dow(d)]}</b><small>${k ? short(k) : 'odmor'}</small></button>`;
  }
  h += '</div>';

  if (!key) {
    h += `<div class="card"><div class="empty"><div class="ico">${ICON.moon}</div><h3>Dan odmora</h3>
      <p style="margin:0 0 16px">Prema planu za ${DAY[dow(viewDate)].toLowerCase()} nema treninga. Šetnja i istezanje su odličan izbor.</p>
      <button class="btn primary block" id="doMob">Uradi istezanje i mobilnost</button></div></div>`;
    h += planOverview(t);
    el.innerHTML = h;
    bindDayChips(el);
    $('#doMob', el).onclick = () => { viewSession = 'mobility'; go('trening', { keepScroll: true }); };
    return;
  }

  const s = buildSession(key, t);
  const act = S.active && S.active.key === key && S.active.date === t ? S.active : null;
  const checks = act ? act.checks : {};
  const totalSets = s.items.reduce((a, x) => a + x.sets, 0);
  const doneSets = Object.values(checks).reduce((a, arr) => a + arr.filter(Boolean).length, 0);
  const doneToday = woOn(t).some(w => w.key === key);

  h += `<div class="card hero"><div class="wo-hero"><div><div class="card-sub">${viewDate === t ? 'Današnji trening' : DAY[dow(viewDate)]}</div>
    <h2 style="margin-top:4px">${s.t}</h2><div class="card-sub" style="margin-top:4px">${s.sub}</div></div>
    ${ring(totalSets ? doneSets / totalSets : 0, `${doneSets}/${totalSets}`, 'serija', 'sm')}</div>
    <div class="wo-meta"><span class="pill neutral">${s.items.length} vežbi</span><span class="pill neutral">~${s.est} min</span>
    <span class="pill acc">${LEVELS[S.settings.level]}</span>${act ? `<span class="pill warn live" id="elapsed">${elapsedTxt(act)}</span>` : ''}${doneToday ? '<span class="pill good"><i></i>Urađen danas</span>' : ''}</div>
    ${noJumps(t) && s.items.some(x => x.swapped) ? '<div class="small muted mt" style="font-weight:600">Prvi mesec: vežbe sa skokovima su zamenjene verzijama bez skokova.</div>' : ''}</div>`;

  s.items.forEach((x, i) => {
    const arr = checks[i] || [];
    const complete = arr.filter(Boolean).length === x.sets;
    h += `<div class="ex ${complete ? 'complete' : ''}" data-i="${i}"><div class="ex-top"><div class="ex-idx">${complete ? '✓' : i + 1}</div>
      <div style="flex:1;min-width:0"><div class="ex-name">${x.n}</div><div class="ex-dose num">${doseText(x)}</div>
      ${x.note ? `<div class="ex-note">${x.note}</div>` : ''}${x.swapped ? `<span class="ex-swap">Umesto: ${x.swapped}</span>` : ''}</div></div>
      <div class="sets">${Array.from({ length: x.sets }, (_, j) => `<button class="set ${arr[j] ? 'on' : ''}" data-j="${j}" aria-label="Serija ${j + 1}">${arr[j] ? ICON.check : ''}${x.sets > 1 ? 'S' + (j + 1) : 'Urađeno'}</button>`).join('')}</div>
      ${x.w ? loadRow(x, act) : ''}
      <div class="ex-actions"><a class="btn ghost sm yt" href="${ytUrl(x.yt)}" target="_blank" rel="noopener">${ICON.yt} Snimak</a>
      ${x.secs ? `<button class="btn primary sm" data-run>${ICON.play} Start ${x.secs >= 120 ? Math.round(x.secs / 60) + ' min' : x.secs + ' s'}</button>`
        : x.noRest ? '' : `<button class="btn ghost sm" data-rest>Odmor ${S.settings.rest} s</button>`}</div></div>`;
  });
  h += `<div class="sticky-cta"><button class="btn primary" id="finish">${ICON.flag} Završi trening</button></div>`;
  h += planOverview(t);
  el.innerHTML = h;
  animateIn(el);
  bindDayChips(el);

  $$('.ex', el).forEach(card => {
    const i = +card.dataset.i, x = s.items[i];
    $$('.set', card).forEach(b => b.onclick = () => toggleSet(s, i, +b.dataset.j));
    const rb = $('[data-rest]', card); if (rb) rb.onclick = () => { unlockAudio(); startTimer(S.settings.rest, nextLabel(s, i)); };
    const run = $('[data-run]', card); if (run) run.onclick = () => runTimed(s, i);
    const li = $('[data-load]', card);
    if (li) {
      const st = loadStep(x.id);
      const setL = v => { ensureActive(s, () => { S.active.loads = S.active.loads || {}; if (isNaN(v) || v <= 0) delete S.active.loads[x.id]; else S.active.loads[x.id] = Math.round(v * 2) / 2; save(); }); };
      $$('[data-l]', card).forEach(b => b.onclick = () => { const v = Math.max(0, (parseNum(li.value) || 0) + st * +b.dataset.l); li.value = fmt(v, v % 1 ? 1 : 0); haptic(8); setL(v); });
      li.onchange = () => setL(parseNum(li.value));
      li.onfocus = () => li.select();
    }
  });
  $('#finish', el).onclick = () => finishSheet(s);
  if (act) tickElapsed();
}
const short = k => ({ fullA: 'telo A', fullB: 'telo B', cardio: 'kondicija', chest: 'grudi', legs: 'noge', back: 'leđa', shoulders: 'ramena', full: 'celo telo', mobility: 'istezanje' })[k];
function bindDayChips(el) {
  $$('.daychip', el).forEach(b => b.onclick = () => { viewDate = b.dataset.d; viewSession = sessionFor(viewDate); go('trening', { keepScroll: true }); });
}
function planOverview(t) {
  const ph = phaseOf(t);
  const rows = [1, 2, 3, 4, 5, 6, 0].map(d => {
    const k = PHASES[ph].days[d];
    return `<div class="list-row"><div><div class="t">${DAY[d]}</div><div class="s">${k ? SESSIONS[k].sub : 'Odmor, šetnja'}</div></div><span class="pill ${k ? 'acc' : 'neutral'}">${k ? SESSIONS[k].t : 'Odmor'}</span></div>`;
  }).join('');
  return `<div class="section-title">Plan – faza ${ph}: ${PHASES[ph].name}</div><div class="card">${rows}
    <div class="small muted mt" style="font-weight:600">Nedelje 1–2: 3 treninga · 3–4: četiri treninga · od 5. nedelje pun plan. Prve 4 nedelje bez skokova.</div></div>`;
}
function nextLabel(s, i) {
  const x = s.items[i]; const arr = (S.active && S.active.checks[i]) || [];
  const n = arr.filter(Boolean).length;
  if (n < x.sets) return `Sledi: serija ${n + 1} – ${x.n}`;
  const nx = s.items[i + 1]; return nx ? `Sledi: ${nx.n}` : 'Poslednja serija!';
}
function ensureActive(s, cb) {
  const t = today();
  if (S.active && S.active.date === t && S.active.key === s.key) return cb();
  const has = S.active && Object.values(S.active.checks || {}).some(a => a.some(Boolean));
  const start = () => { S.active = { key: s.key, date: t, startedAt: Date.now(), checks: {} }; save(); requestWake(); cb(); };
  if (has && S.active.date === t) confirmSheet({ title: 'Započeti drugi trening?', text: `Trening „${SESSIONS[S.active.key].t}“ je u toku. Napredak u njemu biće odbačen.`, ok: 'Započni', onOk: start });
  else start();
}
function markSet(s, i, j, val) { const a = S.active; a.checks[i] = a.checks[i] || Array(s.items[i].sets).fill(false); a.checks[i][j] = val; save(); }
const allDoneOf = s => s.items.every((x, k) => ((S.active && S.active.checks[k]) || []).filter(Boolean).length === x.sets);
function afterSet(s, i, on) {
  const allDone = allDoneOf(s);
  go('trening', { keepScroll: true });
  if (on && !s.items[i].noRest && !allDone) startTimer(S.settings.rest, nextLabel(s, i));
  if (allDone) setTimeout(() => finishSheet(s), 400);
}
function toggleSet(s, i, j) {
  unlockAudio();
  ensureActive(s, () => {
    const v = !((S.active.checks[i] || [])[j]);
    markSet(s, i, j, v); if (v) haptic(25);
    afterSet(s, i, v);
  });
}
// vežbe na vreme: 3 s pripreme -> vežba -> automatski odmor
function runTimed(s, i) {
  unlockAudio();
  ensureActive(s, () => {
    const x = s.items[i], arr = S.active.checks[i] || [];
    const j = [...Array(x.sets).keys()].find(k => !arr[k]);
    if (j == null) return toast('Sve serije su urađene');
    const lbl = `${x.n}${x.sets > 1 ? ` · serija ${j + 1}/${x.sets}` : ''}`;
    startTimer(3, lbl, 'prep', () => startTimer(x.secs, lbl, 'work', () => { markSet(s, i, j, true); afterSet(s, i, true); }));
  });
}
// tegovi
const loadStep = id => /^bar_|hip_thrust/.test(id) ? 2.5 : 1;
function suggestLoad(id) {
  const h = S.loads[id] || []; if (h.length < 2) return null;
  const [a, b] = h.slice(-2);
  return a.full && b.full && a.kg === b.kg ? b.kg + loadStep(id) : null;
}
function loadRow(x, act) {
  const h = S.loads[x.id] || [], last = h[h.length - 1];
  const cur = act && act.loads && act.loads[x.id] != null ? act.loads[x.id] : last ? last.kg : null;
  const sug = suggestLoad(x.id);
  return `<div class="load"><div class="load-info"><div class="lbl">Teg</div><div class="s">${last ? `Prošli put ${fmt(last.kg, last.kg % 1 ? 1 : 0)} kg · ${fmtDateShort(last.date)}` : 'Upiši težinu koju koristiš'}</div>
    ${sug ? `<div class="sug">▲ Probaj ${fmt(sug, sug % 1 ? 1 : 0)} kg</div>` : ''}</div>
    <div class="load-step"><button data-l="-1" aria-label="Manje">−</button><input class="num" data-load inputmode="decimal" placeholder="kg" value="${cur != null ? fmt(cur, cur % 1 ? 1 : 0) : ''}"><button data-l="1" aria-label="Više">+</button></div></div>`;
}
function saveLoads(s, act, date) {
  if (!act || !act.loads) return;
  s.items.forEach((x, i) => {
    const kg = act.loads[x.id]; if (!x.w || kg == null) return;
    const full = ((act.checks[i] || []).filter(Boolean).length === x.sets);
    const h = (S.loads[x.id] = (S.loads[x.id] || []).filter(e => e.date !== date));
    h.push({ date, kg, full }); h.sort((p, q) => p.date.localeCompare(q.date));
    if (h.length > 40) h.splice(0, h.length - 40);
  });
}
const haptic = p => { if (S.settings.vibrate && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} };
const elapsedTxt = a => { const m = Math.floor((Date.now() - a.startedAt) / 60000); return `${m} min`; };
let elT;
function tickElapsed() { clearInterval(elT); elT = setInterval(() => { const e = $('#elapsed'); if (!e || !S.active) return clearInterval(elT); e.textContent = elapsedTxt(S.active); }, 15000); }

function finishSheet(s) {
  const t = today();
  const act = S.active && S.active.key === s.key && S.active.date === t ? S.active : null;
  const doneSets = act ? Object.values(act.checks).reduce((a, arr) => a + arr.filter(Boolean).length, 0) : 0;
  const total = s.items.reduce((a, x) => a + x.sets, 0);
  const mins = act ? clamp(Math.round((Date.now() - act.startedAt) / 60000), 1, 240) : s.est;
  openSheet(`<h2>Završi trening</h2><p class="lead">${s.t} · urađeno ${doneSets} od ${total} serija</p>
    <label class="field"><span>Trajanje treninga (minuta)</span>
    <div class="stepper"><button class="btn ghost" data-m="-5">−</button><input class="input big num" id="fMin" inputmode="numeric" value="${mins}"><button class="btn ghost" data-m="5">+</button></div></label>
    <label class="field"><span>Datum</span><input class="input" type="date" id="fDate" value="${t}" max="${t}"></label>
    <button class="btn primary block" id="fSave">${ICON.check} Sačuvaj trening</button>
    <button class="btn ghost block mt" id="fCancel">Nastavi trening</button>`, b => {
    $$('[data-m]', b).forEach(x => x.onclick = () => { const i = $('#fMin', b); i.value = clamp((parseInt(i.value) || 0) + +x.dataset.m, 1, 300); });
    $('#fCancel', b).onclick = () => closeSheet();
    $('#fSave', b).onclick = () => {
      const minutes = clamp(parseInt($('#fMin', b).value) || 0, 1, 300);
      const date = $('#fDate', b).value || t;
      S.workouts.push({ id: uid(), date, key: s.key, title: s.t, minutes, sets: doneSets, total });
      saveLoads(s, act, date);
      if (act) S.active = null;
      save(); releaseWake(); stopTimer(); closeSheet();
      setTimeout(() => celebrate(s, minutes), 260);
    };
  });
}
function celebrate(s, minutes) {
  const w = sumMinutes(monday(today()), today());
  const nb = checkBadges();
  openSheet(`<div class="empty" style="padding-top:6px"><div class="ico" style="width:84px;height:84px;border-radius:28px;background:var(--good-soft);color:var(--good)">
    <svg viewBox="0 0 24 24" style="width:42px;height:42px"><path d="M5 12.5 10 17l9-10"/></svg></div>
    <h3 style="font-size:24px">Bravo${S.settings.name ? ', ' + S.settings.name : ''}!</h3><p style="margin:0">„${s.t}“ je sačuvan – ${minutes} min.</p></div>
    <div class="grid2"><div class="mini"><div class="lbl">Ove nedelje</div><div class="val num">${w.n} tren. · ${w.min} min</div></div>
    <div class="mini"><div class="lbl">Niz po planu</div><div class="val num">${streak()} dana</div></div></div>
    ${nb.length ? `<div class="card flat" style="background:var(--card);display:flex;gap:12px;align-items:center;margin-bottom:14px">${badgeIc(nb[0], false)}<div><div class="small" style="font-weight:800;color:var(--accent)">${nb.length > 1 ? `${nb.length} nova dostignuća` : 'Novo dostignuće'}</div><b>${nb.map(x => x.t).join(', ')}</b></div></div>` : ''}
    <button class="btn primary block" id="ok">Super</button>`, b => { $('#ok', b).onclick = () => { closeSheet(); go('aktivnost'); }; });
  confetti(); haptic([30, 60, 30]);
}

/* ----- tajmer za odmor ----- */
let T = { end: 0, dur: 60, paused: false, left: 0, raf: 0, label: '' };
let audioCtx;
function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
function tone(freq, at, dur, vol = .45) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + at;
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + .05);
}
function beep(kind = 'end') {
  if (!S.settings.sound || !audioCtx) return;
  if (kind === 'tick') tone(660, 0, .09, .3);
  else if (kind === 'go') tone(1320, 0, .4);
  else { tone(880, 0, .18); tone(880, .22, .18); tone(1320, .44, .5); }
}
const PRESETS = [45, 60, 90, 120];
function startTimer(sec, label, mode = 'rest', cb = null) {
  clearTimeout(T.to); cancelAnimationFrame(T.raf);
  T = { end: Date.now() + sec * 1000, dur: sec, paused: false, left: sec * 1000, label: label || '', mode, cb, fired: false, lastSec: null };
  const el = $('#timer'); el.hidden = false; el.className = 'timer mode-' + mode;
  $('#timerTitle').textContent = { rest: 'Odmor', prep: 'Spremi se', work: 'Vežba' }[mode];
  $('#timerSkip').textContent = { rest: 'Preskoči', prep: 'Kreni odmah', work: 'Gotovo' }[mode];
  $('#timerPresets').hidden = mode !== 'rest';
  $('#timerNext').textContent = T.label;
  $('#timerPause').textContent = 'Pauza';
  $('#timerPresets').innerHTML = PRESETS.map(p => `<button data-p="${p}" class="${p === sec ? 'on' : ''}">${p} s</button>`).join('');
  $$('#timerPresets button').forEach(b => b.onclick = () => { S.settings.rest = +b.dataset.p; save(); startTimer(+b.dataset.p, T.label); });
  haptic(10);
  armTimeout(); cancelAnimationFrame(T.raf); loop();
}
function armTimeout() { clearTimeout(T.to); if (!T.paused) T.to = setTimeout(() => { if (!T.paused && !T.fired && !$('#timer').hidden && Date.now() >= T.end - 100) timerDone(); }, Math.max(0, T.end - Date.now())); }
function loop() {
  const left = T.paused ? T.left : Math.max(0, T.end - Date.now());
  const s = Math.ceil(left / 1000);
  $('#timerNum').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const c = 2 * Math.PI * 52; const arc = $('#timerArc');
  arc.style.strokeDasharray = c; arc.style.strokeDashoffset = c * (1 - left / (T.dur * 1000));
  if (!T.paused && s >= 1 && s <= 3 && s !== T.lastSec) { T.lastSec = s; beep('tick'); if (T.mode !== 'rest') haptic(15); }
  if (left <= 0 && !T.paused) return timerDone();
  T.raf = requestAnimationFrame(loop);
}
function timerDone() {
  if (T.fired) return; T.fired = true; cancelAnimationFrame(T.raf); clearTimeout(T.to);
  if (T.mode !== 'rest') { beep(T.mode === 'work' ? 'end' : 'go'); haptic(T.mode === 'work' ? [200, 80, 200] : 120); const cb = T.cb; stopTimer(); cb && cb(); return; }
  $('#timer').classList.add('done');
  beep();
  if (S.settings.vibrate && navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(r => r.showNotification('Odmor je završen', { body: T.label || 'Sledeća serija!', icon: 'icons/icon-192.png', vibrate: [300, 120, 300] })).catch(() => {});
  }
  setTimeout(() => { if (T.fired && $('#timer').classList.contains('done')) stopTimer(); }, 2600);
}
function stopTimer() { cancelAnimationFrame(T.raf); clearTimeout(T.to); $('#timer').hidden = true; }
$('#timerClose').onclick = stopTimer;
$('#timerSkip').onclick = () => { if (T.mode === 'rest' || T.fired) return stopTimer(); const cb = T.cb; T.fired = true; stopTimer(); if (T.mode === 'prep') beep('go'); cb && cb(); };
$('#timerPlus').onclick = () => { if (T.fired) { T.end = Date.now() + 15000; T.dur = 15; } else if (T.paused) T.left += 15000; else T.end += 15000; if (!T.fired) T.dur += 15; T.fired = false; $('#timer').classList.remove('done'); armTimeout(); cancelAnimationFrame(T.raf); loop(); };
$('#timerPause').onclick = () => {
  if (T.fired) return;
  if (T.paused) { T.end = Date.now() + T.left; T.paused = false; $('#timerPause').textContent = 'Pauza'; armTimeout(); }
  else { T.left = Math.max(0, T.end - Date.now()); T.paused = true; $('#timerPause').textContent = 'Nastavi'; }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#timer').hidden && !T.fired) { cancelAnimationFrame(T.raf); loop(); } if (!document.hidden && S.active) requestWake(); });

let wakeLock = null;
async function requestWake() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) {} }
function releaseWake() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }

/* ========================= EKRAN: TEŽINA ========================= */
function renderTezina(el) {
  const ws = weightStats(); const st = S.settings;
  const rem = weighReminder();
  let h = '<div class="stagger">';
  if (rem && rem !== 'start') h += reminderBanner(rem);
  if (!ws) {
    h += `<div class="card hero"><div class="empty"><div class="ico">${ICON.scale}</div><h3>Početna težina</h3>
      <p style="margin:0 0 4px">Izmeri se u sredu, ${fmtDateLong(st.startDate)} ujutru – pre doručka, posle toaleta.</p>
      <p class="small" style="margin:0 0 16px">Posle toga merenje je jednom nedeljno, nedeljom ujutru.</p>
      <button class="btn primary block" data-weigh>${ICON.plus} Unesi početnu težinu</button></div></div>`;
    h += `<div class="card"><div class="card-head"><h2>Tvoj cilj</h2></div>
      <div class="grid3 mb0"><div class="mini"><div class="lbl">Cilj</div><div class="val num">${fmt(st.targetWeight)} kg</div></div>
      <div class="mini"><div class="lbl">Rok</div><div class="val num">${fmtDateShort(st.targetDate)}</div></div>
      <div class="mini"><div class="lbl">Nedelja</div><div class="val num">${totalWeeks()}</div></div></div></div>`;
    el.innerHTML = h + '</div>'; bindReminder(el); return;
  }
  const sts = statusOf(ws.vsPlan);
  const bmi = BMI(ws.cur);
  h += `<div class="card hero"><div class="hero-top">${ring(ws.pct, fmt(ws.pct * 100, 0) + '%', 'puta do cilja')}
    <div style="min-width:0"><div class="card-sub">Trenutna težina</div><div class="big num">${fmt(ws.cur, 1)}<small>kg</small></div>
    <div class="small muted" style="font-weight:600;margin-top:4px">${fmtDateLong(ws.last.date)}</div>
    <span class="pill ${sts.cls}" style="margin-top:10px"><i></i>${sts.txt}</span></div></div>
    <div class="kpi-row"><div><div class="lbl">Skinuto</div><div class="val num" style="color:var(--good)">${fmt(ws.lost, 1)} kg</div></div>
    <div><div class="lbl">Ostalo</div><div class="val num">${fmt(Math.max(0, ws.left), 1)} kg</div></div>
    <div><div class="lbl">Plan danas</div><div class="val num" style="color:var(--plan)">${fmt(planAt(today()), 1)} kg</div></div></div>
    <button class="btn primary block mt" data-weigh>${ICON.plus} Unesi merenje</button></div>`;

  // grafikon
  h += `<div class="card"><div class="card-head"><h2>Napredak</h2><button class="icon-btn sm" id="zReset" aria-label="Poništi zum">${ICON.reset}</button></div>
    <div class="chart-tools"><div class="seg" id="wPer">${[['1m', '1 mes'], ['3m', '3 mes'], ['all', 'Sve']].map(([k, l]) => `<button data-k="${k}" class="${S.ui.weightPeriod === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="chart-wrap"><canvas id="wChart"></canvas></div>
    <div class="legend"><span><i></i>Težina</span><span><i class="plan"></i>Plan</span><span><i class="goal"></i>Cilj ${fmt(st.targetWeight)} kg</span></div>
    <div class="small muted" style="margin-top:8px;font-weight:600">Dodirni tačku za detalje · dva prsta za zum · prevuci za pomeranje</div></div>`;

  // kartice
  const etaTxt = ws.left <= 0 ? 'Cilj dostignut!' : ws.eta ? fmtDateLong(ws.eta) : 'Potrebno još merenja';
  const etaCls = ws.eta && ws.left > 0 ? (ws.eta <= st.targetDate ? 'var(--good)' : 'var(--warn)') : 'var(--text)';
  h += `<div class="grid2">
    <div class="card stat"><div class="lbl">BMI</div><div class="val num">${fmt(bmi, 1)}</div><div class="hint">${bmiCat(bmi)} · start ${fmt(BMI(ws.sw), 1)}</div></div>
    <div class="card stat"><div class="lbl">Do cilja</div><div class="val num">${fmt(Math.ceil(ws.weeksLeft))}<small>ned.</small></div><div class="hint">${fmt(ws.daysLeft)} dana · ${fmtDateShort(st.targetDate)}</div></div>
    <div class="card stat"><div class="lbl">Potreban tempo</div><div class="val num">${ws.needRate != null && ws.left > 0 ? fmt(ws.needRate, 2) : '–'}<small>kg/ned.</small></div><div class="hint">da stigneš do roka</div></div>
    <div class="card stat"><div class="lbl">Tvoj tempo</div><div class="val num" style="color:${ws.rate != null && ws.needRate != null && ws.rate >= ws.needRate ? 'var(--good)' : 'var(--text)'}">${ws.rate != null ? fmt(ws.rate, 2) : '–'}<small>kg/ned.</small></div><div class="hint">${ws.rate != null ? 'prosek poslednjih merenja' : 'posle 2 merenja'}</div></div></div>
  ${(() => { const wl = ws.w.filter(e => e.waist); if (!wl.length) return `<div class="card stat" data-weigh style="cursor:pointer"><div class="lbl">Obim struka</div><div class="val" style="font-size:18px">Dodaj uz sledeće merenje</div><div class="hint">Struk je odličan pokazatelj gubitka masti – meri u visini pupka.</div></div>`;
    const f0 = wl[0].waist, fl = wl[wl.length - 1].waist, d = fl - f0;
    return `<div class="card stat"><div class="row" style="justify-content:space-between"><div><div class="lbl">Obim struka</div><div class="val num">${fmt(fl, fl % 1 ? 1 : 0)}<small>cm</small></div></div>
      <div style="text-align:right"><div class="lbl" style="justify-content:flex-end">Od prvog merenja</div><div class="val num" style="font-size:20px;color:${d < 0 ? 'var(--good)' : d > 0 ? 'var(--bad)' : 'var(--text)'}">${fmtSigned(d)} cm</div></div></div>
      <div class="hint">${wl.length} merenja · poslednje ${fmtDateLong(wl[wl.length - 1].date)}</div></div>`; })()}
  <div class="card stat"><div class="lbl">${ICON.flag.replace('<svg', '<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2"')}Procena dostizanja cilja po trenutnom tempu</div>
    <div class="val" style="color:${etaCls}">${etaTxt}</div>
    <div class="hint">${ws.eta && ws.left > 0 ? (ws.eta <= st.targetDate ? `${fmt(diffDays(st.targetDate, ws.eta))} dana pre roka` : `${fmt(diffDays(ws.eta, st.targetDate))} dana posle roka – ubrzaj malo`) : 'Plan: ' + fmt(st.targetWeight) + ' kg do ' + fmtDateLong(st.targetDate)}</div>
    <div class="bar mt"><i data-w="${(ws.pct * 100).toFixed(1)}%"></i></div>
    <div class="row small muted" style="justify-content:space-between;margin-top:8px;font-weight:700"><span>Start ${fmt(ws.sw, 1)}</span><span>Cilj ${fmt(ws.tw, 1)}</span></div></div>`;

  // tabela
  const rows = [...ws.w].reverse().map((e, idx, arr) => {
    const prev = arr[idx + 1]; const ch = prev ? e.kg - prev.kg : null; const tot = e.kg - ws.sw; const p = planAt(e.date);
    const vs = e.kg - p;
    return `<tr class="tap" data-id="${e.id}"><td>${fmtDateTbl(e.date)}</td><td><b>${fmt(e.kg, 1)}</b>${e.waist ? `<div class="small mut" style="font-size:11px">${fmt(e.waist, e.waist % 1 ? 1 : 0)} cm</div>` : ''}</td>
      <td class="${ch == null ? 'mut' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'mut'}">${ch == null ? '–' : fmtSigned(ch)}</td>
      <td class="${tot > 0 ? 'up' : tot < 0 ? 'down' : 'mut'}">${fmtSigned(tot)}</td>
      <td><span style="color:var(--plan)">${fmt(p, 1)}</span><div class="small ${vs > 0.3 ? 'up' : vs < -0.3 ? 'down' : 'mut'}" style="font-size:11px">${fmtSigned(vs)}</div></td></tr>`;
  }).join('');
  h += `<div class="section-title">Sva merenja (${ws.w.length})</div><div class="card"><div class="table-scroll"><table class="table num">
    <thead><tr><th>Datum</th><th>kg</th><th>Prom.</th><th>Ukup.</th><th>Plan</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="small muted mt" style="font-weight:600">Dodirni red za izmenu ili brisanje.</div></div>`;
  el.innerHTML = h + '</div>';
  animateIn(el);
  bindReminder(el);
  $$('#wPer button', el).forEach(b => b.onclick = () => { S.ui.weightPeriod = b.dataset.k; save(); $$('#wPer button', el).forEach(x => x.classList.toggle('on', x === b)); applyWeightRange(); });
  $('#zReset', el).onclick = () => { charts.w && charts.w.resetZoom('none'); applyWeightRange(); };
  $$('tr.tap', el).forEach(r => r.onclick = () => weightSheet(S.weights.find(x => x.id === r.dataset.id)));
  drawWeightChart();
}

function weightRange() {
  const ws = weightStats(); const st = S.settings;
  const end = [today(), ws.last.date].sort().pop();
  const per = S.ui.weightPeriod;
  let x0, x1;
  if (per === 'all') { x0 = dnum(st.startDate) - 4; x1 = dnum(st.targetDate) + 6; }
  else { const days = per === '1m' ? 31 : 92; x1 = dnum(end) + (per === '1m' ? 3 : 7); x0 = x1 - days; }
  // y opseg
  const vals = ws.w.filter(e => dnum(e.date) >= x0 && dnum(e.date) <= x1).map(e => e.kg);
  vals.push(planAt(fromDnum(Math.max(x0, dnum(st.startDate)))), planAt(fromDnum(Math.min(x1, dnum(st.targetDate)))));
  if (per === 'all') vals.push(st.targetWeight, ws.sw);
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const pad = Math.max(1, (y1 - y0) * 0.12);
  return { x0, x1, y0: Math.floor(y0 - pad), y1: Math.ceil(y1 + pad) };
}
function applyWeightRange() {
  const c = charts.w; if (!c) return; const r = weightRange();
  c.options.scales.x.min = r.x0; c.options.scales.x.max = r.x1; c.options.scales.y.min = r.y0; c.options.scales.y.max = r.y1;
  c.update();
}
// dodatak: oznake na kraju linija (poslednja vrednost i cilj)
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    const ds = chart.data.datasets[0].data; if (!ds.length) return;
    const last = ds[ds.length - 1]; const px = x.getPixelForValue(last.x), py = y.getPixelForValue(last.y);
    if (px < a.left || px > a.right) return;
    const txt = fmt(last.y, 1) + ' kg';
    ctx.save(); ctx.font = '800 12px Manrope, sans-serif';
    const w = ctx.measureText(txt).width + 14; let bx = Math.min(px - w / 2, a.right - w); bx = Math.max(bx, a.left);
    const by = py - 34 < a.top ? py + 12 : py - 34;
    ctx.fillStyle = cssVar('--accent'); ctx.beginPath(); ctx.roundRect(bx, by, w, 22, 8); ctx.fill();
    ctx.fillStyle = cssVar('--accent-ink'); ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 7, by + 11);
    ctx.restore();
  }
};
function drawWeightChart() {
  const ws = weightStats(); const st = S.settings; const cv = $('#wChart'); if (!cv || !ws) return;
  const acc = cssVar('--accent'), plan = cssVar('--plan'), goal = cssVar('--goal'), muted = cssVar('--muted'), line = cssVar('--line'), card = cssVar('--card'), text = cssVar('--text');
  const x0 = dnum(st.startDate), x1 = dnum(st.targetDate);
  const planPts = []; for (let d = x0; d < x1; d += 7) planPts.push({ x: d, y: planAt(fromDnum(d)) }); planPts.push({ x: x1, y: st.targetWeight });
  const grad = c => { const { ctx, chartArea: ar } = c.chart; if (!ar) return 'transparent';
    const g = ctx.createLinearGradient(0, ar.top, 0, ar.bottom); g.addColorStop(0, acc + '40'); g.addColorStop(.7, acc + '08'); g.addColorStop(1, acc + '00'); return g; };
  const r = weightRange();
  charts.w = new Chart(cv, {
    type: 'line',
    data: { datasets: [
      { label: 'Težina', data: ws.w.map(e => ({ x: dnum(e.date), y: e.kg })), borderColor: acc, backgroundColor: grad, fill: 'start', borderWidth: 3, tension: .3,
        pointRadius: ctx => ctx.dataIndex === ws.w.length - 1 ? 6 : 4, pointBackgroundColor: card, pointBorderColor: acc, pointBorderWidth: 2.5, pointHoverRadius: 8, pointHoverBorderWidth: 3, pointHitRadius: 20 },
      { label: 'Plan', data: planPts, borderColor: plan, borderDash: [7, 6], borderWidth: 2, pointRadius: 0, pointHitRadius: 0, tension: 0, fill: false },
      { label: 'Cilj', data: [{ x: x0 - 60, y: st.targetWeight }, { x: x1 + 120, y: st.targetWeight }], borderColor: goal, borderDash: [3, 5], borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, fill: false }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      layout: { padding: { top: 10, right: 6 } },
      scales: {
        x: { type: 'linear', min: r.x0, max: r.x1, grid: { display: false }, border: { color: line },
          ticks: { color: muted, font: { weight: 600, size: 11 }, maxTicksLimit: 6, maxRotation: 0, callback: v => fmtDateShort(fromDnum(Math.round(v))) } },
        y: { min: r.y0, max: r.y1, position: 'right', grid: { color: line, drawTicks: false }, border: { display: false },
          ticks: { color: muted, font: { weight: 600, size: 11 }, padding: 8, maxTicksLimit: 6, callback: v => fmt(v, 0) } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: i => i.datasetIndex === 0, backgroundColor: text, titleColor: card, bodyColor: card, padding: 12, cornerRadius: 12, displayColors: false,
          titleFont: { weight: 800, size: 13, family: 'Manrope' }, bodyFont: { weight: 600, size: 13, family: 'Manrope' },
          callbacks: {
            title: it => it.length ? fmtDateLong(fromDnum(it[0].parsed.x)) : '',
            label: it => `Težina: ${fmt(it.parsed.y, 1)} kg`,
            afterLabel: it => { const p = planAt(fromDnum(it.parsed.x)); const v = it.parsed.y - p; return [`Plan: ${fmt(p, 1)} kg`, statusOf(v).txt, `Ukupno: ${fmtSigned(it.parsed.y - ws.sw)} kg`]; }
          }
        },
        zoom: {
          limits: { x: { min: x0 - 60, max: x1 + 60, minRange: 10 } },
          pan: { enabled: true, mode: 'x' },
          zoom: { pinch: { enabled: true }, wheel: { enabled: true }, mode: 'x' }
        }
      }
    },
    plugins: [endLabels]
  });
}

function weightSheet(entry) {
  const ws = weights(); const isNew = !entry;
  const def = isNew ? (ws.length ? today() : (today() <= S.settings.startDate ? S.settings.startDate : today())) : entry.date;
  const kg0 = entry ? entry.kg : ws.length ? ws[ws.length - 1].kg : 118;
  openSheet(`<h2>${isNew ? (ws.length ? 'Novo merenje' : 'Početna težina') : 'Izmeni merenje'}</h2>
    <p class="lead">${isNew ? 'Meri se ujutru, pre doručka, uvek pod istim uslovima.' : 'Ispravi vrednost ili obriši unos.'}</p>
    <label class="field"><span>Težina</span><div class="stepper"><button class="btn ghost" data-k="-0.1">−</button>
      <div class="input-unit"><input class="input big num" id="wKg" inputmode="decimal" value="${fmt(kg0, 1)}"><em>kg</em></div><button class="btn ghost" data-k="0.1">+</button></div></label>
    <label class="field"><span>Datum merenja</span><input class="input" type="date" id="wDate" value="${def}"></label>
    <label class="field"><span>Obim struka – opciono (u visini pupka)</span><div class="input-unit"><input class="input num" id="wWaist" inputmode="decimal" placeholder="npr. 118" value="${entry && entry.waist ? fmt(entry.waist, entry.waist % 1 ? 1 : 0) : ''}"><em>cm</em></div></label>
    <button class="btn primary block" id="wSave">${ICON.check} Sačuvaj</button>
    ${isNew ? '' : `<button class="btn danger block mt" id="wDel">${ICON.trash} Obriši merenje</button>`}`, b => {
    const inp = $('#wKg', b);
    $$('[data-k]', b).forEach(x => x.onclick = () => { const v = parseNum(inp.value) || kg0; inp.value = fmt(Math.round((v + +x.dataset.k) * 10) / 10, 1); });
    inp.onfocus = () => inp.select();
    $('#wSave', b).onclick = () => {
      const kg = Math.round(parseNum(inp.value) * 10) / 10; const date = $('#wDate', b).value;
      if (!(kg > 30 && kg < 400)) return toast('Unesi ispravnu težinu');
      if (!date) return toast('Izaberi datum');
      const dup = S.weights.find(x => x.date === date && (!entry || x.id !== entry.id));
      if (dup) S.weights = S.weights.filter(x => x !== dup);
      const wv = parseNum($('#wWaist', b).value); const waist = wv >= 40 && wv <= 250 ? Math.round(wv * 10) / 10 : undefined;
      if (entry) { Object.assign(entry, { kg, date }); if (waist) entry.waist = waist; else delete entry.waist; }
      else S.weights.push(waist ? { id: uid(), date, kg, waist } : { id: uid(), date, kg });
      // prvo merenje postaje početna težina i datum starta
      const first = weights()[0];
      if (isNew && weights().length === 1) { S.settings.startWeight = first.kg; S.settings.startDate = first.date; }
      else if (first.id === (entry ? entry.id : null) || !S.settings.startWeight) S.settings.startWeight = first.kg;
      save(); closeSheet(); toast(isNew ? 'Merenje sačuvano' : 'Izmena sačuvana'); go(TAB === 'tezina' ? 'tezina' : TAB, { keepScroll: true }); afterSave();
    };
    const del = $('#wDel', b);
    if (del) del.onclick = () => { closeSheet(); setTimeout(() => confirmSheet({ title: 'Obrisati merenje?', text: `${fmtDate(entry.date)} – ${fmt(entry.kg, 1)} kg`, ok: 'Obriši', danger: true, onOk: () => {
      S.weights = S.weights.filter(x => x.id !== entry.id);
      if (!S.weights.length) S.settings.startWeight = null;
      recomputeBadges(); save(); toast('Merenje obrisano'); go(TAB, { keepScroll: true }); } }), 250); };
  });
}

/* ========================= EKRAN: KORACI ========================= */
function renderKoraci(el) {
  const m = S.ui.stepsMetric, P = S.ui.stepsPeriod, def = METRICS[m];
  const cur = periodStats(m, P), prev = periodStats(m, P, addDays(today(), -P));
  const delta = cur.avg != null && prev.avg ? (cur.avg - prev.avg) / prev.avg * 100 : null;
  const deltaGood = delta == null ? null : (m === 'kcal' ? delta <= 0 : delta >= 0);
  const st = S.settings;
  let h = `<div class="stagger"><div class="card"><div class="card-head"><h2>Dnevni unos</h2><span class="card-sub">i naknadno</span></div>
    <label class="field"><span>Datum</span><input class="input" type="date" id="dDate" value="${today()}" max="${today()}"></label>
    <div class="grid3" style="margin-bottom:12px">
      <label class="field mb0"><span>Koraci</span><input class="input num" id="dSteps" inputmode="numeric" placeholder="0"></label>
      <label class="field mb0"><span>Kalorije</span><input class="input num" id="dKcal" inputmode="numeric" placeholder="0"></label>
      <label class="field mb0"><span>Km</span><input class="input num" id="dKm" inputmode="decimal" placeholder="auto"></label></div>
    <div class="small muted" style="font-weight:600;margin:-2px 2px 12px">Ako km ostane prazno, računa se iz koraka (korak ≈ ${fmt(stride() * 100, 0)} cm).</div>
    <button class="btn primary block" id="dSave">${ICON.check} Sačuvaj dan</button></div>

    <div class="card"><div class="seg" id="mSeg" style="margin-bottom:10px">${Object.entries(METRICS).map(([k, v]) => `<button data-k="${k}" class="${k === m ? 'on' : ''}">${v.lbl}</button>`).join('')}</div>
    <div class="seg" id="pSeg" style="margin-bottom:14px">${[[7, '7 dana'], [30, '30 dana'], [90, '3 meseca']].map(([k, l]) => `<button data-k="${k}" class="${k === P ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="chart-wrap sm"><canvas id="dChart"></canvas></div>
    <div class="legend"><span><i class="good"></i>U cilju</span><span><i class="warn"></i>Van cilja</span><span><i class="goal"></i>Cilj ${m === 'kcal' ? 'do ' : ''}${fmt(def.goal(), def.d)} ${def.short}</span></div></div>

    <div class="grid2">
      <div class="card stat"><div class="lbl">Prosek</div><div class="val num">${cur.avg != null ? fmt(cur.avg, def.d) : '–'}<small>${def.short}</small></div>
        <div class="hint">${delta == null ? 'nema poređenja' : `<b style="color:${deltaGood ? 'var(--good)' : 'var(--warn)'}">${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta), 0)}%</b> vs prethodnih ${P} d`}</div></div>
      <div class="card stat"><div class="lbl">Ukupno</div><div class="val num">${fmt(cur.sum, def.d)}<small>${def.short}</small></div><div class="hint">${cur.vals.length} dana sa unosom</div></div>
      <div class="card stat"><div class="lbl">${def.best === 'max' ? 'Najbolji dan' : 'Najniži unos'}</div><div class="val num">${cur.best ? fmt(cur.best.v, def.d) : '–'}<small>${def.short}</small></div><div class="hint">${cur.best ? fmtDateLong(cur.best.d) : '–'}</div></div>
      <div class="card stat"><div class="lbl">Dana u cilju</div><div class="val num">${cur.inGoal}<small>/ ${cur.vals.length}</small></div>
        <div class="bar" style="margin-top:10px;height:8px"><i data-w="${cur.vals.length ? cur.inGoal / cur.vals.length * 100 : 0}%" style="background:var(--good)"></i></div></div></div>`;

  const rows = cur.list.filter(x => S.daily[x.d]).reverse().map(x => {
    const r = S.daily[x.d];
    const c = (k, d) => { const v = r[k]; if (v == null || v === '') return '<td class="mut">–</td>'; return `<td style="color:${METRICS[k].ok(v) ? 'var(--good)' : 'var(--warn)'}">${fmt(v, d)}</td>`; };
    return `<tr class="tap" data-d="${x.d}"><td>${DAY_S[dow(x.d)]} ${fmtDateShort(x.d)}</td>${c('steps', 0)}${c('kcal', 0)}${c('km', 1)}</tr>`;
  }).join('');
  h += `<div class="section-title">Po danima</div><div class="card">${rows ? `<div class="table-scroll"><table class="table num"><thead><tr><th>Dan</th><th>Koraci</th><th>kcal</th><th>km</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="small muted mt" style="font-weight:600">Dodirni red za izmenu.</div>` : '<div class="empty" style="padding:10px"><p style="margin:0">Još nema unosa za ovaj period.</p></div>'}</div></div>`;
  el.innerHTML = h;
  animateIn(el);
  const fill = d => { const r = S.daily[d] || {}; $('#dSteps', el).value = r.steps ?? ''; $('#dKcal', el).value = r.kcal ?? ''; $('#dKm', el).value = r.km != null && r.kmManual ? fmt(r.km, 1) : ''; };
  fill(today());
  $('#dDate', el).onchange = e => fill(e.target.value);
  $('#dSave', el).onclick = () => {
    const d = $('#dDate', el).value; if (!d) return toast('Izaberi datum');
    if (saveDay(d, $('#dSteps', el).value, $('#dKcal', el).value, $('#dKm', el).value)) { toast(`Sačuvano za ${fmtDate(d)}`); go('koraci', { keepScroll: true }); afterSave(); }
  };
  $$('#mSeg button', el).forEach(b => b.onclick = () => { S.ui.stepsMetric = b.dataset.k; save(); go('koraci', { keepScroll: true }); });
  $$('#pSeg button', el).forEach(b => b.onclick = () => { S.ui.stepsPeriod = +b.dataset.k; save(); go('koraci', { keepScroll: true }); });
  $$('tr.tap', el).forEach(r => r.onclick = () => { $('#dDate', el).value = r.dataset.d; fill(r.dataset.d); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  drawDailyChart(cur, m);
}
const stride = () => S.settings.height * 0.415 / 100; // m po koraku
function saveDay(d, sv, kv, kmv) {
  const steps = parseNum(sv), kcal = parseNum(kv), km = parseNum(kmv);
  if ([steps, kcal, km].some(v => !isNaN(v) && v < 0)) { toast('Vrednosti ne mogu biti negativne'); return false; }
  const r = {};
  if (!isNaN(steps)) r.steps = Math.round(steps);
  if (!isNaN(kcal)) r.kcal = Math.round(kcal);
  if (!isNaN(km)) { r.km = Math.round(km * 10) / 10; r.kmManual = true; }
  else if (r.steps) r.km = Math.round(r.steps * stride() / 100) / 10;
  if (!Object.keys(r).length) { delete S.daily[d]; save(); return true; }
  S.daily[d] = r; save(); return true;
}
function dailySheet(d) {
  const r = S.daily[d] || {};
  openSheet(`<h2>Unos za ${fmtDate(d)}</h2><p class="lead">Koraci sa telefona/sata i ukupno pojedene kalorije.</p>
    <label class="field"><span>Koraci (cilj ${fmt(S.settings.stepsGoal)})</span><input class="input big num" id="qS" inputmode="numeric" value="${r.steps ?? ''}" placeholder="0"></label>
    <label class="field"><span>Kalorije (do ${fmt(S.settings.kcalGoal)})</span><input class="input big num" id="qK" inputmode="numeric" value="${r.kcal ?? ''}" placeholder="0"></label>
    <button class="btn primary block" id="qSave">${ICON.check} Sačuvaj</button>`, b => {
    $('#qSave', b).onclick = () => { if (saveDay(d, $('#qS', b).value, $('#qK', b).value, r.kmManual ? r.km : '')) { closeSheet(); toast('Sačuvano'); go(TAB, { keepScroll: true }); afterSave(); } };
  });
}
function drawDailyChart(cur, m) {
  const cv = $('#dChart'); if (!cv) return; const def = METRICS[m];
  const good = cssVar('--good'), warn = cssVar('--warn'), goal = cssVar('--goal'), muted = cssVar('--muted'), line = cssVar('--line'), text = cssVar('--text'), card = cssVar('--card'), c2 = cssVar('--card2');
  const labels = cur.list.map(x => x.d);
  const vals = cur.list.map(x => x.v || 0);
  const n = labels.length;
  charts.d = new Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', data: labels.map(() => def.goal()), borderColor: goal, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, order: 0 },
      { data: vals, backgroundColor: cur.list.map(x => x.v ? (def.ok(x.v) ? good : warn) : c2), borderRadius: n > 40 ? 3 : 7, borderSkipped: false,
        barPercentage: n > 40 ? .9 : .7, categoryPercentage: .9, order: 1, minBarLength: 2 }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700, easing: 'easeOutQuart' },
      scales: {
        x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, font: { weight: 600, size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: n <= 7 ? 7 : 6,
          callback: (v, i) => n <= 7 ? DAY_S[dow(labels[i])] : fmtDateShort(labels[i]) } },
        y: { beginAtZero: true, position: 'right', grid: { color: line, drawTicks: false }, border: { display: false },
          suggestedMax: def.goal() * 1.15, ticks: { color: muted, font: { weight: 600, size: 11 }, padding: 8, maxTicksLimit: 5, callback: v => m === 'km' ? fmt(v, 0) : v >= 1000 ? fmt(v / 1000, v % 1000 ? 1 : 0) + 'k' : fmt(v) } }
      },
      plugins: { legend: { display: false }, zoom: false,
        tooltip: { filter: i => i.datasetIndex === 1, backgroundColor: text, titleColor: card, bodyColor: card, padding: 12, cornerRadius: 12, displayColors: false,
          titleFont: { weight: 800, family: 'Manrope' }, bodyFont: { weight: 600, family: 'Manrope' },
          callbacks: { title: it => { const d = labels[it[0].dataIndex]; return `${DAY[dow(d)]}, ${fmtDateLong(d)}`; },
            label: it => it.parsed.y ? `${fmt(it.parsed.y, def.d)} ${def.unit} · ${def.ok(it.parsed.y) ? 'u cilju' : 'van cilja'}` : 'Nema unosa' } } }
    }
  });
}

/* ========================= EKRAN: AKTIVNOST ========================= */
function renderAktivnost(el) {
  const t = today(); const d0 = sumMinutes(t, t); const w = sumMinutes(monday(t), t);
  const mStart = t.slice(0, 8) + '01'; const mo = sumMinutes(mStart, t);
  const str = streak(); const P = S.ui.actPeriod;
  let h = `<div class="stagger"><div class="card hero"><div class="card-head"><h2>Danas</h2><span class="pill ${d0.n ? 'good' : 'neutral'}"><i></i>${d0.n ? 'Aktivan dan' : sessionFor(t) ? 'Trening čeka' : 'Odmor'}</span></div>
    <div class="row" style="gap:26px"><div><div class="big num" style="font-size:44px;font-weight:800;letter-spacing:-.03em">${d0.min}<small class="muted" style="font-size:16px"> min</small></div></div>
    <div><div class="big num" style="font-size:44px;font-weight:800;letter-spacing:-.03em">${d0.n}<small class="muted" style="font-size:16px"> tren.</small></div></div></div></div>
    <div class="grid2">
      <div class="card stat"><div class="lbl">Ova nedelja</div><div class="val num">${w.min}<small>min</small></div><div class="hint">${weekSummary(t)}</div></div>
      <div class="card stat"><div class="lbl">Ovaj mesec</div><div class="val num">${mo.min}<small>min</small></div><div class="hint">${mo.n} treninga · ${MON[parse(t).getMonth()]}</div></div>
      <div class="card stat"><div class="lbl">Niz po planu</div><div class="val num">${str}<small>dana</small></div><div class="hint">bez propuštenog treninga</div></div>
      <div class="card stat"><div class="lbl">Ukupno</div><div class="val num">${S.workouts.length}<small>tren.</small></div><div class="hint">${fmt(S.workouts.reduce((a, x) => a + x.minutes, 0))} min · najduži niz ${bestStreakWorkoutDays()} d</div></div></div>
    ${(() => { const mm = addDays(monday(t), 7 * S.ui.repWeek); return reportCard(weekReport(mm), S.ui.repWeek === 0 ? 'Ova nedelja' : S.ui.repWeek === -1 ? 'Prošla nedelja' : 'Nedeljni izveštaj', true); })()}
    <div class="card"><div class="card-head"><h2>Minuti po danima</h2></div>
      <div class="seg" id="aSeg" style="margin-bottom:14px">${[[7, '7 dana'], [14, '14 dana'], [30, '30 dana']].map(([k, l]) => `<button data-k="${k}" class="${k === P ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="chart-wrap sm"><canvas id="aChart"></canvas></div></div>
    <div class="card"><div class="card-head"><h2>Ova nedelja</h2><span class="card-sub">${weekSummary(t)}</span></div>${weekStrip(t)}</div>`;
  h += `<div class="section-title">Dostignuća · ${Object.keys(S.badges).length}/${BADGES.length}</div><div class="card">${badgesGrid()}</div>`;
  const allW = [...S.workouts].sort((a, b) => b.date.localeCompare(a.date)); const recent = allW.slice(0, showAllWo ? 200 : 10);
  h += `<div class="section-title">Istorija treninga</div><div class="card">${recent.length ? recent.map(x => `<div class="list-row tap" data-id="${x.id}" style="cursor:pointer">
    <div><div class="t">${x.title}</div><div class="s">${DAY[dow(x.date)]}, ${fmtDateLong(x.date)} · ${x.sets}/${x.total} serija</div></div><span class="pill acc">${x.minutes} min</span></div>`).join('')
    + (allW.length > recent.length ? `<button class="btn ghost block mt" id="moreWo">Prikaži sve (${allW.length})</button>` : '')
    : `<div class="empty"><div class="ico">${ICON.flag}</div><h3>Još nema treninga</h3><p style="margin:0 0 14px">Prvi trening te čeka u planu.</p><button class="btn primary" id="toWo">Idi na trening</button></div>`}</div></div>`;
  el.innerHTML = h; animateIn(el);
  $$('#aSeg button', el).forEach(b => b.onclick = () => { S.ui.actPeriod = +b.dataset.k; save(); go('aktivnost', { keepScroll: true }); });
  $('#toWo', el) && ($('#toWo', el).onclick = () => go('trening'));
  $$('[data-b]', el).forEach(b => b.onclick = () => badgeInfo(b.dataset.b));
  $('#moreWo', el) && ($('#moreWo', el).onclick = () => { showAllWo = true; go('aktivnost', { keepScroll: true }); });
  $$('[data-rw]', el).forEach(b => b.onclick = () => {
    const nv = S.ui.repWeek + +b.dataset.rw; const mm = addDays(monday(t), 7 * nv);
    if (nv > 0 || addDays(mm, 6) < S.settings.startDate) return toast('Nema podataka za tu nedelju');
    S.ui.repWeek = nv; save(); go('aktivnost', { keepScroll: true }); });
  $$('.list-row.tap', el).forEach(r => r.onclick = () => { const x = S.workouts.find(w => w.id === r.dataset.id);
    confirmSheet({ title: 'Obrisati trening?', text: `${x.title} – ${fmtDateLong(x.date)}, ${x.minutes} min`, ok: 'Obriši', danger: true, onOk: () => { S.workouts = S.workouts.filter(w => w.id !== x.id); save(); toast('Trening obrisan'); go('aktivnost', { keepScroll: true }); } }); });
  // grafikon
  const labels = []; for (let i = P - 1; i >= 0; i--) labels.push(addDays(t, -i));
  const vals = labels.map(d => woOn(d).reduce((a, w) => a + w.minutes, 0));
  const acc = cssVar('--accent'), c2 = cssVar('--card2'), muted = cssVar('--muted'), line = cssVar('--line'), text = cssVar('--text'), card = cssVar('--card');
  charts.a = new Chart($('#aChart', el), { type: 'bar',
    data: { labels, datasets: [{ data: vals, backgroundColor: vals.map((v, i) => v ? acc : sessionFor(labels[i]) && labels[i] < t && labels[i] >= S.settings.startDate ? cssVar('--warn') + '55' : c2), borderRadius: 7, borderSkipped: false, minBarLength: 3, barPercentage: .7 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      scales: { x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, font: { weight: 600, size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7, callback: (v, i) => P <= 7 ? DAY_S[dow(labels[i])] : fmtDateShort(labels[i]) } },
        y: { beginAtZero: true, suggestedMax: 60, position: 'right', grid: { color: line, drawTicks: false }, border: { display: false }, ticks: { color: muted, font: { weight: 600, size: 11 }, padding: 8, maxTicksLimit: 5 } } },
      plugins: { legend: { display: false }, zoom: false, tooltip: { backgroundColor: text, titleColor: card, bodyColor: card, padding: 12, cornerRadius: 12, displayColors: false, titleFont: { weight: 800, family: 'Manrope' }, bodyFont: { weight: 600, family: 'Manrope' },
        callbacks: { title: it => `${DAY[dow(labels[it[0].dataIndex])]}, ${fmtDateLong(labels[it[0].dataIndex])}`, label: it => { const ws = woOn(labels[it.dataIndex]); return ws.length ? ws.map(w => `${w.title}: ${w.minutes} min`) : (sessionFor(labels[it.dataIndex]) ? 'Bez treninga' : 'Dan odmora'); } } } } }
  });
}

/* ========================= EKRAN: PODEŠAVANJA ========================= */
function renderPodesavanja(el) {
  const st = S.settings;
  const num = (id, lbl, v, unit, mode = 'decimal') => `<label class="field"><span>${lbl}</span><div class="input-unit"><input class="input num" data-set="${id}" inputmode="${mode}" value="${v ?? ''}" placeholder="–"><em>${unit}</em></div></label>`;
  const seg = (id, opts, cur) => `<div class="seg" data-seg="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const sw = (id, lbl, sub, v) => `<div class="list-row"><div><div class="t">${lbl}</div><div class="s">${sub}</div></div><label class="switch"><input type="checkbox" data-sw="${id}" ${v ? 'checked' : ''}><span></span></label></div>`;
  el.innerHTML = `<div class="stagger">
  <div class="section-title" style="margin-top:6px">Telo i cilj</div><div class="card">
    <div class="grid2" style="margin:0"><label class="field"><span>Ime</span><input class="input" data-set="name" value="${st.name || ''}" maxlength="20"></label>${num('age', 'Godine', st.age, 'god.', 'numeric')}</div>
    <div class="grid2" style="margin:0">${num('startWeight', 'Početna težina', st.startWeight != null ? fmt(st.startWeight, 1) : '', 'kg')}${num('targetWeight', 'Ciljna težina', fmt(st.targetWeight, 1), 'kg')}</div>
    <div class="grid2" style="margin:0"><label class="field"><span>Datum starta</span><input class="input" type="date" data-set="startDate" value="${st.startDate}"></label>
    <label class="field"><span>Datum cilja</span><input class="input" type="date" data-set="targetDate" value="${st.targetDate}"></label></div>
    ${num('height', 'Visina', st.height, 'cm', 'numeric')}</div>
  <div class="section-title">Dnevni ciljevi</div><div class="card">
    <div class="grid2" style="margin:0">${num('kcalGoal', 'Kalorije (max)', st.kcalGoal, 'kcal', 'numeric')}${num('stepsGoal', 'Koraci (min)', st.stepsGoal, 'kor.', 'numeric')}</div>
    ${num('kmGoal', 'Kilometri (min)', fmt(st.kmGoal, 1), 'km')}</div>
  <div class="section-title">Trening</div><div class="card">
    <label class="field"><span>Nivo (broj serija)</span>${seg('level', [[0, 'Početnik · 2'], [1, 'Srednji · 3'], [2, 'Napredni · 4']], st.level)}</label>
    <label class="field"><span>Odmor između serija</span>${seg('rest', PRESETS.map(p => [p, p + ' s']), st.rest)}</label>
    ${sw('sound', 'Zvuk tajmera', 'Signal kad istekne odmor', st.sound)}${sw('vibrate', 'Vibracija', 'Vibracija na kraju odmora', st.vibrate)}</div>
  <div class="section-title">Izgled</div><div class="card"><label class="field mb0"><span>Tema</span>${seg('theme', [['auto', 'Automatski'], ['light', 'Svetla'], ['dark', 'Tamna']], st.theme)}</label></div>
  <div class="section-title">Podsetnik</div><div class="card">
    <div class="list-row"><div><div class="t">Nedeljno merenje</div><div class="s">Podsetnik u aplikaciji nedeljom. Za obaveštenje na telefonu dodaj ga u kalendar (nedeljom u 8:00).</div></div></div>
    <button class="btn ghost block mt" id="ics">${ICON.cal} Dodaj podsetnik u kalendar</button>
    ${'Notification' in window && Notification.permission !== 'granted' ? `<button class="btn ghost block mt" id="notif">${ICON.bell} Dozvoli obaveštenja (kraj odmora)</button>` : ''}</div>
  <div class="section-title">Rezervna kopija</div><div class="card">
    <p class="muted small" style="margin:0 0 12px;font-weight:600">Podaci su samo na ovom telefonu. Izvezi kopiju redovno (npr. jednom mesečno) i sačuvaj je na Google Drive.</p>
    <button class="btn primary block" id="exp">${ICON.download} Izvezi podatke (JSON)</button>
    ${navigator.canShare ? `<button class="btn ghost block mt" id="shr">${ICON.share} Podeli kopiju (Drive, Gmail…)</button>` : ''}
    <button class="btn ghost block mt" id="imp">${ICON.upload} Uvezi iz rezervne kopije</button><input type="file" id="impFile" accept="application/json,.json" hidden></div>
  <div class="section-title">Brisanje podataka</div><div class="card">
    ${[['weights', 'Merenja težine', S.weights.length + ' unosa'], ['daily', 'Koraci, kalorije, km', Object.keys(S.daily).length + ' dana'], ['workouts', 'Treninzi', S.workouts.length + ' treninga'], ['all', 'Sve podatke i podešavanja', 'Vraća aplikaciju na početak']]
      .map(([k, t, s]) => `<div class="list-row"><div><div class="t">${t}</div><div class="s">${s}</div></div><button class="btn danger sm" data-del="${k}">${ICON.trash}Obriši</button></div>`).join('')}</div>
  ${deferredPrompt ? `<button class="btn primary block" id="inst" style="margin-top:8px">${ICON.install} Instaliraj aplikaciju</button>` : ''}
  <p class="small muted" style="text-align:center;margin:22px 0 0;font-weight:600">Trening 1.1 · radi bez interneta · podaci ostaju na telefonu</p></div>`;

  $$('[data-set]', el).forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.set; let v = inp.value;
    if (k === 'name') { st.name = v.trim().slice(0, 20); save(); return toast('Sačuvano'); }
    if (inp.type === 'date') { if (!v) return; if (k === 'targetDate' && v <= st.startDate) return toast('Datum cilja mora biti posle starta'); }
    else { v = parseNum(v); if (k === 'startWeight' && isNaN(v)) v = null; else if (isNaN(v) || v <= 0) return toast('Unesi ispravan broj'); }
    if (['height', 'kcalGoal', 'stepsGoal', 'age'].includes(k) && v != null) v = Math.round(v);
    st[k] = v; save(); toast('Sačuvano');
  }));
  $$('[data-seg]', el).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => {
    const k = sg.dataset.seg; let v = b.dataset.v; if (k !== 'theme') v = +v;
    st[k] = v; save(); $$('button', sg).forEach(x => x.classList.toggle('on', x === b));
    if (k === 'theme') applyTheme(); toast('Sačuvano');
  }));
  $$('[data-sw]', el).forEach(c => c.onchange = () => { st[c.dataset.sw] = c.checked; save(); });
  $('#ics', el).onclick = makeICS;
  $('#notif', el) && ($('#notif', el).onclick = () => Notification.requestPermission().then(p => { toast(p === 'granted' ? 'Obaveštenja uključena' : 'Obaveštenja nisu dozvoljena'); go('podesavanja', { keepScroll: true }); }));
  $('#exp', el).onclick = exportData;
  $('#shr', el) && ($('#shr', el).onclick = shareData);
  $('#imp', el).onclick = () => $('#impFile', el).click();
  $('#impFile', el).onchange = e => importData(e.target.files[0]);
  $('#inst', el) && ($('#inst', el).onclick = doInstall);
  $$('[data-del]', el).forEach(b => b.onclick = () => {
    const k = b.dataset.del;
    const names = { weights: 'sva merenja težine', daily: 'sve unose koraka, kalorija i km', workouts: 'sve sačuvane treninge', all: 'SVE podatke i podešavanja' };
    confirmSheet({ title: 'Da li si siguran?', text: `Biće obrisano: ${names[k]}. Ovo se ne može vratiti – preporuka je da prvo izvezeš rezervnu kopiju.`, ok: 'Obriši', danger: true, onOk: () => {
      if (k === 'all') { S = structuredClone(DEFAULTS); }
      else if (k === 'weights') { S.weights = []; S.settings.startWeight = null; }
      else if (k === 'daily') S.daily = {};
      else if (k === 'workouts') { S.workouts = []; S.active = null; S.loads = {}; }
      if (k !== 'all') recomputeBadges();
      save(); applyTheme(); toast('Obrisano'); if (k === 'all') { onboarding(0); } go('podesavanja');
    } });
  });
}
function backupBlob() {
  const data = { app: 'trening', version: 1, exportedAt: new Date().toISOString(), data: { settings: S.settings, weights: S.weights, daily: S.daily, workouts: S.workouts, loads: S.loads, badges: S.badges } };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
const backupName = () => `trening-rezerva-${today()}.json`;
function exportData() {
  const url = URL.createObjectURL(backupBlob()); const a = document.createElement('a');
  a.href = url; a.download = backupName(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000); toast('Kopija sačuvana u Preuzimanja');
}
async function shareData() {
  try { const f = new File([backupBlob()], backupName(), { type: 'application/json' });
    if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'Trening – rezervna kopija' }); else exportData();
  } catch (e) { if (e.name !== 'AbortError') exportData(); }
}
function importData(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result); const d = j.data || j;
      if (!d || !Array.isArray(d.weights) || typeof d.daily !== 'object' || !Array.isArray(d.workouts)) throw new Error('format');
      confirmSheet({ title: 'Uvesti kopiju?', text: `Kopija od ${j.exportedAt ? fmtDateLong(iso(new Date(j.exportedAt))) : 'nepoznatog datuma'}: ${d.weights.length} merenja, ${Object.keys(d.daily).length} dana, ${d.workouts.length} treninga. Trenutni podaci biće zamenjeni.`, ok: 'Uvezi', onOk: () => {
        S = { ...structuredClone(DEFAULTS), settings: { ...DEFAULTS.settings, ...(d.settings || {}) }, weights: d.weights, daily: d.daily, workouts: d.workouts, loads: d.loads || {}, badges: d.badges || {}, onboarded: true };
        checkBadges(true); save(); applyTheme(); toast('Podaci uvezeni'); go('danas');
      } });
    } catch (e) { toast('Neispravan fajl rezervne kopije'); }
  };
  rd.readAsText(file);
}
function makeICS() {
  let d = today(); while (dow(d) !== 0 || d <= S.settings.startDate) d = addDays(d, 1);
  const ds = d.replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trening//SR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:trening-merenje-${ds}@trening`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${ds}T080000`, 'DURATION:PT10M', `RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=${addDays(S.settings.targetDate, 7).replace(/-/g, '')}T235900`,
    'SUMMARY:Trening – nedeljno merenje težine', 'DESCRIPTION:Izmeri se pre doručka i unesi težinu u aplikaciju Trening.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Vreme je za merenje', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = document.createElement('a'); a.href = url; a.download = 'trening-merenje.ics'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Otvori preuzeti fajl i dodaj u kalendar');
}

/* ========================= TEMA, INSTALACIJA, START ========================= */
const mq = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  $('#metaTheme').setAttribute('content', cssVar('--bg'));
}
mq.addEventListener('change', () => { if (S.settings.theme === 'auto') { applyTheme(); go(TAB, { keepScroll: true }); } });
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (TAB === 'danas' || TAB === 'podesavanja') go(TAB, { keepScroll: true }); });
async function doInstall() {
  if (!deferredPrompt) return toast('Instaliraj preko menija ⋮ → Dodaj na početni ekran');
  deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; deferredPrompt = null;
  if (r.outcome === 'accepted') toast('Aplikacija je instalirana'); else { S.ui.installHidden = true; save(); }
  go(TAB, { keepScroll: true });
}
window.addEventListener('appinstalled', () => { deferredPrompt = null; });
if (window.ChartZoom) { try { Chart.register(window.ChartZoom); } catch (e) {} }
Chart.defaults.font.family = 'Manrope, system-ui, sans-serif';
if (S.active && Date.now() - S.active.startedAt > 12 * 3600e3) { S.active = null; save(); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TITLES[h] && h !== TAB) go(h); });
let ignorePop = false;
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; if (location.hash.slice(1) !== TAB) history.replaceState(null, '', '#' + TAB); return; }
  closeSheet(true);
});
applyTheme();
document.fonts && document.fonts.ready.then(() => { if (charts.w || charts.d || charts.a) go(TAB, { keepScroll: true }); });
checkBadges(true);
go(TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'danas');
if (!S.onboarded) onboarding(0);
