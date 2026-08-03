// ============================================================
// Islanda On The Road — app logic
// Tutti i dati utente (spese, tappe completate, note) vivono
// SOLO in localStorage sul dispositivo. Nessun server.
// ============================================================

const STORE_KEYS = {
  done: 'iceland_done_stops_v1',
  notes: 'iceland_notes_v1',
  expenses: 'iceland_expenses_v1',
  startTimes: 'iceland_start_times_v1',
  durationOverrides: 'iceland_duration_overrides_v1',
  participants: 'iceland_participants_v1',
  cardTopups: 'iceland_card_topups_v1',
  descriptionOverrides: 'iceland_description_overrides_v1',
  noteOverrides: 'iceland_note_overrides_v1',
  priorityOverrides: 'iceland_priority_overrides_v1',
  collectedPriorities: 'iceland_collected_priorities_v1',
  suggestions: 'iceland_suggestions_v1',
  collectedSuggestions: 'iceland_collected_suggestions_v1',
  photoOverrides: 'iceland_photo_overrides_v1',
  mapsOverrides: 'iceland_maps_overrides_v1',
  hiddenStops: 'iceland_hidden_stops_v1',
  customStops: 'iceland_custom_stops_v1',
  pernottamentoPhoto: 'iceland_pernottamento_photo_v1',
  pernottamentoNote: 'iceland_pernottamento_note_v1',
  pernottamentoFields: 'iceland_pernottamento_fields_v1',
};

function loadStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage error', e);
    return false;
  }
}

let doneStops = loadStore(STORE_KEYS.done, {});
let personalNotes = loadStore(STORE_KEYS.notes, {});
let expenses = loadStore(STORE_KEYS.expenses, []); // cache locale, tenuta sincronizzata da Firestore quando disponibile
let startTimes = loadStore(STORE_KEYS.startTimes, {});             // { "1": "08:00", ... }
let durationOverrides = loadStore(STORE_KEYS.durationOverrides, {}); // { "1_0": {guida:40, visita:30}, ... }
let participants = loadStore(STORE_KEYS.participants,
  ['Emilio', 'Giusi', 'Marco', 'Giulio', 'Grazia', 'Ettore']);
let cardTopups = loadStore(STORE_KEYS.cardTopups, []); // [{id, person, amount, ts}]

// ---------------- sincronizzazione spese condivise (Firestore, se disponibile) ----------------
let firestoreConnected = false;
if (typeof db !== 'undefined' && db) {
  db.collection('expenses').orderBy('ts', 'asc').onSnapshot((snapshot) => {
    firestoreConnected = true;
    expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    saveStore(STORE_KEYS.expenses, expenses); // cache locale per l'uso offline
    if (typeof currentView !== 'undefined' && currentView === 'budget') renderBudget();
  }, (err) => {
    console.warn('Firestore non raggiungibile, uso la copia locale delle spese:', err);
  });
}
let descriptionOverrides = loadStore(STORE_KEYS.descriptionOverrides, {}); // { "1_0": "testo modificato dall'utente", ... }
let noteOverrides = loadStore(STORE_KEYS.noteOverrides, {}); // { "1_0": "nota pratica modificata dall'utente", ... }
let priorityOverrides = loadStore(STORE_KEYS.priorityOverrides, {}); // { "1_0": "Imperdibile", ... }
let collectedPriorities = loadStore(STORE_KEYS.collectedPriorities, {}); // { "Marco": {"1_0":"Imperdibile",...}, ... }
let suggestions = loadStore(STORE_KEYS.suggestions, []); // [{id, text, ts}]
let collectedSuggestions = loadStore(STORE_KEYS.collectedSuggestions, {}); // { "Marco": [{text, ts}, ...], ... }
let photoOverrides = loadStore(STORE_KEYS.photoOverrides, {}); // { "1_0": "https://..." oppure "Titolo Wikipedia" }
let mapsOverrides = loadStore(STORE_KEYS.mapsOverrides, {}); // { "1_0": "64.1234, -21.5678" oppure un link Google Maps }
let hiddenStops = loadStore(STORE_KEYS.hiddenStops, {}); // { "1_0": true, "custom_1_abc": true, ... }
let customStopsByDay = loadStore(STORE_KEYS.customStops, {}); // { "1": [ {key, da, a, priorita, guida, km, visita, parcheggio, ingresso, note} ] }
let pernottamentoPhoto = loadStore(STORE_KEYS.pernottamentoPhoto, {}); // { "1": "data:..." oppure "https://...", ... }
let pernottamentoNote = loadStore(STORE_KEYS.pernottamentoNote, {}); // { "1": "testo libero", ... }
let pernottamentoFieldOverrides = loadStore(STORE_KEYS.pernottamentoFields, {}); // { "1": {bagno:"Privato", cucina:"Sì", ...}, ... }
const PERNOTTAMENTO_EDITABLE_FIELDS = [
  ['n_camere', '🛏', 'N. camere'],
  ['camere', '🛏', 'Camere (descrizione)'],
  ['bagno', '🚿', 'Bagno'],
  ['cucina', '🍳', 'Cucina'],
  ['colazione', '🥐', 'Colazione'],
  ['ci_orario', '🕗', 'Check-in (orario)'],
  ['co_orario', '🕓', 'Check-out (orario)'],
  ['parcheggio', '🅿️', 'Parcheggio'],
  ['wifi', '📶', 'WiFi'],
  ['contatto', '📞', 'Contatto'],
];
function getEffectivePernottamento(p) {
  const ov = pernottamentoFieldOverrides[String(p.notte)] || {};
  const merged = { ...p };
  PERNOTTAMENTO_EDITABLE_FIELDS.forEach(([field]) => {
    if (Object.prototype.hasOwnProperty.call(ov, field)) merged[field] = ov[field];
  });
  return merged;
}

// Tutte le funzioni "getEffective*" ora prendono direttamente una chiave (key),
// la stessa usata per identificare la tappa ovunque (sia tappe originali "dayId_idx"
// che tappe aggiunte dall'utente "custom_dayId_xxxxx").
function getEffectiveDescription(key, s) {
  return Object.prototype.hasOwnProperty.call(descriptionOverrides, key)
    ? descriptionOverrides[key]
    : (s.descrizione || '');
}
function getEffectiveNote(key, s) {
  return Object.prototype.hasOwnProperty.call(noteOverrides, key)
    ? noteOverrides[key]
    : (s.note || '');
}
function getEffectivePhotoSource(key, s) {
  return Object.prototype.hasOwnProperty.call(photoOverrides, key)
    ? photoOverrides[key]
    : (s.wiki || '');
}
function getDefaultMapsDestination(day, s) {
  if (s.a && /pernottamento/i.test(s.a) && day.pernottamento) {
    return day.pernottamento.replace(/\(notte[^)]*\)/gi, '').replace(/⚠/g, '').replace(/\s+/g, ' ').trim();
  }
  return s.wiki || `${s.a}, Iceland`;
}
function getEffectiveMapsDestination(day, key, s) {
  return Object.prototype.hasOwnProperty.call(mapsOverrides, key)
    ? mapsOverrides[key]
    : getDefaultMapsDestination(day, s);
}
function buildMapsUrl(destination) {
  const val = destination.trim();
  if (/^https?:\/\//i.test(val)) return val; // link Google Maps incollato per intero
  if (/^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(val)) {
    // coordinate lat,lng
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(val.replace(/\s+/g, ''))}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(val)}`;
}
function getEffectivePriority(key, s) {
  return Object.prototype.hasOwnProperty.call(priorityOverrides, key)
    ? priorityOverrides[key]
    : (s.priorita || null);
}

// ---------------- tappe unite: originali + aggiunte dall'utente, con supporto nascondi ----------------
function getMergedStops(day) {
  const base = day.stops.map((s, i) => ({ key: stopKey(day.id, i), stop: s, custom: false }));
  const custom = (customStopsByDay[day.id] || []).map(c => ({ key: c.key, stop: c, custom: true }));
  return base.concat(custom);
}
function isStopHidden(key) {
  return !!hiddenStops[key];
}
function setStopHidden(key, hidden) {
  if (hidden) hiddenStops[key] = true;
  else delete hiddenStops[key];
  saveStore(STORE_KEYS.hiddenStops, hiddenStops);
}
function addCustomStop(dayId, data) {
  const key = `custom_${dayId}_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const entry = { key, da: data.da || '', a: data.a, priorita: data.priorita || null,
    guida: data.guida || '0:00', km: data.km || 0, visita: data.visita || '0:00',
    parcheggio: data.parcheggio ?? null, ingresso: data.ingresso ?? null, note: data.note || '' };
  if (!customStopsByDay[dayId]) customStopsByDay[dayId] = [];
  customStopsByDay[dayId].push(entry);
  saveStore(STORE_KEYS.customStops, customStopsByDay);
  return key;
}
function deleteCustomStop(dayId, key) {
  if (!customStopsByDay[dayId]) return;
  customStopsByDay[dayId] = customStopsByDay[dayId].filter(c => c.key !== key);
  saveStore(STORE_KEYS.customStops, customStopsByDay);
  delete hiddenStops[key];
  saveStore(STORE_KEYS.hiddenStops, hiddenStops);
}

const DEFAULT_START_TIME = '08:00';

// ---------------- blocco scroll pagina quando un modale è aperto ----------------
let scrollLockCount = 0;
function lockBodyScroll() {
  scrollLockCount++;
  document.body.style.overflow = 'hidden';
}
function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = '';
}

// ---------------- time chain engine ----------------
function parseHM(str) {
  if (!str) return 0;
  const parts = String(str).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}
function formatMin(totalMin) {
  let days = Math.floor(totalMin / 1440);
  let rem = totalMin - days * 1440;
  if (rem < 0) { rem += 1440; days -= 1; }
  const h = String(Math.floor(rem / 60)).padStart(2, '0');
  const m = String(rem % 60).padStart(2, '0');
  return days > 0 ? `${h}:${m} (+${days}g)` : `${h}:${m}`;
}
function formatDurationMin(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}
function getStartTime(dayId) {
  return startTimes[dayId] || DEFAULT_START_TIME;
}
function getEffectiveDurations(key, stop) {
  const ov = durationOverrides[key] || {};
  const guidaMin = ov.guida !== undefined ? ov.guida : parseHM(stop.guida);
  const visitaMin = ov.visita !== undefined ? ov.visita : parseHM(stop.visita);
  return { guidaMin, visitaMin };
}
function computeDayChain(day) {
  let cursor = parseHM(getStartTime(day.id));
  const merged = getMergedStops(day);
  const chain = {}; // key -> {partenza, arrivo, guidaMin, visitaMin, hidden}
  merged.forEach(({ key, stop }) => {
    const { guidaMin, visitaMin } = getEffectiveDurations(key, stop);
    const hidden = isStopHidden(key);
    if (hidden) {
      // tolta dal calcolo: non conta nel totale, non sposta gli orari successivi
      chain[key] = { partenza: cursor, arrivo: cursor, guidaMin, visitaMin, hidden: true };
      return;
    }
    const partenza = cursor;
    const arrivo = cursor + guidaMin;
    chain[key] = { partenza, arrivo, guidaMin, visitaMin, hidden: false };
    cursor = arrivo + visitaMin;
  });
  return chain;
}

// ---------------- cassa comune: saldi tra partecipanti ----------------
// Solo le spese di cassa comune ANTICIPATE DA UNA PERSONA (non pagate con la carta)
// entrano nel calcolo di chi deve dare/ricevere: quelle pagate con la carta comune
// sono già "della cassa" e non generano debiti tra le persone.
function computeBalances() {
  const net = {};
  participants.forEach(p => { net[p] = 0; });
  expenses.forEach(e => {
    if (e.shared === false) return;       // spesa personale
    if (e.paymentSource !== 'person') return; // pagata con la carta comune, nessun debito
    if (!e.paidBy || !(e.paidBy in net)) return;
    const share = e.amount / participants.length;
    net[e.paidBy] += e.amount - share;
    participants.forEach(p => {
      if (p !== e.paidBy) net[p] -= share;
    });
  });
  return net; // positivo = deve ricevere, negativo = deve dare
}

// ---------------- carta comune: quote versate - speso dalla carta ----------------
function computeCardBalance() {
  const totalTopups = cardTopups.reduce((s, t) => s + t.amount, 0);
  const spentFromCard = expenses
    .filter(e => e.shared !== false && e.paymentSource === 'card')
    .reduce((s, e) => s + e.amount, 0);
  return { totalTopups, spentFromCard, remaining: totalTopups - spentFromCard };
}

// ---------------- riepilogo per persona: totale spese personali + contatore spese registrate ----------------
function computePerPersonSummary() {
  const summary = {};
  participants.forEach(p => { summary[p] = { personalTotal: 0, count: 0 }; });
  expenses.forEach(e => {
    if (!e.paidBy || !(e.paidBy in summary)) return; // spese pagate con la carta comune non hanno un "paidBy"
    summary[e.paidBy].count += 1;
    if (e.shared === false) summary[e.paidBy].personalTotal += e.amount;
  });
  return summary;
}

function simplifySettlement(net) {
  const creditors = [];
  const debtors = [];
  Object.entries(net).forEach(([name, bal]) => {
    if (bal > 0.005) creditors.push({ name, amt: bal });
    else if (bal < -0.005) debtors.push({ name, amt: -bal });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const tx = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    tx.push({ from: debtors[i].name, to: creditors[j].name, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return tx;
}

let currentDayId = TRIP_DATA.days[0].id;
let currentView = 'days';

// ---------------- helpers ----------------
function fmtEuro(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function priorityInfo(p) {
  if (p === 'Imperdibile') return { cls: 'pri-imperdibile', label: '🟢 Imperdibile' };
  if (p === 'Facoltativa') return { cls: 'pri-facoltativa', label: '🟡 Facoltativa' };
  if (p === 'Da evitare') return { cls: 'pri-evitare', label: '🔴 Da evitare' };
  return null;
}

function stopKey(dayId, idx) { return `${dayId}_${idx}`; }

// ---------------- rende cliccabili eventuali link incollati dentro note/descrizioni ----------------
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function linkify(text) {
  const escaped = escapeHtml(text);
  // riconosce in un solo passaggio sia link http(s) sia coppie di coordinate
  // incollate così come le copi da Google Maps (es. "63.7796, -18.1684")
  const combined = /(https?:\/\/[^\s<]+)|(-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,})/g;
  return escaped.replace(combined, (match, urlMatch, coordMatch) => {
    if (urlMatch) {
      return `<a href="${urlMatch}" target="_blank" rel="noopener">${urlMatch}</a>`;
    }
    if (coordMatch) {
      const coords = coordMatch.replace(/\s+/g, '');
      return `<a href="https://www.google.com/maps?q=${coords}" target="_blank" rel="noopener">📍 ${coordMatch}</a>`;
    }
    return match;
  });
}

// ---------------- foto da Wikipedia (fetch on-demand + cache) ----------------
const WIKI_IMG_CACHE_KEY = 'iceland_wiki_img_cache_v1';
let wikiImgCache = loadStore(WIKI_IMG_CACHE_KEY, {}); // { "Gullfoss": "https://...jpg" | null }

async function getWikiImage(title) {
  if (!title) return null;
  if (title in wikiImgCache) return wikiImgCache[title];
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('not found');
    const json = await res.json();
    const src = (json.thumbnail && json.thumbnail.source) || null;
    wikiImgCache[title] = src;
    saveStore(WIKI_IMG_CACHE_KEY, wikiImgCache);
    return src;
  } catch (e) {
    wikiImgCache[title] = null;
    saveStore(WIKI_IMG_CACHE_KEY, wikiImgCache);
    return null;
  }
}

// ---------------- scheda dettagliata di una tappa ----------------
let currentDetailDay = null;
let currentDetailKey = null;

// mappa ogni giorno alla notte corrispondente nella tabella Pernottamenti,
// per poter mostrare le informazioni ricche della struttura dentro la scheda della tappa
const DAY_TO_NOTTE = {
  0: '1', 1: '2-3', 2: '2-3', 3: '4', 4: '5', 5: '6', 6: '7',
  7: '8', 8: '9', 9: '10', 10: '11', 11: '12', 12: '13', 13: '14',
};

function getStopByKey(day, key) {
  const found = getMergedStops(day).find(m => m.key === key);
  return found ? found.stop : null;
}

let currentStayNotte = null;

function renderStayInfoSection(day, s) {
  const section = document.getElementById('detailStayInfoSection');
  const isStay = !!(s.a && /pernottamento/i.test(s.a));
  currentStayNotte = null;
  if (!isStay) {
    section.style.display = 'none';
    return false;
  }
  const notte = DAY_TO_NOTTE[day.id];
  const rawP = notte ? TRIP_DATA.pernottamenti.find(x => String(x.notte) === notte) : null;
  if (!rawP) {
    section.style.display = 'none';
    return false;
  }
  currentStayNotte = String(rawP.notte);
  renderStayInfoGrid(rawP);
  document.getElementById('detailStayEdit').classList.remove('open');
  document.getElementById('detailStayReset').style.display =
    Object.prototype.hasOwnProperty.call(pernottamentoFieldOverrides, currentStayNotte) ? '' : 'none';
  section.style.display = '';
  return true;
}

function renderStayInfoGrid(rawP) {
  const p = getEffectivePernottamento(rawP);
  const rows = [
    ['🛏', 'Camere', p.n_camere ? `${p.n_camere} (${p.camere || ''})`.replace(' ()', '') : (p.camere || '')],
    ['🚿', 'Bagno', p.bagno],
    ['🍳', 'Cucina', p.cucina],
    ['🥐', 'Colazione', p.colazione],
    ['🕗', 'Check-in', p.ci_orario],
    ['🕓', 'Check-out', p.co_orario],
    ['🅿️', 'Parcheggio', p.parcheggio],
    ['📶', 'WiFi', p.wifi],
    ['📞', 'Contatto', p.contatto],
  ].filter(([, , v]) => v && String(v).trim());

  const grid = document.getElementById('detailStayInfoGrid');
  if (rows.length) {
    grid.innerHTML = rows.map(([icon, label, val]) =>
      `<div class="stay-info-item"><span class="stay-info-icon">${icon}</span><span class="stay-info-label">${label}</span><span class="stay-info-val">${val}</span></div>`
    ).join('');
  } else {
    grid.innerHTML = `<div class="stay-info-empty">Nessun dettaglio ancora compilato per questa struttura.</div>`;
  }

  const form = document.getElementById('detailStayEditForm');
  form.innerHTML = PERNOTTAMENTO_EDITABLE_FIELDS.map(([field, icon, label]) => `
    <div class="stay-edit-row">
      <label>${icon} ${label}</label>
      <input type="text" data-field="${field}" value="${(p[field] || '').toString().replace(/"/g, '&quot;')}">
    </div>
  `).join('');
}

document.getElementById('detailStayEditToggle').addEventListener('click', () => {
  document.getElementById('detailStayEdit').classList.toggle('open');
});

document.getElementById('detailStaySave').addEventListener('click', () => {
  if (!currentStayNotte) return;
  const rawP = TRIP_DATA.pernottamenti.find(x => String(x.notte) === currentStayNotte);
  if (!rawP) return;
  const ov = pernottamentoFieldOverrides[currentStayNotte] || {};
  document.querySelectorAll('#detailStayEditForm input[data-field]').forEach(input => {
    ov[input.dataset.field] = input.value.trim();
  });
  pernottamentoFieldOverrides[currentStayNotte] = ov;
  saveStore(STORE_KEYS.pernottamentoFields, pernottamentoFieldOverrides);
  renderStayInfoGrid(rawP);
  document.getElementById('detailStayEdit').classList.remove('open');
  document.getElementById('detailStayReset').style.display = '';
  if (currentView === 'info') renderInfo();
});

document.getElementById('detailStayReset').addEventListener('click', () => {
  if (!currentStayNotte) return;
  const rawP = TRIP_DATA.pernottamenti.find(x => String(x.notte) === currentStayNotte);
  if (!rawP) return;
  delete pernottamentoFieldOverrides[currentStayNotte];
  saveStore(STORE_KEYS.pernottamentoFields, pernottamentoFieldOverrides);
  renderStayInfoGrid(rawP);
  document.getElementById('detailStayReset').style.display = 'none';
  if (currentView === 'info') renderInfo();
});

async function openStopDetailModal(day, key) {
  const s = getStopByKey(day, key);
  if (!s) return;
  currentDetailDay = day;
  currentDetailKey = key;
  const chain = computeDayChain(day);
  const { guidaMin, visitaMin } = chain[key];

  const backdrop = document.getElementById('stopDetailBackdrop');
  const eyebrow = document.getElementById('detailEyebrow');
  const titleEl = document.getElementById('detailTitle');
  const badgesBox = document.getElementById('detailBadges');

  eyebrow.textContent = `${day.label || 'Giorno ' + day.id} · da ${s.da || ''}`;
  titleEl.textContent = s.a || '';

  const isStay = renderStayInfoSection(day, s);
  document.getElementById('detailPrioritySection').style.display = isStay ? 'none' : '';

  const effPriority = getEffectivePriority(key, s);
  let badges = '';
  if (guidaMin > 0) badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${s.km ? ' · ' + s.km + ' km' : ''}</span>`;
  if (visitaMin > 0) badges += `<span class="badge time">⏱ ${formatDurationMin(visitaMin)}</span>`;
  if (s.parcheggio !== null && s.parcheggio !== undefined) {
    badges += s.parcheggio > 0 ? `<span class="badge cost">🅿️ ${fmtEuro(s.parcheggio)}</span>` : `<span class="badge free">🅿️ gratuito</span>`;
  }
  if (s.ingresso !== null && s.ingresso !== undefined && s.ingresso > 0) {
    badges += `<span class="badge cost">🎟 ${fmtEuro(s.ingresso)}</span>`;
  }
  badgesBox.innerHTML = badges;

  renderDetailMapsLink(day, key, s);
  document.getElementById('detailMapsEdit').classList.remove('open');
  document.getElementById('detailMapsReset').style.display =
    Object.prototype.hasOwnProperty.call(mapsOverrides, key) ? '' : 'none';
  document.getElementById('detailMapsInput').value = getEffectiveMapsDestination(day, key, s);

  renderPriorityChips(day, key, s, effPriority);

  document.getElementById('detailDescSection').style.display = isStay ? 'none' : '';
  if (!isStay) {
    renderDetailDescription(key, s);
    document.getElementById('detailDescEdit').classList.remove('open');
    document.getElementById('detailDescReset').style.display = Object.prototype.hasOwnProperty.call(descriptionOverrides, key) ? '' : 'none';
  }

  if (isStay) {
    renderStayNote(currentStayNotte);
  } else {
    renderDetailNote(key, s);
    document.getElementById('detailNoteEdit').classList.remove('open');
    document.getElementById('detailNoteReset').style.display =
      Object.prototype.hasOwnProperty.call(noteOverrides, key) ? '' : 'none';
  }

  loadDetailPhoto(key, s);
  document.getElementById('detailPhotoEdit').classList.remove('open');
  document.getElementById('detailPhotoReset').style.display =
    Object.prototype.hasOwnProperty.call(photoOverrides, key) ? '' : 'none';
  const currentPhotoSrc = getEffectivePhotoSource(key, s);
  const photoInputEl = document.getElementById('detailPhotoInput');
  if (currentPhotoSrc.startsWith('data:')) {
    photoInputEl.value = '';
    photoInputEl.placeholder = '📁 È caricata una foto dal dispositivo — scrivi qui per sostituirla con un link o un titolo Wikipedia';
  } else {
    photoInputEl.value = currentPhotoSrc;
    photoInputEl.placeholder = "Incolla un link diretto a un'immagine, oppure scrivi il nome di una voce Wikipedia (es. Gullfoss)";
  }

  backdrop.classList.add('open');
  lockBodyScroll();
}

function loadDetailPhoto(key, s) {
  const photoBox = document.getElementById('detailPhoto');
  const source = getEffectivePhotoSource(key, s);
  if (!source) {
    photoBox.style.display = 'none';
    photoBox.innerHTML = '';
    return;
  }
  photoBox.style.display = '';
  photoBox.innerHTML = `<div class="detail-photo-loading">📷 carico foto…</div>`;
  if (/^(https?:|data:)/i.test(source)) {
    // link diretto a un'immagine, o foto caricata dal dispositivo (data URL)
    const img = new Image();
    img.onload = () => { photoBox.innerHTML = `<img src="${source}" alt="${s.a}" loading="lazy">`; };
    img.onerror = () => { photoBox.innerHTML = `<div class="detail-photo-loading">📷 impossibile caricare questo link</div>`; };
    img.src = source;
  } else {
    // titolo di una voce Wikipedia
    getWikiImage(source).then(src => {
      if (src) {
        photoBox.innerHTML = `<img src="${src}" alt="${s.a}" loading="lazy">`;
      } else {
        photoBox.innerHTML = `<div class="detail-photo-loading">📷 nessuna foto trovata per questa voce</div>`;
      }
    });
  }
}

document.getElementById('detailPhotoEditToggle').addEventListener('click', () => {
  document.getElementById('detailPhotoEdit').classList.toggle('open');
});

document.getElementById('detailPhotoFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !currentDetailDay || !currentDetailKey) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // ridimensiona/comprimi lato client per non riempire lo spazio del dispositivo
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);

      photoOverrides[currentDetailKey] = dataUrl;
      const ok = saveStore(STORE_KEYS.photoOverrides, photoOverrides);
      if (!ok) {
        delete photoOverrides[currentDetailKey];
        alert('Spazio di archiviazione del dispositivo esaurito: non riesco a salvare altre foto. Prova a eliminarne qualcuna già caricata (Ripristina originale su altre tappe) e riprova.');
        return;
      }
      const s = getStopByKey(currentDetailDay, currentDetailKey);
      loadDetailPhoto(currentDetailKey, s);
      document.getElementById('detailPhotoReset').style.display = '';
      document.getElementById('detailPhotoInput').value = '';
      document.getElementById('detailPhotoInput').placeholder = '📁 È caricata una foto dal dispositivo — scrivi qui per sostituirla con un link o un titolo Wikipedia';
      document.getElementById('detailPhotoEdit').classList.remove('open');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

document.getElementById('detailPhotoSave').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  const val = document.getElementById('detailPhotoInput').value.trim();
  photoOverrides[currentDetailKey] = val;
  saveStore(STORE_KEYS.photoOverrides, photoOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  loadDetailPhoto(currentDetailKey, s);
  document.getElementById('detailPhotoEdit').classList.remove('open');
  document.getElementById('detailPhotoReset').style.display = '';
});

document.getElementById('detailPhotoReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete photoOverrides[currentDetailKey];
  saveStore(STORE_KEYS.photoOverrides, photoOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  loadDetailPhoto(currentDetailKey, s);
  document.getElementById('detailPhotoInput').value = getEffectivePhotoSource(currentDetailKey, s);
  document.getElementById('detailPhotoReset').style.display = 'none';
});

function renderDetailDescription(key, s) {
  const descEl = document.getElementById('detailDesc');
  const textarea = document.getElementById('detailDescTextarea');
  const effective = getEffectiveDescription(key, s);
  if (effective) {
    descEl.innerHTML = effective.split('\n\n').map(p => `<p>${linkify(p)}</p>`).join('');
  } else {
    descEl.innerHTML = `<p class="detail-desc-empty">Nessuna descrizione ancora per questa tappa. Tocca "✏️ Modifica" per scriverne una.</p>`;
  }
  textarea.value = effective;
}

function renderDetailMapsLink(day, key, s) {
  const destination = getEffectiveMapsDestination(day, key, s);
  document.getElementById('detailMapsLink').href = buildMapsUrl(destination);
}

document.getElementById('detailMapsEditToggle').addEventListener('click', () => {
  document.getElementById('detailMapsEdit').classList.toggle('open');
});

document.getElementById('detailMapsSave').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  const val = document.getElementById('detailMapsInput').value.trim();
  if (!val) return;
  mapsOverrides[currentDetailKey] = val;
  saveStore(STORE_KEYS.mapsOverrides, mapsOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailMapsLink(currentDetailDay, currentDetailKey, s);
  document.getElementById('detailMapsEdit').classList.remove('open');
  document.getElementById('detailMapsReset').style.display = '';
});

document.getElementById('detailMapsReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete mapsOverrides[currentDetailKey];
  saveStore(STORE_KEYS.mapsOverrides, mapsOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailMapsLink(currentDetailDay, currentDetailKey, s);
  document.getElementById('detailMapsInput').value = getEffectiveMapsDestination(currentDetailDay, currentDetailKey, s);
  document.getElementById('detailMapsReset').style.display = 'none';
});

function renderDetailNote(key, s) {
  const noteEl = document.getElementById('detailNote');
  const textarea = document.getElementById('detailNoteTextarea');
  const effective = getEffectiveNote(key, s);
  if (effective) {
    noteEl.innerHTML = linkify(effective);
    noteEl.classList.remove('detail-desc-empty');
  } else {
    noteEl.textContent = 'Nessuna nota pratica ancora. Tocca "✏️ Modifica" per aggiungerne una (es. condizioni strada, 4x4, guadi).';
    noteEl.classList.add('detail-desc-empty');
  }
  textarea.value = effective;
}

function renderStayNote(notte) {
  const noteEl = document.getElementById('detailNote');
  const textarea = document.getElementById('detailNoteTextarea');
  const effective = pernottamentoNote[notte] || '';
  if (effective) {
    noteEl.innerHTML = linkify(effective);
    noteEl.classList.remove('detail-desc-empty');
  } else {
    noteEl.textContent = 'Nessuna nota ancora per questo pernottamento. Tocca "✏️ Modifica" per scriverne una (indicazioni, codice del cancello, promemoria...).';
    noteEl.classList.add('detail-desc-empty');
  }
  textarea.value = effective;
  document.getElementById('detailNoteReset').style.display = 'none'; // le note del pernottamento non hanno un "originale" a cui tornare
}

const PRIORITY_OPTIONS = ['Imperdibile', 'Facoltativa', 'Da evitare'];

function renderPriorityChips(day, key, s, current) {
  const box = document.getElementById('detailPriorityChips');
  box.innerHTML = PRIORITY_OPTIONS.map(p => {
    const info = priorityInfo(p);
    return `<span class="chip pri-chip ${p === current ? 'selected' : ''}" data-pri="${p}">${info.label}</span>`;
  }).join('');
  box.querySelectorAll('.pri-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const newPri = chip.dataset.pri;
      if (newPri === s.priorita) {
        delete priorityOverrides[key]; // torna al valore originale, non serve un override
      } else {
        priorityOverrides[key] = newPri;
      }
      saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
      renderPriorityChips(day, key, s, newPri);
      renderDayView(); // aggiorna il badge nella lista delle tappe
    });
  });
}

document.getElementById('detailEditToggle').addEventListener('click', () => {
  document.getElementById('detailDescEdit').classList.toggle('open');
});
document.getElementById('detailNoteEditToggle').addEventListener('click', () => {
  document.getElementById('detailNoteEdit').classList.toggle('open');
});

document.getElementById('detailDescSave').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  const val = document.getElementById('detailDescTextarea').value.trim();
  descriptionOverrides[currentDetailKey] = val;
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailDescription(currentDetailKey, s);
  document.getElementById('detailDescEdit').classList.remove('open');
  document.getElementById('detailDescReset').style.display = '';
  renderDayView(); // aggiorna eventuale visibilità pulsante "Scheda" nella lista
});

document.getElementById('detailDescReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete descriptionOverrides[currentDetailKey];
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailDescription(currentDetailKey, s);
  document.getElementById('detailDescReset').style.display = 'none';
});

document.getElementById('detailNoteSave').addEventListener('click', () => {
  const val = document.getElementById('detailNoteTextarea').value.trim();
  if (currentStayNotte) {
    pernottamentoNote[currentStayNotte] = val;
    saveStore(STORE_KEYS.pernottamentoNote, pernottamentoNote);
    renderStayNote(currentStayNotte);
    document.getElementById('detailNoteEdit').classList.remove('open');
    if (currentView === 'info') renderInfo();
    return;
  }
  if (!currentDetailDay || !currentDetailKey) return;
  noteOverrides[currentDetailKey] = val;
  saveStore(STORE_KEYS.noteOverrides, noteOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailNote(currentDetailKey, s);
  document.getElementById('detailNoteEdit').classList.remove('open');
  document.getElementById('detailNoteReset').style.display = '';
  renderDayView();
});

document.getElementById('detailNoteReset').addEventListener('click', () => {
  if (currentStayNotte) return; // non applicabile alle note del pernottamento
  if (!currentDetailDay || !currentDetailKey) return;
  delete noteOverrides[currentDetailKey];
  saveStore(STORE_KEYS.noteOverrides, noteOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailNote(currentDetailKey, s);
  document.getElementById('detailNoteReset').style.display = 'none';
  renderDayView();
});

document.getElementById('detailClose').addEventListener('click', () => {
  document.getElementById('stopDetailBackdrop').classList.remove('open');
  unlockBodyScroll();
});
document.getElementById('stopDetailBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'stopDetailBackdrop') {
    e.currentTarget.classList.remove('open');
    unlockBodyScroll();
  }
});

// ---------------- render: day tabs ----------------
function renderDayTabs() {
  const wrap = document.getElementById('dayTabs');
  wrap.innerHTML = '';
  TRIP_DATA.days.forEach(day => {
    const btn = document.createElement('button');
    btn.className = 'daytab' + (day.id === currentDayId ? ' active' : '');
    btn.textContent = day.label || `Giorno ${day.id}`;
    btn.addEventListener('click', () => {
      currentDayId = day.id;
      renderDayTabs();
      renderDayView();
    });
    wrap.appendChild(btn);
  });
}

// ---------------- render: day meta + stops ----------------
function renderDayView() {
  const day = TRIP_DATA.days.find(d => d.id === currentDayId);
  const meta = document.getElementById('dayMeta');
  meta.innerHTML = `
    <div class="date">📅 ${day.data}</div>
    <div class="title">${day.titolo}</div>
    <div class="sun">🌅 alba ${day.alba} &nbsp;·&nbsp; 🌇 tramonto ${day.tramonto}</div>
    <div class="stay">🏠 ${day.pernottamento}</div>
  `;

  const merged = getMergedStops(day);
  const chain = computeDayChain(day);
  const visible = merged.filter(({ key }) => !isStopHidden(key));
  const hiddenList = merged.filter(({ key }) => isStopHidden(key));
  const firstDep = visible.length ? chain[visible[0].key].partenza : parseHM(getStartTime(day.id));
  const lastArr = visible.length ? chain[visible[visible.length - 1].key].arrivo : firstDep;

  const timesBar = document.getElementById('dayTimes');
  timesBar.innerHTML = `
    <div class="daytimes-box">
      <div class="dt-field">
        <label>🌅 Partenza mattutina</label>
        <input type="time" id="dayStartInput" value="${getStartTime(day.id)}">
      </div>
      <div class="dt-field dt-computed">
        <label>🌙 Arrivo previsto in serata</label>
        <div class="dt-value">${formatMin(lastArr)}</div>
      </div>
    </div>
    ${startTimes[day.id] ? `<span class="dt-reset" id="dayStartReset">↺ ripristina orario predefinito (${DEFAULT_START_TIME})</span>` : ''}
    <div class="daytimes-actions">
      <span class="dt-add-stop" id="addStopBtn">➕ Aggiungi tappa in fondo alla giornata</span>
      ${hiddenList.length ? `<span class="dt-hidden-toggle" id="hiddenStopsToggle">🙈 ${hiddenList.length} tappa/e nascosta/e — mostra</span>` : ''}
    </div>
    <div class="hidden-stops-box" id="hiddenStopsBox"></div>
  `;
  document.getElementById('dayStartInput').addEventListener('change', (e) => {
    startTimes[day.id] = e.target.value || DEFAULT_START_TIME;
    saveStore(STORE_KEYS.startTimes, startTimes);
    renderDayView();
  });
  const resetBtn = document.getElementById('dayStartReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      delete startTimes[day.id];
      saveStore(STORE_KEYS.startTimes, startTimes);
      renderDayView();
    });
  }
  document.getElementById('addStopBtn').addEventListener('click', () => openAddStopModal(day));
  const hiddenToggleBtn = document.getElementById('hiddenStopsToggle');
  if (hiddenToggleBtn) {
    hiddenToggleBtn.addEventListener('click', () => {
      const box = document.getElementById('hiddenStopsBox');
      const isOpen = box.classList.toggle('open');
      if (isOpen) {
        box.innerHTML = hiddenList.map(({ key, stop }) => `
          <div class="hidden-stop-row">
            <span>${stop.a}</span>
            <span class="dt-show-again" data-key="${key}">👁️ Mostra di nuovo</span>
          </div>
        `).join('');
        box.querySelectorAll('.dt-show-again').forEach(btn => {
          btn.addEventListener('click', () => {
            setStopHidden(btn.dataset.key, false);
            renderDayView();
          });
        });
      }
    });
  }

  const doneList = doneStops[day.id] || [];
  const donePct = visible.length ? Math.round((doneList.length / visible.length) * 100) : 0;
  document.getElementById('progressFill').style.width = donePct + '%';
  document.getElementById('progressLabel').textContent = `${doneList.length} / ${visible.length} tappe completate  ·  ${formatMin(firstDep)} → ${formatMin(lastArr)}`;

  const list = document.getElementById('stopsList');
  list.innerHTML = '';

  visible.forEach(({ key, stop: s, custom }, displayIdx) => {
    const isDone = doneList.includes(key);
    const card = document.createElement('div');
    card.className = 'stop-card' + (isDone ? ' done' : '');

    const { partenza, arrivo, guidaMin, visitaMin } = chain[key];
    const effectiveNote = getEffectiveNote(key, s);

    const pri = priorityInfo(getEffectivePriority(key, s));
    let badges = '';
    if (pri) badges += `<span class="badge ${pri.cls}">${pri.label}</span>`;
    if (guidaMin > 0) badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${s.km ? ' · ' + s.km + ' km' : ''}</span>`;
    if (visitaMin > 0) badges += `<span class="badge time">⏱ ${formatDurationMin(visitaMin)}</span>`;
    if (s.parcheggio !== null && s.parcheggio !== undefined) {
      badges += s.parcheggio > 0
        ? `<span class="badge cost">🅿️ ${fmtEuro(s.parcheggio)}</span>`
        : `<span class="badge free">🅿️ gratuito</span>`;
    }
    if (s.ingresso !== null && s.ingresso !== undefined && s.ingresso > 0) {
      badges += `<span class="badge cost">🎟 ${fmtEuro(s.ingresso)}</span>`;
    }
    if (custom) badges += `<span class="badge custom-badge">➕ Aggiunta da te</span>`;

    const savedNote = personalNotes[key] || '';
    const isOverridden = !!durationOverrides[key];

    card.innerHTML = `
      <div class="stop-top">
        <div class="stop-check ${isDone ? 'checked' : ''}" data-key="${key}">${isDone ? '✓' : ''}</div>
        <div class="stop-main">
          <div class="stop-title-row">
            <div class="stop-title stop-title-clickable" data-key="${key}">${displayIdx + 1}. ${s.a || ''}</div>
            <button class="stop-detail-btn detail-open" data-key="${key}">📖 Scheda</button>
          </div>
          <div class="stop-sub">da ${s.da || ''}</div>
          <div class="stop-times">
            🕗 <b>${formatMin(partenza)}</b> → <b>${formatMin(arrivo)}</b>
            <span class="stop-time-edit-toggle" data-key="${key}">✏️ orari${isOverridden ? ' •' : ''}</span>
          </div>
          <div class="stop-timeedit" data-key="${key}">
            <div class="te-row">
              <label>Guida (min)</label>
              <input type="number" min="0" step="1" class="te-guida" value="${guidaMin}">
            </div>
            <div class="te-row">
              <label>Visita (min)</label>
              <input type="number" min="0" step="1" class="te-visita" value="${visitaMin}">
            </div>
            <div class="te-actions">
              <button class="te-apply" data-key="${key}">Applica</button>
              ${isOverridden ? `<button class="te-reset" data-key="${key}">Ripristina</button>` : ''}
            </div>
          </div>
          <div class="stop-badges">${badges}</div>
          ${effectiveNote ? `<div class="stop-note">${linkify(effectiveNote)}</div>` : ''}
          <span class="stop-toggle" data-key="${key}">✏️ Nota personale</span>
          <div class="stop-personal" data-key="${key}">
            <textarea placeholder="Scrivi qui una nota, un'impressione, un promemoria...">${savedNote}</textarea>
          </div>
          <div class="stop-hide-row">
            <span class="stop-hide-btn" data-key="${key}" data-custom="${custom ? '1' : '0'}">${custom ? '🗑️ Elimina questa tappa' : '🙈 Nascondi questa tappa'}</span>
          </div>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  // wire checkboxes
  list.querySelectorAll('.stop-check').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const arr = doneStops[currentDayId] || [];
      const pos = arr.indexOf(key);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(key);
      doneStops[currentDayId] = arr;
      saveStore(STORE_KEYS.done, doneStops);
      renderDayView();
    });
  });

  // wire personal note toggles
  list.querySelectorAll('.stop-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const box = list.querySelector(`.stop-personal[data-key="${key}"]`);
      box.classList.toggle('open');
    });
  });

  // wire detail modal opener (titolo o bottone "Scheda completa")
  list.querySelectorAll('.detail-open, .stop-title-clickable').forEach(el => {
    el.addEventListener('click', () => {
      openStopDetailModal(day, el.dataset.key);
    });
  });

  // wire textarea auto-save
  list.querySelectorAll('.stop-personal textarea').forEach(ta => {
    const key = ta.closest('.stop-personal').dataset.key;
    ta.addEventListener('blur', () => {
      personalNotes[key] = ta.value;
      saveStore(STORE_KEYS.notes, personalNotes);
    });
  });

  // wire time-edit toggles
  list.querySelectorAll('.stop-time-edit-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const box = list.querySelector(`.stop-timeedit[data-key="${key}"]`);
      box.classList.toggle('open');
    });
  });

  // wire apply/reset for per-stop duration overrides
  list.querySelectorAll('.te-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const box = list.querySelector(`.stop-timeedit[data-key="${key}"]`);
      const guida = parseInt(box.querySelector('.te-guida').value, 10) || 0;
      const visita = parseInt(box.querySelector('.te-visita').value, 10) || 0;
      durationOverrides[key] = { guida, visita };
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
    });
  });
  list.querySelectorAll('.te-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      delete durationOverrides[key];
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
    });
  });

  // wire nascondi/elimina tappa
  list.querySelectorAll('.stop-hide-btn').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const isCustom = el.dataset.custom === '1';
      if (isCustom) {
        if (confirm('Eliminare definitivamente questa tappa aggiunta da te? Non si può annullare.')) {
          deleteCustomStop(day.id, key);
          renderDayView();
        }
      } else {
        setStopHidden(key, true);
        renderDayView();
      }
    });
  });
}

// ---------------- aggiungi una nuova tappa in fondo alla giornata ----------------
function openAddStopModal(day) {
  const name = prompt('Nome della nuova tappa:');
  if (!name || !name.trim()) return;
  const guidaStr = prompt('Minuti di guida per arrivarci (numero, es. 20):', '0') || '0';
  const visitaStr = prompt('Minuti di visita previsti (numero, es. 30):', '30') || '0';
  const guidaMin = parseInt(guidaStr, 10) || 0;
  const visitaMin = parseInt(visitaStr, 10) || 0;
  const guida = `${Math.floor(guidaMin / 60)}:${String(guidaMin % 60).padStart(2, '0')}`;
  const visita = `${Math.floor(visitaMin / 60)}:${String(visitaMin % 60).padStart(2, '0')}`;
  addCustomStop(day.id, { a: name.trim(), guida, visita, priorita: 'Facoltativa' });
  renderDayView();
}

// ---------------- render: budget ----------------
function renderBudget() {
  const syncEl = document.getElementById('syncStatus');
  if (syncEl) {
    if (typeof db === 'undefined' || !db) {
      syncEl.innerHTML = `<span class="sync-badge sync-off">⚪ Cassa comune solo locale (Firebase non attivo)</span>`;
    } else if (firestoreConnected) {
      syncEl.innerHTML = `<span class="sync-badge sync-on">🟢 Spese sincronizzate con gli altri dispositivi</span>`;
    } else {
      syncEl.innerHTML = `<span class="sync-badge sync-wait">🟡 Connessione al database in corso…</span>`;
    }
  }
  const persone = participants.length;
  const totale = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totaleComune = expenses.filter(e => e.shared !== false).reduce((s, e) => s + e.amount, 0);
  const totalePersonale = totale - totaleComune;
  const perPersona = totaleComune / persone;

  const byDay = {};
  expenses.forEach(e => {
    byDay[e.day] = (byDay[e.day] || 0) + e.amount;
  });

  const summary = document.getElementById('budgetSummary');
  let rows = `
    <div class="row total"><span class="label">Totale speso (cassa comune + personali)</span><span class="value">${fmtEuro(totale)}</span></div>
    <div class="row"><span class="label">Cassa comune</span><span class="value">${fmtEuro(totaleComune)}</span></div>
    <div class="row"><span class="label">Quota a persona (÷${persone})</span><span class="value">${fmtEuro(perPersona)}</span></div>
    <div class="row"><span class="label">Spese personali (totale)</span><span class="value">${fmtEuro(totalePersonale)}</span></div>
  `;
  Object.keys(byDay).sort().forEach(day => {
    rows += `<div class="row"><span class="label">${day}</span><span class="value">${fmtEuro(byDay[day])}</span></div>`;
  });
  summary.innerHTML = rows;

  // ---- carta comune ----
  const card = computeCardBalance();
  const cardBox = document.getElementById('cardBalanceBox');
  const cardCls = card.remaining < -0.005 ? 'debit' : 'credit';
  cardBox.innerHTML = `
    <div class="row"><span class="label">Quote versate sulla carta</span><span class="value">${fmtEuro(card.totalTopups)}</span></div>
    <div class="row"><span class="label">Speso dalla carta</span><span class="value">${fmtEuro(card.spentFromCard)}</span></div>
    <div class="row total"><span class="label">Saldo residuo sulla carta</span><span class="value ${cardCls}">${fmtEuro(card.remaining)}</span></div>
  `;

  // ---- riepilogo per persona ----
  const perPerson = computePerPersonSummary();
  const perPersonBox = document.getElementById('perPersonBox');
  let ppHtml = '<div class="per-person-list">';
  participants.forEach(p => {
    const s = perPerson[p];
    ppHtml += `
      <div class="per-person-row">
        <span class="pp-name">${p}</span>
        <span class="pp-count" title="Numero di spese registrate a suo nome">🧾 ${s.count}</span>
        <span class="pp-total">${fmtEuro(s.personalTotal)} <small>personali</small></span>
      </div>
    `;
  });
  ppHtml += '</div>';
  perPersonBox.innerHTML = ppHtml;

  // ---- saldi tra partecipanti (solo spese anticipate di tasca propria) ----
  const net = computeBalances();
  const tx = simplifySettlement(net);
  const balBox = document.getElementById('balancesBox');
  let balHtml = '<div class="balance-people">';
  participants.forEach(p => {
    const bal = net[p] || 0;
    const cls = bal > 0.005 ? 'credit' : (bal < -0.005 ? 'debit' : 'even');
    const label = bal > 0.005 ? `deve ricevere ${fmtEuro(bal)}` : (bal < -0.005 ? `deve dare ${fmtEuro(-bal)}` : 'in pari');
    balHtml += `<div class="balance-person ${cls}"><span class="bp-name">${p}</span><span class="bp-val">${label}</span></div>`;
  });
  balHtml += '</div>';
  if (tx.length === 0) {
    balHtml += `<div class="empty-state">Nessuna spesa anticipata di tasca propria ancora, oppure i conti sono già in pari.</div>`;
  } else {
    balHtml += '<div class="settle-list">';
    tx.forEach(t => {
      balHtml += `<div class="settle-row">👉 <b>${t.from}</b> deve dare <b>${fmtEuro(t.amount)}</b> a <b>${t.to}</b></div>`;
    });
    balHtml += '</div>';
  }
  balBox.innerHTML = balHtml;

  const list = document.getElementById('expenseList');
  if (expenses.length === 0) {
    list.innerHTML = `<div class="empty-state">Nessuna spesa registrata ancora.<br>Usa il tasto "＋ Aggiungi spesa" per iniziare.</div>`;
    return;
  }
  list.innerHTML = '';
  [...expenses].reverse().forEach(e => {
    const item = document.createElement('div');
    item.className = 'expense-item';
    let typeTag;
    if (e.shared === false) typeTag = `👤 personale · pagato da ${e.paidBy || '—'}`;
    else if (e.paymentSource === 'card') typeTag = '💳 cassa comune (carta)';
    else typeTag = `🤝 cassa comune · anticipato da ${e.paidBy || '—'}`;
    item.innerHTML = `
      <div class="info">
        <div class="cat">${e.category} — ${e.day}</div>
        <div class="meta">${typeTag}${e.note ? ' · ' + e.note : ''}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="amount">${fmtEuro(e.amount)}</div>
        <div class="del" data-id="${e.id}">Elimina</div>
      </div>
    `;
    list.appendChild(item);
  });
  list.querySelectorAll('.del').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (typeof db !== 'undefined' && db && firestoreConnected) {
        db.collection('expenses').doc(id).delete().catch((err) => {
          console.warn('Eliminazione su Firestore fallita:', err);
        });
        // la vista si aggiorna da sola tramite onSnapshot
      } else {
        expenses = expenses.filter(e => e.id !== id);
        saveStore(STORE_KEYS.expenses, expenses);
        renderBudget();
      }
    });
  });
}

// ---------------- render: info / pernottamenti / partecipanti ----------------
function renderParticipants() {
  const box = document.getElementById('participantsBox');
  box.innerHTML = participants.map((name, i) =>
    `<input type="text" class="participant-input" data-i="${i}" value="${name}">`
  ).join('');
  box.querySelectorAll('.participant-input').forEach(inp => {
    inp.addEventListener('blur', () => {
      const i = parseInt(inp.dataset.i, 10);
      const newVal = inp.value.trim() || `Persona ${i + 1}`;
      const oldVal = participants[i];
      if (newVal === oldVal) return;
      // aggiorna anche i riferimenti "pagato da" / "anticipato da" nelle spese e nelle quote già registrate
      expenses.forEach(e => { if (e.paidBy === oldVal) e.paidBy = newVal; });
      saveStore(STORE_KEYS.expenses, expenses);
      cardTopups.forEach(t => { if (t.person === oldVal) t.person = newVal; });
      saveStore(STORE_KEYS.cardTopups, cardTopups);
      participants[i] = newVal;
      saveStore(STORE_KEYS.participants, participants);
    });
  });
}

function renderCardTopups() {
  const box = document.getElementById('cardTopupBox');
  const totalTopups = cardTopups.reduce((s, t) => s + t.amount, 0);

  let html = `
    <div class="topup-add-row">
      <select id="topupPerson">${participants.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
      <input type="number" id="topupAmount" inputmode="decimal" step="0.01" placeholder="€">
      <button id="topupAddBtn">＋</button>
    </div>
  `;
  if (cardTopups.length === 0) {
    html += `<div class="empty-state">Nessuna quota versata ancora.</div>`;
  } else {
    html += '<div class="topup-list">';
    [...cardTopups].reverse().forEach(t => {
      html += `<div class="topup-row"><span>${t.person}</span><span>${fmtEuro(t.amount)}</span><span class="del" data-id="${t.id}">Elimina</span></div>`;
    });
    html += '</div>';
    html += `<div class="topup-total">Totale versato: <b>${fmtEuro(totalTopups)}</b></div>`;
  }
  box.innerHTML = html;

  document.getElementById('topupAddBtn').addEventListener('click', () => {
    const person = document.getElementById('topupPerson').value;
    const amount = parseFloat(document.getElementById('topupAmount').value);
    if (!amount || amount <= 0) return;
    cardTopups.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 7), person, amount, ts: Date.now() });
    saveStore(STORE_KEYS.cardTopups, cardTopups);
    renderCardTopups();
  });
  box.querySelectorAll('.topup-row .del').forEach(el => {
    el.addEventListener('click', () => {
      cardTopups = cardTopups.filter(t => t.id !== el.dataset.id);
      saveStore(STORE_KEYS.cardTopups, cardTopups);
      renderCardTopups();
    });
  });
}

// ---------------- raccolta priorità di gruppo (export/import/confronto) ----------------
function getStopLabelByKey(key) {
  const us = key.indexOf('_');
  const dayId = parseInt(key.slice(0, us), 10);
  const idx = parseInt(key.slice(us + 1), 10);
  const day = TRIP_DATA.days.find(d => d.id === dayId);
  if (!day || !day.stops[idx]) return key;
  const dayLabel = day.label || `Giorno ${day.id}`;
  return { dayLabel, dayOrder: dayId, stopName: day.stops[idx].a || key };
}

function renderPriorityCollector() {
  const box = document.getElementById('priorityCollectBox');
  const myCount = Object.keys(priorityOverrides).length;
  const collectedNames = Object.keys(collectedPriorities);

  let html = `
    <div class="pc-block">
      <div class="pc-block-title">1. Esporta le tue scelte</div>
      <div class="pc-row">
        <select id="pcExportPerson">${participants.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
        <button class="btn primary" id="pcExportBtn">⬇️ Esporta</button>
      </div>
      <div class="pc-hint">${myCount} modifiche di priorità su questo dispositivo. Scegli il tuo nome e scarica il file, poi mandalo a chi raccoglie le risposte (es. via WhatsApp).</div>
    </div>
    <div class="pc-block">
      <div class="pc-block-title">2. Carica un file ricevuto</div>
      <div class="pc-row">
        <input type="file" id="pcImportFile" accept="application/json">
      </div>
      <div class="pc-hint">Persone già caricate: ${collectedNames.length ? collectedNames.join(', ') : 'nessuna ancora'}.
      ${collectedNames.length ? `<span class="detail-reset-link" id="pcClearAll">↺ Cancella tutte</span>` : ''}</div>
    </div>
  `;

  if (collectedNames.length > 0) {
    // costruisci l'elenco di tutte le tappe con almeno una scelta raccolta
    const stopKeys = new Set();
    collectedNames.forEach(name => {
      Object.keys(collectedPriorities[name] || {}).forEach(k => stopKeys.add(k));
    });
    const rows = Array.from(stopKeys).map(k => ({ key: k, ...getStopLabelByKey(k) }))
      .sort((a, b) => (a.dayOrder - b.dayOrder) || (a.key > b.key ? 1 : -1));

    html += `<div class="pc-block"><div class="pc-block-title">3. Confronto tappa per tappa</div>`;
    if (rows.length === 0) {
      html += `<div class="pc-hint">Nessuna scelta ancora caricata.</div>`;
    } else {
      let lastDay = null;
      rows.forEach(r => {
        if (r.dayLabel !== lastDay) {
          html += `<div class="pc-day-heading">${r.dayLabel}</div>`;
          lastDay = r.dayLabel;
        }
        html += `<div class="pc-stop-row"><div class="pc-stop-name">${r.stopName}</div><div class="pc-choices">`;
        collectedNames.forEach(name => {
          const p = collectedPriorities[name][r.key];
          if (!p) return;
          const info = priorityInfo(p);
          html += `<span class="pc-choice-chip pri-chip ${info ? info.cls.replace('pri-', 'pc-') : ''}" data-key="${r.key}" data-pri="${p}" title="Applica ${info ? info.label : p}">${name}: ${info ? info.label : p}</span>`;
        });
        html += `</div></div>`;
      });
    }
    html += `</div>`;
  }

  box.innerHTML = html;

  document.getElementById('pcExportBtn').addEventListener('click', () => {
    const person = document.getElementById('pcExportPerson').value;
    const payload = { person, priorityOverrides, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `islanda-priorita-${person.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('pcImportFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const person = data.person || `Persona ${Date.now()}`;
        collectedPriorities[person] = data.priorityOverrides || {};
        saveStore(STORE_KEYS.collectedPriorities, collectedPriorities);
        renderPriorityCollector();
      } catch (err) {
        alert('File non valido: assicurati di aver caricato il file .json esportato dall\'app.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  const clearBtn = document.getElementById('pcClearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      collectedPriorities = {};
      saveStore(STORE_KEYS.collectedPriorities, collectedPriorities);
      renderPriorityCollector();
    });
  }

  box.querySelectorAll('.pc-choice-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.key;
      const pri = chip.dataset.pri;
      priorityOverrides[key] = pri;
      saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
      renderPriorityCollector();
    });
  });
}

// ---------------- suggerimenti di località non ancora inserite ----------------
function renderSuggestions() {
  const box = document.getElementById('suggestionsBox');
  const collectedNames = Object.keys(collectedSuggestions);

  let html = `
    <div class="pc-block">
      <div class="pc-block-title">Aggiungi una tua proposta</div>
      <div class="pc-row">
        <input type="text" id="sugText" placeholder="Es. nome del posto + perché ti interessa">
        <button class="btn primary" id="sugAddBtn">＋ Aggiungi</button>
      </div>
    </div>
  `;

  if (suggestions.length > 0) {
    html += `<div class="pc-block"><div class="pc-block-title">Le tue proposte (su questo dispositivo)</div><div class="sug-list">`;
    suggestions.forEach(s => {
      html += `<div class="sug-item"><span>${s.text}</span><span class="detail-reset-link sug-del" data-id="${s.id}">Elimina</span></div>`;
    });
    html += `</div></div>`;
  }

  html += `
    <div class="pc-block">
      <div class="pc-block-title">Esporta e condividi</div>
      <div class="pc-row">
        <select id="sugExportPerson">${participants.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
        <button class="btn primary" id="sugExportBtn">⬇️ Esporta</button>
      </div>
      <div class="pc-hint">Scegli il tuo nome e scarica il file con le tue proposte, poi mandalo a chi raccoglie i suggerimenti (es. via WhatsApp).</div>
    </div>
    <div class="pc-block">
      <div class="pc-block-title">Carica un file ricevuto</div>
      <div class="pc-row">
        <input type="file" id="sugImportFile" accept="application/json">
      </div>
      <div class="pc-hint">Persone già caricate: ${collectedNames.length ? collectedNames.join(', ') : 'nessuna ancora'}.
      ${collectedNames.length ? `<span class="detail-reset-link" id="sugClearAll">↺ Cancella tutte</span>` : ''}</div>
    </div>
  `;

  if (collectedNames.length > 0) {
    html += `<div class="pc-block"><div class="pc-block-title">Tutte le proposte raccolte</div>`;
    collectedNames.forEach(name => {
      const list = collectedSuggestions[name] || [];
      if (list.length === 0) return;
      html += `<div class="pc-day-heading">${name}</div>`;
      list.forEach(item => {
        html += `<div class="pc-stop-row"><div class="pc-stop-name">${item.text}</div></div>`;
      });
    });
    html += `</div>`;
  }

  box.innerHTML = html;

  document.getElementById('sugAddBtn').addEventListener('click', () => {
    const input = document.getElementById('sugText');
    const val = input.value.trim();
    if (!val) return;
    suggestions.push({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 7), text: val, ts: Date.now() });
    saveStore(STORE_KEYS.suggestions, suggestions);
    renderSuggestions();
  });

  box.querySelectorAll('.sug-del').forEach(el => {
    el.addEventListener('click', () => {
      suggestions = suggestions.filter(s => s.id !== el.dataset.id);
      saveStore(STORE_KEYS.suggestions, suggestions);
      renderSuggestions();
    });
  });

  document.getElementById('sugExportBtn').addEventListener('click', () => {
    const person = document.getElementById('sugExportPerson').value;
    const payload = { person, suggestions: suggestions.map(s => ({ text: s.text, ts: s.ts })), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `islanda-suggerimenti-${person.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('sugImportFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const person = data.person || `Persona ${Date.now()}`;
        collectedSuggestions[person] = data.suggestions || [];
        saveStore(STORE_KEYS.collectedSuggestions, collectedSuggestions);
        renderSuggestions();
      } catch (err) {
        alert('File non valido: assicurati di aver caricato il file .json esportato dall\'app.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  const clearBtn = document.getElementById('sugClearAll');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      collectedSuggestions = {};
      saveStore(STORE_KEYS.collectedSuggestions, collectedSuggestions);
      renderSuggestions();
    });
  }
}

function renderInfo() {
  renderParticipants();
  renderCardTopups();
  renderPriorityCollector();
  renderSuggestions();
  const list = document.getElementById('pernottamentiList');
  list.innerHTML = '';
  TRIP_DATA.pernottamenti.forEach(rawP => {
    const p = getEffectivePernottamento(rawP);
    const key = String(p.notte);
    const card = document.createElement('div');
    card.className = 'info-card stay-card';
    const mapsQuery = `${p.struttura} ${p.localita}, Iceland`.replace(/⚠/g, '').replace(/\s+/g, ' ').trim();
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`;

    const infoRows = [
      ['🛏', 'Camere', p.n_camere ? `${p.n_camere} (${p.camere || ''})`.replace(' ()', '') : (p.camere || '')],
      ['🚿', 'Bagno', p.bagno],
      ['🍳', 'Cucina', p.cucina],
      ['🥐', 'Colazione', p.colazione],
      ['🕗', 'Check-in', p.ci_orario],
      ['🕓', 'Check-out', p.co_orario],
      ['🅿️', 'Parcheggio', p.parcheggio],
      ['📶', 'WiFi', p.wifi],
      ['📞', 'Contatto', p.contatto],
    ].filter(([, , v]) => v && String(v).trim());

    const photoSrc = pernottamentoPhoto[key] || '';
    const savedNote = pernottamentoNote[key] || '';

    card.innerHTML = `
      <div class="stay-photo" data-key="${key}">
        ${photoSrc ? `<img src="${photoSrc}" alt="${p.struttura}">` : `<div class="stay-photo-empty">📷 Nessuna foto — tocca "Aggiungi foto" sotto</div>`}
      </div>
      <div class="stay-body">
        <div class="stay-title">${p.struttura}</div>
        <div class="stay-location">📍 ${p.localita}</div>
        <div class="stay-sub">Notte ${p.notte} · ${p.checkin} → ${p.checkout}${p.costo ? ' · ' + fmtEuro(p.costo) : ''}</div>
        <a class="info-maps-link" href="${mapsUrl}" target="_blank" rel="noopener">🗺️ Apri in Google Maps</a>
        ${infoRows.length ? `<div class="stay-info-grid">${infoRows.map(([icon, label, val]) =>
          `<div class="stay-info-item"><span class="stay-info-icon">${icon}</span><span class="stay-info-label">${label}</span><span class="stay-info-val">${val}</span></div>`
        ).join('')}</div>` : ''}
        ${p.extra ? `<div class="stay-extra">${linkify(p.extra)}</div>` : ''}
        <div class="stay-photo-actions">
          <label class="stay-photo-btn" for="stayPhotoFile_${key}">📷 ${photoSrc ? 'Cambia' : 'Aggiungi'} foto</label>
          <input type="file" id="stayPhotoFile_${key}" data-key="${key}" accept="image/*" style="display:none">
          ${photoSrc ? `<span class="stay-photo-remove" data-key="${key}">🗑️ Rimuovi foto</span>` : ''}
        </div>
        <div class="stay-note-section">
          <div class="stay-note-title">📝 Note</div>
          <textarea class="stay-note-textarea" data-key="${key}" placeholder="Scrivi qui note libere su questa struttura (indicazioni, codice cancello, promemoria...)">${savedNote}</textarea>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  // upload foto pernottamento (con ridimensionamento/compressione come per le tappe)
  list.querySelectorAll('input[type="file"][id^="stayPhotoFile_"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const key = e.target.dataset.key;
      if (!file || !key) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          pernottamentoPhoto[key] = dataUrl;
          const ok = saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
          if (!ok) {
            delete pernottamentoPhoto[key];
            alert('Spazio di archiviazione esaurito: elimina qualche foto già caricata e riprova.');
            return;
          }
          renderInfo();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  });

  list.querySelectorAll('.stay-photo-remove').forEach(el => {
    el.addEventListener('click', () => {
      delete pernottamentoPhoto[el.dataset.key];
      saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
      renderInfo();
    });
  });

  list.querySelectorAll('.stay-note-textarea').forEach(ta => {
    ta.addEventListener('blur', () => {
      pernottamentoNote[ta.dataset.key] = ta.value;
      saveStore(STORE_KEYS.pernottamentoNote, pernottamentoNote);
    });
  });
}

// ---------------- view switching ----------------
function switchView(view) {
  currentView = view;
  document.getElementById('view-days').style.display = view === 'days' ? '' : 'none';
  document.getElementById('view-budget').style.display = view === 'budget' ? '' : 'none';
  document.getElementById('view-info').style.display = view === 'info' ? '' : 'none';
  document.getElementById('fabAddExpenseTop').style.display = view === 'info' ? 'none' : '';
  document.querySelectorAll('.navbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'budget') renderBudget();
  if (view === 'info') renderInfo();
}

document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ---------------- expense modal ----------------
const expModalBackdrop = document.getElementById('expenseModalBackdrop');
let selectedCategory = TRIP_DATA.budget_categories[0];
let selectedType = 'shared';       // 'shared' = cassa comune, 'personal' = spesa personale
let selectedSource = 'card';       // 'card' = carta comune, 'person' = anticipato da una persona

function updateModalFieldsVisibility() {
  const sourceField = document.getElementById('expSourceField');
  const paidByField = document.getElementById('expPaidByField');
  const paidByLabel = document.getElementById('expPaidByLabel');

  if (selectedType === 'shared') {
    sourceField.style.display = '';
    if (selectedSource === 'card') {
      paidByField.style.display = 'none';
    } else {
      paidByField.style.display = '';
      paidByLabel.textContent = 'Anticipato da';
    }
  } else {
    // spesa personale: niente scelta di fonte, serve solo sapere chi l'ha pagata
    sourceField.style.display = 'none';
    paidByField.style.display = '';
    paidByLabel.textContent = 'Pagato da';
  }
}

function openExpenseModal() {
  const daySel = document.getElementById('expDay');
  const numberedDays = TRIP_DATA.days.filter(d => !d.label);
  const maxNumberedId = numberedDays.length ? Math.max(...numberedDays.map(d => d.id)) : 0;
  const dayLabel = d => d.label || `Giorno ${d.id}`;
  daySel.innerHTML = TRIP_DATA.days.map(d => `<option value="${dayLabel(d)}">${dayLabel(d)}</option>`).join('')
    + Array.from({length: Math.max(0, 14 - maxNumberedId)}, (_, i) => {
        const n = maxNumberedId + i + 1;
        return `<option value="Giorno ${n}">Giorno ${n}</option>`;
      }).join('')
    + `<option value="Generale">Generale (aereo, noleggio, ecc.)</option>`;
  const currentDay = TRIP_DATA.days.find(d => d.id === currentDayId);
  daySel.value = currentDay ? dayLabel(currentDay) : `Giorno ${currentDayId}`;

  const typeChips = document.getElementById('expTypeChips');
  typeChips.innerHTML = `
    <span class="chip ${selectedType === 'shared' ? 'selected' : ''}" data-type="shared">🤝 Cassa comune</span>
    <span class="chip ${selectedType === 'personal' ? 'selected' : ''}" data-type="personal">👤 Spesa personale</span>
  `;
  typeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedType = chip.dataset.type;
      typeChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
      updateModalFieldsVisibility();
    });
  });

  const sourceChips = document.getElementById('expSourceChips');
  sourceChips.innerHTML = `
    <span class="chip ${selectedSource === 'card' ? 'selected' : ''}" data-src="card">💳 Carta comune</span>
    <span class="chip ${selectedSource === 'person' ? 'selected' : ''}" data-src="person">👤 Anticipato da una persona</span>
  `;
  sourceChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedSource = chip.dataset.src;
      sourceChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
      updateModalFieldsVisibility();
    });
  });

  const paidBySel = document.getElementById('expPaidBy');
  paidBySel.innerHTML = participants.map(p => `<option value="${p}">${p}</option>`).join('');

  const chipRow = document.getElementById('expCategoryChips');
  chipRow.innerHTML = TRIP_DATA.budget_categories.map(c =>
    `<span class="chip ${c === selectedCategory ? 'selected' : ''}" data-cat="${c}">${c}</span>`
  ).join('');
  chipRow.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedCategory = chip.dataset.cat;
      chipRow.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
    });
  });

  document.getElementById('expAmount').value = '';
  document.getElementById('expNote').value = '';
  updateModalFieldsVisibility();
  expModalBackdrop.classList.add('open');
  lockBodyScroll();
}

document.getElementById('fabAddExpenseTop').addEventListener('click', openExpenseModal);
document.getElementById('fabAddExpenseDesktop').addEventListener('click', openExpenseModal);
document.getElementById('expCancel').addEventListener('click', () => { expModalBackdrop.classList.remove('open'); unlockBodyScroll(); });
expModalBackdrop.addEventListener('click', (e) => { if (e.target === expModalBackdrop) { expModalBackdrop.classList.remove('open'); unlockBodyScroll(); } });

document.getElementById('expSave').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('expAmount').value);
  if (!amount || amount <= 0) {
    document.getElementById('expAmount').focus();
    return;
  }
  const isShared = selectedType === 'shared';
  const paymentSource = isShared ? selectedSource : 'person'; // le spese personali sono sempre "di una persona"
  const entry = {
    day: document.getElementById('expDay').value,
    category: selectedCategory,
    amount: amount,
    note: document.getElementById('expNote').value.trim(),
    paidBy: paymentSource === 'card' ? null : document.getElementById('expPaidBy').value,
    shared: isShared,
    paymentSource: paymentSource,
    ts: Date.now(),
  };
  if (typeof db !== 'undefined' && db) {
    // Firestore: la spesa arriva a tutti i dispositivi collegati tramite onSnapshot,
    // che si occupa anche di aggiornare la vista — non serve fare altro qui.
    db.collection('expenses').add(entry).catch((err) => {
      console.warn('Salvataggio su Firestore fallito, salvo solo in locale:', err);
      entry.id = 'e' + Date.now() + Math.random().toString(36).slice(2, 7);
      expenses.push(entry);
      saveStore(STORE_KEYS.expenses, expenses);
      if (currentView === 'budget') renderBudget();
    });
  } else {
    entry.id = 'e' + Date.now() + Math.random().toString(36).slice(2, 7);
    expenses.push(entry);
    saveStore(STORE_KEYS.expenses, expenses);
    if (currentView === 'budget') renderBudget();
  }
  expModalBackdrop.classList.remove('open');
  unlockBodyScroll();
  if (currentView === 'budget') renderBudget();
});

// ---------------- export / backup ----------------
document.getElementById('exportBtn').addEventListener('click', () => {
  const payload = { doneStops, personalNotes, expenses, participants, startTimes, durationOverrides, cardTopups, descriptionOverrides, noteOverrides, priorityOverrides, suggestions, photoOverrides, mapsOverrides, hiddenStops, customStopsByDay, pernottamentoPhoto, pernottamentoNote, pernottamentoFieldOverrides, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `islanda-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('importBackupFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      alert('File non valido: assicurati di aver selezionato un backup .json esportato da questa app.');
      e.target.value = '';
      return;
    }
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('it-IT') : 'data sconosciuta';
    const ok = confirm(`Importare questo backup (creato il ${when})?\n\nSovrascriverà TUTTE le modifiche attuali su questo dispositivo (spese, note, descrizioni, priorità, foto, ecc.) con quelle contenute nel file.`);
    if (!ok) { e.target.value = ''; return; }

    const fields = [
      ['doneStops', STORE_KEYS.done],
      ['personalNotes', STORE_KEYS.notes],
      ['expenses', STORE_KEYS.expenses],
      ['participants', STORE_KEYS.participants],
      ['startTimes', STORE_KEYS.startTimes],
      ['durationOverrides', STORE_KEYS.durationOverrides],
      ['cardTopups', STORE_KEYS.cardTopups],
      ['descriptionOverrides', STORE_KEYS.descriptionOverrides],
      ['noteOverrides', STORE_KEYS.noteOverrides],
      ['priorityOverrides', STORE_KEYS.priorityOverrides],
      ['suggestions', STORE_KEYS.suggestions],
      ['photoOverrides', STORE_KEYS.photoOverrides],
      ['mapsOverrides', STORE_KEYS.mapsOverrides],
      ['hiddenStops', STORE_KEYS.hiddenStops],
      ['customStopsByDay', STORE_KEYS.customStops],
      ['pernottamentoPhoto', STORE_KEYS.pernottamentoPhoto],
      ['pernottamentoNote', STORE_KEYS.pernottamentoNote],
      ['pernottamentoFieldOverrides', STORE_KEYS.pernottamentoFields],
    ];
    fields.forEach(([field, storeKey]) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        saveStore(storeKey, data[field]);
      }
    });

    // ricarica lo stato in memoria dai valori appena salvati
    doneStops = loadStore(STORE_KEYS.done, {});
    personalNotes = loadStore(STORE_KEYS.notes, {});
    expenses = loadStore(STORE_KEYS.expenses, []);
    participants = loadStore(STORE_KEYS.participants, participants);
    startTimes = loadStore(STORE_KEYS.startTimes, {});
    durationOverrides = loadStore(STORE_KEYS.durationOverrides, {});
    cardTopups = loadStore(STORE_KEYS.cardTopups, []);
    descriptionOverrides = loadStore(STORE_KEYS.descriptionOverrides, {});
    noteOverrides = loadStore(STORE_KEYS.noteOverrides, {});
    priorityOverrides = loadStore(STORE_KEYS.priorityOverrides, {});
    suggestions = loadStore(STORE_KEYS.suggestions, []);
    photoOverrides = loadStore(STORE_KEYS.photoOverrides, {});
    mapsOverrides = loadStore(STORE_KEYS.mapsOverrides, {});
    hiddenStops = loadStore(STORE_KEYS.hiddenStops, {});
    customStopsByDay = loadStore(STORE_KEYS.customStops, {});
    pernottamentoPhoto = loadStore(STORE_KEYS.pernottamentoPhoto, {});
    pernottamentoNote = loadStore(STORE_KEYS.pernottamentoNote, {});
    pernottamentoFieldOverrides = loadStore(STORE_KEYS.pernottamentoFields, {});

    renderDayTabs();
    renderDayView();
    if (currentView === 'budget') renderBudget();
    if (currentView === 'info') renderInfo();

    alert('Backup importato con successo.');
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ---------------- online/offline status ----------------
function updateNetStatus() {
  const el = document.getElementById('netStatus');
  const txt = document.getElementById('netStatusText');
  if (navigator.onLine) {
    el.classList.remove('offline');
    txt.textContent = 'online';
  } else {
    el.classList.add('offline');
    txt.textContent = 'offline';
  }
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

// ---------------- install banner ----------------
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
if (!window.matchMedia('(display-mode: standalone)').matches) {
  document.getElementById('installBanner').classList.add('show');
}

// ---------------- service worker ----------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------------- init ----------------
renderDayTabs();
renderDayView();
updateNetStatus();
