// ============================================================
// Islanda On The Road — app logic
// Tutti i dati utente (spese, tappe completate, note) vivono
// SOLO in localStorage sul dispositivo. Nessun server.
// ============================================================

const STORE_KEYS = {
  done: 'iceland_done_stops_v1',
  notes: 'iceland_notes_v1',
  expenses: 'iceland_expenses_v1',
  settlements: 'iceland_settlements_v1',
  customSections: 'iceland_custom_sections_v1',
  dayNotes: 'iceland_day_notes_v1',
  dayStartLocation: 'iceland_day_start_location_v1',
  iskRateCache: 'iceland_isk_rate_cache_v1',
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
  stopOrder: 'iceland_stop_order_v1',
  pernottamentoPhoto: 'iceland_pernottamento_photo_v1',
  pernottamentoNote: 'iceland_pernottamento_note_v1',
  pernottamentoFields: 'iceland_pernottamento_fields_v1',
  keyMigrationDone: 'iceland_key_migration_v1',
  photoKeyMigrationDone: 'iceland_photo_key_migration_v1',
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
let settlements = loadStore(STORE_KEYS.settlements, []); // [{id, from, to, amount, note, ts}] — pagamenti di saldo tra persone
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

// ---------------- sincronizzazione pagamenti di saldo (Firestore, se disponibile) ----------------
let settlementsFirestoreConnected = false;
if (typeof db !== 'undefined' && db) {
  db.collection('settlements').orderBy('ts', 'asc').onSnapshot((snapshot) => {
    settlementsFirestoreConnected = true;
    settlements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    saveStore(STORE_KEYS.settlements, settlements);
    if (typeof currentView !== 'undefined' && currentView === 'budget') renderBudget();
  }, (err) => {
    console.warn('Firestore non raggiungibile, uso la copia locale dei pagamenti:', err);
  });
}

// ---------------- sincronizzazione sezioni di note personalizzate (Firestore, se disponibile) ----------------
let customSections = loadStore(STORE_KEYS.customSections, []); // [{id, title, text, ts}]
let customSectionsFirestoreConnected = false;
if (typeof db !== 'undefined' && db) {
  db.collection('customSections').orderBy('ts', 'asc').onSnapshot((snapshot) => {
    customSectionsFirestoreConnected = true;
    customSections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    saveStore(STORE_KEYS.customSections, customSections);
    if (typeof currentView !== 'undefined' && currentView === 'utili') renderUtili();
  }, (err) => {
    console.warn('Firestore non raggiungibile, uso la copia locale delle note personalizzate:', err);
  });
}

// ---------------- sincronizzazione note dell'intera giornata (Firestore, se disponibile) ----------------
let dayNotes = loadStore(STORE_KEYS.dayNotes, {}); // { "1": "testo libero sulla giornata", ... }
function saveDayNote(dayId) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('daynote_' + dayId);
  db.collection('sharedDayNotes').doc(docId).set({ dayId: String(dayId), text: dayNotes[dayId] || '' }).catch((err) => {
    console.warn('Salvataggio nota giornata su Firestore fallito:', err);
    alert(`⚠️ Questa nota NON è stata condivisa/salvata in modo permanente. Errore: ${err.code || err.message || err}`);
  });
}
if (typeof db !== 'undefined' && db) {
  let dayNotesFirstSync = true;
  db.collection('sharedDayNotes').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.dayId !== undefined) remote[d.dayId] = d.text || '';
    });
    if (dayNotesFirstSync && !snapshot.metadata.fromCache) {
      dayNotesFirstSync = false;
      Object.keys(dayNotes).forEach(dayId => { if (!(dayId in remote)) saveDayNote(dayId); });
    }
    dayNotes = remote;
    saveStore(STORE_KEYS.dayNotes, dayNotes);
    if (typeof currentDayId !== 'undefined' && typeof renderDayView === 'function' && typeof currentView !== 'undefined' && currentView === 'days') {
      const ta = document.getElementById('dayNoteTextarea');
      if (ta && document.activeElement !== ta) ta.value = dayNotes[currentDayId] || '';
    }
  }, (err) => {
    console.warn('Firestore (note giornata) non raggiungibile, uso la copia locale:', err);
  });
}

// ---------------- sincronizzazione punto di partenza personalizzato (Firestore, se disponibile) ----------------
// Il "da" della prima tappa imperdibile di un giorno di solito viene dal pernottamento della notte
// prima; se cambi struttura/zona di un pernottamento, questo permette di correggere anche il punto
// di partenza del giorno successivo, che altrimenti resterebbe quello vecchio.
let dayStartLocationOverrides = loadStore(STORE_KEYS.dayStartLocation, {}); // { "5": "Egilsstaðir", ... }
function saveDayStartLocation(dayId) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('daystartloc_' + dayId);
  if (dayStartLocationOverrides[dayId] === undefined) {
    db.collection('sharedDayStartLocations').doc(docId).delete().catch((err) => console.warn('Eliminazione punto di partenza fallita:', err));
    return;
  }
  db.collection('sharedDayStartLocations').doc(docId).set({ dayId: String(dayId), text: dayStartLocationOverrides[dayId] }).catch((err) => {
    console.warn('Salvataggio punto di partenza su Firestore fallito:', err);
    alert(`⚠️ Questa modifica NON è stata salvata in modo permanente. Errore: ${err.code || err.message || err}`);
  });
}
if (typeof db !== 'undefined' && db) {
  let dayStartLocFirstSync = true;
  db.collection('sharedDayStartLocations').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.dayId !== undefined) remote[d.dayId] = d.text || '';
    });
    if (dayStartLocFirstSync && !snapshot.metadata.fromCache) {
      dayStartLocFirstSync = false;
      Object.keys(dayStartLocationOverrides).forEach(dayId => { if (!(dayId in remote)) saveDayStartLocation(dayId); });
    }
    dayStartLocationOverrides = remote;
    saveStore(STORE_KEYS.dayStartLocation, dayStartLocationOverrides);
    if (typeof currentDayId !== 'undefined' && typeof renderDayView === 'function' && typeof currentView !== 'undefined' && currentView === 'days') renderDayView();
  }, (err) => {
    console.warn('Firestore (punto di partenza) non raggiungibile, uso la copia locale:', err);
  });
}

// ---------------- sincronizzazione orario di partenza mattutina (Firestore, se disponibile) ----------------
function saveStartTime(dayId) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('starttime_' + dayId);
  if (startTimes[dayId] === undefined) {
    db.collection('sharedStartTimes').doc(docId).delete().catch((err) => console.warn('Eliminazione orario partenza fallita:', err));
    return;
  }
  db.collection('sharedStartTimes').doc(docId).set({ dayId: String(dayId), time: startTimes[dayId] }).catch((err) => {
    console.warn('Salvataggio orario partenza su Firestore fallito:', err);
    alert(`⚠️ L'orario di partenza NON è stato salvato in modo permanente (resta solo su questo dispositivo). Errore: ${err.code || err.message || err}`);
  });
}
if (typeof db !== 'undefined' && db) {
  let startTimesFirstSync = true;
  db.collection('sharedStartTimes').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.dayId !== undefined) remote[d.dayId] = d.time;
    });
    if (startTimesFirstSync && !snapshot.metadata.fromCache) {
      startTimesFirstSync = false;
      Object.keys(startTimes).forEach(dayId => { if (!(dayId in remote)) saveStartTime(dayId); });
    }
    startTimes = remote;
    saveStore(STORE_KEYS.startTimes, startTimes);
    if (typeof currentDayId !== 'undefined' && typeof renderDayView === 'function' && typeof currentView !== 'undefined' && currentView === 'days') {
      renderDayView();
    }
  }, (err) => {
    console.warn('Firestore (orari partenza) non raggiungibile, uso la copia locale:', err);
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
let stopOrderByDay = loadStore(STORE_KEYS.stopOrder, {}); // { "1": ["1::Þórufoss", "1::Brúarfoss", ...] }

// ---------------- sincronizzazione tappe personalizzate (Firestore, se disponibile) ----------------
// Un documento per tappa aggiunta dall'utente (o spostata da un altro giorno): permanente e uguale
// su ogni dispositivo, come tutto il resto.
function saveCustomStop(dayId, entry) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('customstop_' + entry.key);
  db.collection('sharedCustomStops').doc(docId).set({ dayId: String(dayId), ...entry }).catch((err) => {
    console.warn('Salvataggio tappa personalizzata su Firestore fallito:', err);
    alert(`⚠️ Questa tappa NON è stata condivisa/salvata in modo permanente. Errore: ${err.code || err.message || err}`);
  });
}
function deleteCustomStopFromFirestore(key) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('customstop_' + key);
  db.collection('sharedCustomStops').doc(docId).delete().catch((err) => console.warn('Eliminazione tappa personalizzata fallita:', err));
}
if (typeof db !== 'undefined' && db) {
  let customStopsFirstSync = true;
  db.collection('sharedCustomStops').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (!d || d.dayId === undefined || !d.key) return;
      if (!remote[d.dayId]) remote[d.dayId] = [];
      const { dayId, ...entry } = d;
      remote[d.dayId].push(entry);
    });
    if (customStopsFirstSync && !snapshot.metadata.fromCache) {
      customStopsFirstSync = false;
      Object.keys(customStopsByDay).forEach(dayId => {
        (customStopsByDay[dayId] || []).forEach(entry => {
          const already = (remote[dayId] || []).some(e => e.key === entry.key);
          if (!already) saveCustomStop(dayId, entry);
        });
      });
    }
    customStopsByDay = remote;
    saveStore(STORE_KEYS.customStops, customStopsByDay);
    if (typeof renderDayView === 'function' && typeof currentDayId !== 'undefined' && typeof currentView !== 'undefined' && currentView === 'days') renderDayView();
  }, (err) => {
    console.warn('Firestore (tappe personalizzate) non raggiungibile, uso la copia locale:', err);
  });
}

// ---------------- sincronizzazione ordine tappe (Firestore, se disponibile) ----------------
// Un documento per giorno, con l'elenco delle chiavi nell'ordine scelto: così il riordino fatto
// da chiunque (con trascinamento) diventa permanente e uguale su tutti i dispositivi.
function saveStopOrder(dayId) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('order_' + dayId);
  db.collection('sharedStopOrder').doc(docId).set({ dayId: String(dayId), order: stopOrderByDay[dayId] || [] }).catch((err) => {
    console.warn('Salvataggio ordine tappe su Firestore fallito:', err);
    alert(`⚠️ Il nuovo ordine NON è stato condiviso/salvato in modo permanente (resta solo su questo dispositivo).\n\nErrore Firebase: ${err.code || err.message || err}\n\nSegnalalo così com'è.`);
  });
}
let stopOrderFirestoreConnected = false;
if (typeof db !== 'undefined' && db) {
  let orderFirstSync = true;
  db.collection('sharedStopOrder').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.dayId !== undefined) remote[d.dayId] = d.order || [];
    });
    if (orderFirstSync && !snapshot.metadata.fromCache) {
      orderFirstSync = false;
      Object.keys(stopOrderByDay).forEach(dayId => {
        if (!(dayId in remote)) saveStopOrder(dayId);
      });
    }
    stopOrderByDay = remote;
    saveStore(STORE_KEYS.stopOrder, stopOrderByDay);
    stopOrderFirestoreConnected = true;
    if (typeof renderDayView === 'function' && typeof currentDayId !== 'undefined') renderDayView();
  }, (err) => {
    console.warn('Firestore (ordine tappe) non raggiungibile, uso la copia locale:', err);
  });
}
let pernottamentoPhoto = loadStore(STORE_KEYS.pernottamentoPhoto, {}); // { "1": "data:..." oppure "https://...", ... }
let pernottamentoNote = loadStore(STORE_KEYS.pernottamentoNote, {}); // { "1": "testo libero", ... }
let pernottamentoFieldOverrides = loadStore(STORE_KEYS.pernottamentoFields, {}); // { "1": {bagno:"Privato", cucina:"Sì", ...}, ... }

// ---------------- sincronizzazione dati pernottamento (Firestore, se disponibile) ----------------
// Camere/bagno/cucina/orari/note dei pernottamenti erano rimasti solo locali, a differenza di
// spese e foto: una pulizia della cache li cancellava per sempre senza modo di recuperarli. Da qui
// in avanti passano anche loro da Firestore, così restano permanenti e uguali su ogni dispositivo.
let pernottamentoDataFirestoreConnected = false;
function savePernottamentoData(notte) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('pern_' + notte);
  const payload = { notte: String(notte), fields: pernottamentoFieldOverrides[notte] || {}, note: pernottamentoNote[notte] || '' };
  db.collection('sharedPernottamentoData').doc(docId).set(payload).catch((err) => {
    console.warn('Salvataggio dati pernottamento su Firestore fallito:', err);
    alert(`⚠️ Questi dati del pernottamento NON sono stati condivisi/salvati in modo permanente (restano solo su questo dispositivo, a rischio se pulisci la cache).\n\nErrore Firebase: ${err.code || err.message || err}\n\nSegnalalo così com'è.`);
  });
}
if (typeof db !== 'undefined' && db) {
  let pernFirstSync = true;
  db.collection('sharedPernottamentoData').onSnapshot((snapshot) => {
    const remoteFields = {};
    const remoteNotes = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (!d || d.notte === undefined) return;
      remoteFields[d.notte] = d.fields || {};
      remoteNotes[d.notte] = d.note || '';
    });

    if (pernFirstSync && !snapshot.metadata.fromCache) {
      pernFirstSync = false;
      // prima sincronizzazione: quello che c'era già solo in locale viene caricato su Firestore
      const allNotti = new Set([...Object.keys(pernottamentoFieldOverrides), ...Object.keys(pernottamentoNote)]);
      allNotti.forEach(notte => {
        if (!(notte in remoteFields) && !(notte in remoteNotes)) savePernottamentoData(notte);
      });
    }

    pernottamentoFieldOverrides = remoteFields;
    pernottamentoNote = remoteNotes;
    saveStore(STORE_KEYS.pernottamentoFields, pernottamentoFieldOverrides);
    saveStore(STORE_KEYS.pernottamentoNote, pernottamentoNote);
    pernottamentoDataFirestoreConnected = true;

    // aggiorna la vista aperta in questo momento, se pertinente
    if (typeof currentView !== 'undefined' && currentView === 'info') renderInfo();
    if (typeof currentStayNotte !== 'undefined' && currentStayNotte && typeof TRIP_DATA !== 'undefined') {
      const rawP = TRIP_DATA.pernottamenti.find(x => String(x.notte) === currentStayNotte);
      if (rawP) renderStayInfoGrid(rawP);
    }
  }, (err) => {
    console.warn('Firestore (dati pernottamento) non raggiungibile, uso la copia locale:', err);
  });
}

// ---------------- sincronizzazione modifiche alle tappe (Firestore, se disponibile) ----------------
// Descrizione, note pratiche, priorità, posizione Maps e orari personalizzati di ogni tappa passano
// da Firestore, un documento per tappa (con la chiave vera come campo, non come nome del
// documento — niente più problemi con "/"). Anche la PRIORITÀ è qui dentro (dal momento in cui il
// giro è stato definito insieme, condivisa e permanente come tutto il resto — prima era locale
// apposta per permettere il voto personale di ciascuno prima di decidere).
let stopOverridesFirestoreConnected = false;
function saveStopOverrideData(key) {
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('stopov_' + key);
  const payload = {
    key,
    description: Object.prototype.hasOwnProperty.call(descriptionOverrides, key) ? descriptionOverrides[key] : null,
    note: Object.prototype.hasOwnProperty.call(noteOverrides, key) ? noteOverrides[key] : null,
    priority: Object.prototype.hasOwnProperty.call(priorityOverrides, key) ? priorityOverrides[key] : null,
    mapsPosition: Object.prototype.hasOwnProperty.call(mapsOverrides, key) ? mapsOverrides[key] : null,
    duration: Object.prototype.hasOwnProperty.call(durationOverrides, key) ? durationOverrides[key] : null,
  };
  db.collection('sharedStopOverrides').doc(docId).set(payload).catch((err) => {
    console.warn('Salvataggio modifica tappa su Firestore fallito:', err);
    alert(`⚠️ Questa modifica NON è stata condivisa/salvata in modo permanente (resta solo su questo dispositivo, a rischio se pulisci la cache).\n\nErrore Firebase: ${err.code || err.message || err}\n\nSegnalalo così com'è.`);
  });
}
if (typeof db !== 'undefined' && db) {
  let stopOvFirstSync = true;
  db.collection('sharedStopOverrides').onSnapshot((snapshot) => {
    const newDesc = {}, newNote = {}, newPri = {}, newMaps = {}, newDur = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (!d || !d.key) return;
      if (d.description !== null && d.description !== undefined) newDesc[d.key] = d.description;
      if (d.note !== null && d.note !== undefined) newNote[d.key] = d.note;
      if (d.priority !== null && d.priority !== undefined) newPri[d.key] = d.priority;
      if (d.mapsPosition !== null && d.mapsPosition !== undefined) newMaps[d.key] = d.mapsPosition;
      if (d.duration !== null && d.duration !== undefined) newDur[d.key] = d.duration;
    });

    if (stopOvFirstSync && !snapshot.metadata.fromCache) {
      stopOvFirstSync = false;
      // prima sincronizzazione: quello che c'era già solo in locale (comprese le priorità già
      // decise) viene caricato su Firestore, così non si perde
      const allKeys = new Set([
        ...Object.keys(descriptionOverrides), ...Object.keys(noteOverrides), ...Object.keys(priorityOverrides),
        ...Object.keys(mapsOverrides), ...Object.keys(durationOverrides),
      ]);
      allKeys.forEach(key => {
        if (!(key in newDesc) && !(key in newNote) && !(key in newPri) && !(key in newMaps) && !(key in newDur)) {
          saveStopOverrideData(key);
        }
      });
    }

    descriptionOverrides = newDesc;
    noteOverrides = newNote;
    priorityOverrides = newPri;
    mapsOverrides = newMaps;
    durationOverrides = newDur;
    saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
    saveStore(STORE_KEYS.noteOverrides, noteOverrides);
    saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
    saveStore(STORE_KEYS.mapsOverrides, mapsOverrides);
    saveStore(STORE_KEYS.durationOverrides, durationOverrides);
    stopOverridesFirestoreConnected = true;

    // aggiorna la vista aperta in questo momento
    if (typeof renderDayView === 'function' && typeof currentDayId !== 'undefined') renderDayView();
    if (currentDetailDay && currentDetailKey) {
      const s = getStopByKey(currentDetailDay, currentDetailKey);
      if (s) {
        renderDetailDescription(currentDetailKey, s);
        renderDetailNote(currentDetailKey, s);
        renderPriorityChips(currentDetailDay, currentDetailKey, s, getEffectivePriority(currentDetailKey, s));
        renderDetailMapsLink(currentDetailDay, currentDetailKey, s);
      }
    }
  }, (err) => {
    console.warn('Firestore (modifiche tappe) non raggiungibile, uso la copia locale:', err);
  });
}

// ---------------- migrazione una tantum: dalla vecchia chiave "posizione" alla nuova chiave "nome" ----------------
// Fino a poco fa le modifiche (descrizioni, note, priorità, foto...) erano agganciate alla posizione
// numerica di una tappa nel giorno. Se una tappa veniva aggiunta o tolta in mezzo alle altre, tutte le
// modifiche successive si spostavano per sbaglio sulla tappa "vicina". Questa funzione recupera quello
// che era già stato scritto, spostandolo alla nuova chiave stabile basata sul nome della tappa.
//
// IMPORTANTE: il recupero automatico è sicuro (e quindi attivo) SOLO per i giorni che non hanno mai
// cambiato l'ordine/il numero delle tappe. Per i giorni 3, 6, 7, 8, 9 — ristrutturati più volte nel
// tempo — non si può più risalire con certezza a quale posizione avesse una tappa quando il testo è
// stato scritto: tentare comunque rischierebbe di agganciare un testo alla tappa SBAGLIATA, un errore
// peggiore di lasciarlo semplicemente non recuperato. Per quei giorni non facciamo nulla in automatico.
const DAYS_SAFE_FOR_KEY_MIGRATION = [0, 1, 2, 4, 5, 10, 11, 12, 13, 14];

function migrateStopKeysToNameBased() {
  if (loadStore(STORE_KEYS.keyMigrationDone, false)) return; // già fatto in passato, non rifare
  if (typeof TRIP_DATA === 'undefined' || !TRIP_DATA.days) return;

  const flatStores = [
    [descriptionOverrides, STORE_KEYS.descriptionOverrides],
    [noteOverrides, STORE_KEYS.noteOverrides],
    [priorityOverrides, STORE_KEYS.priorityOverrides],
    [photoOverrides, STORE_KEYS.photoOverrides],
    [mapsOverrides, STORE_KEYS.mapsOverrides],
    [durationOverrides, STORE_KEYS.durationOverrides],
    [personalNotes, STORE_KEYS.notes],
  ];

  TRIP_DATA.days.filter(day => DAYS_SAFE_FOR_KEY_MIGRATION.includes(day.id)).forEach(day => {
    (day.stops || []).forEach((s, idx) => {
      if (!s.a) return;
      const oldKey = `${day.id}_${idx}`;
      const newKey = stopKeyByName(day.id, s.a);
      if (oldKey === newKey) return;

      flatStores.forEach(([store]) => {
        if (Object.prototype.hasOwnProperty.call(store, oldKey) && !Object.prototype.hasOwnProperty.call(store, newKey)) {
          store[newKey] = store[oldKey];
        }
      });

      // doneStops: { [dayId]: [key1, key2, ...] }
      const doneArr = doneStops[day.id];
      if (Array.isArray(doneArr) && doneArr.includes(oldKey) && !doneArr.includes(newKey)) {
        doneArr.push(newKey);
      }

      // hiddenStops: { [key]: true }
      if (hiddenStops[oldKey] && !hiddenStops[newKey]) {
        hiddenStops[newKey] = true;
      }
    });
  });

  flatStores.forEach(([store, storeKey]) => saveStore(storeKey, store));
  saveStore(STORE_KEYS.done, doneStops);
  saveStore(STORE_KEYS.hiddenStops, hiddenStops);
  saveStore(STORE_KEYS.keyMigrationDone, true);
  console.log('Migrazione delle chiavi (posizione → nome) completata per i giorni stabili.');
}
migrateStopKeysToNameBased();

// ---------------- sincronizzazione foto condivise (Firestore, se disponibile) ----------------
// Restiamo dentro Firestore (niente Firebase Storage): le foto sono già compresse abbastanza
// da stare comode nel limite di 1 MB per documento, e così evitiamo di dover attivare un
// piano a pagamento solo per lo spazio file.
let photosFirestoreConnected = false;
if (typeof db !== 'undefined' && db) {
  let photosFirstSync = true;
  db.collection('sharedPhotos').onSnapshot((snapshot) => {
    // i documenti "nuovi" hanno i campi key/type/value; quelli vecchi (da prima di questa
    // modifica) hanno solo "value" e vanno riconosciuti dal prefisso del nome del documento
    const newPhotoOverrides = {};
    const newPernottamentoPhoto = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.key && d.type) {
        if (d.type === 'stop') newPhotoOverrides[d.key] = d.value;
        else if (d.type === 'stay') newPernottamentoPhoto[d.key] = d.value;
      } else if (doc.id.startsWith('stop_')) {
        newPhotoOverrides[doc.id.slice(5)] = d.value; // formato precedente, senza "/" nel nome
      } else if (doc.id.startsWith('stay_')) {
        newPernottamentoPhoto[doc.id.slice(5)] = d.value;
      }
    });

    if (photosFirstSync && !snapshot.metadata.fromCache) {
      photosFirstSync = false;
      // prima sincronizzazione: le foto già presenti solo in locale (da prima che Firestore
      // fosse collegato) vengono caricate su Firestore, così non si perdono
      Object.keys(photoOverrides).forEach(key => {
        if (!(key in newPhotoOverrides)) savePhotoValue(key, 'stop', photoOverrides[key]);
      });
      Object.keys(pernottamentoPhoto).forEach(notte => {
        if (!(notte in newPernottamentoPhoto)) savePhotoValue(notte, 'stay', pernottamentoPhoto[notte]);
      });
    }

    photoOverrides = newPhotoOverrides;
    pernottamentoPhoto = newPernottamentoPhoto;
    saveStore(STORE_KEYS.photoOverrides, photoOverrides);
    saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
    photosFirestoreConnected = true;

    // aggiorna la vista aperta in questo momento, se pertinente
    if (currentDetailDay && currentDetailKey) {
      const s = getStopByKey(currentDetailDay, currentDetailKey);
      if (s) {
        loadDetailPhoto(currentDetailKey, s);
        const isStayNow = !!(s.a && /pernottamento/i.test(s.a));
        if (isStayNow) renderStayInfoSection(currentDetailDay, s);
      }
    }
    if (typeof currentView !== 'undefined' && currentView === 'info') renderInfo();
  }, (err) => {
    console.warn('Firestore (foto) non raggiungibile, uso la copia locale:', err);
  });

  // migrazione una tantum: le foto salvate su Firestore con la vecchia chiave posizionale
  // (es. "stop_8_6") vengono copiate anche sotto la nuova chiave basata sul nome
  // (es. "stop_8::Þrístapar"), così tornano visibili su tutti i dispositivi, non solo su questo.
  (async function migrateFirestorePhotoKeys() {
    if (loadStore(STORE_KEYS.photoKeyMigrationDone, false)) return;
    if (typeof TRIP_DATA === 'undefined' || !TRIP_DATA.days) return;
    try {
      const snapshot = await db.collection('sharedPhotos').get();
      const existing = {};
      snapshot.docs.forEach(d => { existing[d.id] = d.data(); });
      const oldFormatIds = Object.keys(existing).filter(id => /^stop_\d+_\d+$/.test(id));

      const toWrite = [];
      TRIP_DATA.days.filter(day => DAYS_SAFE_FOR_KEY_MIGRATION.includes(day.id)).forEach(day => {
        (day.stops || []).forEach((s, idx) => {
          if (!s.a) return;
          const oldId = `stop_${day.id}_${idx}`;
          const realKey = stopKeyByName(day.id, s.a);
          const newId = firestoreSafeDocId(`stop_${realKey}`);
          if (oldId === newId) return;
          if (existing[oldId] && !existing[newId]) {
            toWrite.push([newId, { key: realKey, type: 'stop', value: existing[oldId].value }]);
          }
        });
      });

      if (toWrite.length) {
        const batch = db.batch();
        toWrite.forEach(([id, data]) => batch.set(db.collection('sharedPhotos').doc(id), data));
        await batch.commit();
        console.log(`Migrazione foto su Firestore completata: ${toWrite.length} foto spostate alla nuova chiave.`);
      }
      saveStore(STORE_KEYS.photoKeyMigrationDone, true);
    } catch (err) {
      // migrazione storica, ormai poco rilevante a questo punto del viaggio: se fallisce (es. per
      // permessi) non blocchiamo più l'utente con un avviso a ogni apertura, la segniamo comunque
      // come fatta così non ritenta all'infinito
      console.warn('Migrazione foto su Firestore non riuscita, la salto silenziosamente:', err);
      saveStore(STORE_KEYS.photoKeyMigrationDone, true);
    }
  })();
}
const PERNOTTAMENTO_EDITABLE_FIELDS = [
  ['struttura', '🏨', 'Nome struttura'],
  ['localita', '📍', 'Località'],
  ['n_camere', '🛏', 'N. camere'],
  ['camere', '🛏', 'Camere (descrizione)'],
  ['bagno', '🚿', 'Bagno'],
  ['cucina', '🍳', 'Cucina'],
  ['colazione', '🥐', 'Colazione'],
  ['ci_orario', '🕗', 'Check-in dalle'],
  ['ci_orario_fine', '🕗', 'Check-in fino alle'],
  ['co_orario', '🕓', 'Check-out entro le'],
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
// Come getEffectiveMapsDestination, ma pensata per essere passata a Google Directions/Geocoder:
// quei servizi non sanno interpretare un link completo di Google Maps (solo coordinate, un
// indirizzo testuale, o un oggetto {lat,lng}) — qui lo gestiamo, provando a estrarre le
// coordinate anche da dentro un link se necessario, con il nome della tappa come ultima spiaggia.
function resolveDirectionsLocation(day, key, s) {
  const raw = getEffectiveMapsDestination(day, key, s).trim();
  const coordMatch = raw.match(/^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/);
  if (coordMatch) {
    const [lat, lng] = raw.split(',').map(v => parseFloat(v.trim()));
    return { lat, lng };
  }
  if (/^https?:\/\//i.test(raw)) {
    const m = raw.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
    return `${s.a}, Iceland`; // link senza coordinate estraibili: usa il nome come ripiego
  }
  return raw; // testo/indirizzo semplice, va bene così com'è
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
// La chiave di ogni tappa originale è basata sul suo NOME (non sulla posizione): così se in futuro
// aggiungo, tolgo o sposto una tappa in mezzo alle altre, tutte le modifiche già fatte (descrizioni,
// note, priorità, foto...) restano agganciate al posto giusto invece di spostarsi per sbaglio.
function stopKeyByName(dayId, name) { return `${dayId}::${name}`; }
// Etichetta del giorno mostrata ovunque nell'app: "Arrivo" (id 0) è diventato "Giorno 1", e tutti
// gli altri sono scalati di conseguenza (id 1 -> "Giorno 2", ... id 14 -> "Giorno 15"), così l'intero
// viaggio è numerato in sequenza semplice senza più l'etichetta "Arrivo" a parte.
function getDayLabel(day) { return day.label || `Giorno ${day.id + 1}`; }
// Ordine "naturale" (quello originale, senza tener conto di eventuali spostamenti con le frecce):
// serve per capire quale tappa veniva PRIMA di una certa tappa nell'itinerario di partenza, e quindi
// se il tempo di guida mostrato (calcolato per quel tragitto) è ancora valido dopo un riordino.
function getNaturalPredecessorMap(day) {
  const base = day.stops.map((s) => stopKeyByName(day.id, s.a));
  const custom = (customStopsByDay[day.id] || []).map(c => c.key);
  const naturalOrder = base.concat(custom);
  const map = {};
  naturalOrder.forEach((key, i) => { map[key] = i > 0 ? naturalOrder[i - 1] : null; });
  return map;
}
function getMergedStops(day) {
  const base = day.stops.map((s, i) => ({ key: stopKeyByName(day.id, s.a), stop: s, custom: false }));
  const custom = (customStopsByDay[day.id] || []).map(c => ({ key: c.key, stop: c, custom: true }));
  const merged = base.concat(custom);

  const order = stopOrderByDay[day.id];
  if (order && order.length) {
    const byKey = {};
    merged.forEach(item => { byKey[item.key] = item; });
    const ordered = [];
    order.forEach(k => { if (byKey[k]) { ordered.push(byKey[k]); delete byKey[k]; } });
    // eventuali tappe nuove non ancora presenti nell'ordine salvato vanno in fondo
    Object.values(byKey).forEach(item => ordered.push(item));
    return ordered;
  }
  return merged;
}
function isStopHidden(key) {
  return !!hiddenStops[key];
}
function setStopHidden(key, hidden) {
  if (hidden) hiddenStops[key] = true;
  else delete hiddenStops[key];
  saveStore(STORE_KEYS.hiddenStops, hiddenStops);
  if (typeof db === 'undefined' || !db) return;
  const docId = firestoreSafeDocId('hidden_' + key);
  if (hidden) {
    db.collection('sharedHiddenStops').doc(docId).set({ key }).catch((err) => console.warn('Salvataggio tappa nascosta fallito:', err));
  } else {
    db.collection('sharedHiddenStops').doc(docId).delete().catch((err) => console.warn('Rimozione tappa nascosta fallita:', err));
  }
}
if (typeof db !== 'undefined' && db) {
  let hiddenStopsFirstSync = true;
  db.collection('sharedHiddenStops').onSnapshot((snapshot) => {
    const remote = {};
    snapshot.docs.forEach(doc => {
      const d = doc.data();
      if (d && d.key) remote[d.key] = true;
    });
    if (hiddenStopsFirstSync && !snapshot.metadata.fromCache) {
      hiddenStopsFirstSync = false;
      Object.keys(hiddenStops).forEach(key => {
        if (!(key in remote)) {
          const docId = firestoreSafeDocId('hidden_' + key);
          db.collection('sharedHiddenStops').doc(docId).set({ key }).catch((err) => console.warn('Migrazione tappa nascosta fallita:', err));
        }
      });
    }
    hiddenStops = remote;
    saveStore(STORE_KEYS.hiddenStops, hiddenStops);
    if (typeof renderDayView === 'function' && typeof currentDayId !== 'undefined' && typeof currentView !== 'undefined' && currentView === 'days') renderDayView();
  }, (err) => {
    console.warn('Firestore (tappe nascoste) non raggiungibile, uso la copia locale:', err);
  });
}
function addCustomStop(dayId, data) {
  const key = `custom_${dayId}_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const entry = { key, da: data.da || '', a: data.a, priorita: data.priorita || null,
    guida: data.guida || '0:00', km: data.km || 0, visita: data.visita || '0:00',
    parcheggio: data.parcheggio ?? null, ingresso: data.ingresso ?? null, note: data.note || '' };
  if (!customStopsByDay[dayId]) customStopsByDay[dayId] = [];
  customStopsByDay[dayId].push(entry);
  saveStore(STORE_KEYS.customStops, customStopsByDay);
  saveCustomStop(dayId, entry);
  return key;
}
function deleteCustomStop(dayId, key) {
  if (!customStopsByDay[dayId]) return;
  customStopsByDay[dayId] = customStopsByDay[dayId].filter(c => c.key !== key);
  saveStore(STORE_KEYS.customStops, customStopsByDay);
  if (hiddenStops[key]) setStopHidden(key, false); // ripulisce anche su Firestore, se serve
  deleteCustomStopFromFirestore(key);
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
  const km = ov.km !== undefined ? ov.km : (stop.km || 0);
  return { guidaMin, visitaMin, km };
}
function computeDayChain(day) {
  let cursor = parseHM(getStartTime(day.id));
  const merged = getMergedStops(day);
  const chain = {}; // key -> {partenza, arrivo, guidaMin, visitaMin, km, hidden}
  merged.forEach(({ key, stop }) => {
    const { guidaMin, visitaMin, km } = getEffectiveDurations(key, stop);
    const hidden = isStopHidden(key);
    const pri = getEffectivePriority(key, stop);
    const isOptional = pri === 'Facoltativa' || pri === 'Da evitare';
    if (hidden || isOptional) {
      // tolta dal calcolo degli orari: non conta nel totale, non sposta gli orari successivi
      // (le facoltative/da evitare sono trattate come le tappe nascoste, finché non diventano imperdibili)
      chain[key] = { partenza: cursor, arrivo: cursor, guidaMin, visitaMin, km, hidden: true };
      return;
    }
    const partenza = cursor;
    const arrivo = cursor + guidaMin;
    chain[key] = { partenza, arrivo, guidaMin, visitaMin, km, hidden: false };
    cursor = arrivo + visitaMin;
  });
  return chain;
}

// ---------------- cassa comune: saldi tra partecipanti ----------------
// Le spese di cassa comune ANTICIPATE DA UNA PERSONA (non pagate con la carta) e le spese
// "personali ma condivise con alcuni" entrano nel calcolo di chi deve dare/ricevere.
// Le spese pagate con la carta comune sono già "della cassa" e non generano debiti tra le persone.
// Le spese davvero personali (nessuna suddivisione) non generano nessun debito.
function computeBalances() {
  const net = {};
  participants.forEach(p => { net[p] = 0; });
  expenses.forEach(e => {
    if (e.paymentSource === 'card') return; // pagata con la carta comune, nessun debito diretto
    if (!e.paidBy || !(e.paidBy in net)) return;
    const group = (e.splitAmong && e.splitAmong.length) ? e.splitAmong.filter(p => p in net)
      : (e.shared === false ? null : participants);
    if (!group || group.length === 0) return; // spesa puramente personale, nessuna suddivisione
    const share = e.amount / group.length;
    const payerInGroup = group.includes(e.paidBy);
    if (payerInGroup) {
      // chi ha pagato è anche tra i beneficiari: gli spetta indietro tutto tranne la sua quota
      net[e.paidBy] += e.amount - share;
      group.forEach(p => { if (p !== e.paidBy) net[p] -= share; });
    } else {
      // chi ha pagato NON è tra i beneficiari (es. ha anticipato un regalo per gli altri):
      // gli va restituito l'intero importo, e la quota si divide solo tra chi è nel gruppo
      net[e.paidBy] += e.amount;
      group.forEach(p => { net[p] -= share; });
    }
  });
  // pagamenti già effettuati tra le persone: riducono il debito corrispondente
  settlements.forEach(st => {
    if (!(st.from in net) || !(st.to in net)) return;
    net[st.from] += st.amount; // chi paga deve meno (o gli spetta di più)
    net[st.to] -= st.amount;   // chi riceve deve dare/ricevere di meno
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
// Calcola quanto "costa" il viaggio a ciascuno — non chi ha materialmente pagato, ma la sua
// quota reale: una spesa comune (es. i voli) va divisa tra tutti quelli coinvolti, indipendentemente
// da chi ha messo la carta o anticipato i soldi (quello lo gestiscono già i Saldi, qui invece
// vogliamo sapere "quanto costa il viaggio a testa").
function computePerPersonSummary() {
  const summary = {};
  participants.forEach(p => { summary[p] = { personalTotal: 0, shareOfCommon: 0, totalCost: 0, count: 0 }; });
  expenses.forEach(e => {
    if (e.paidBy && e.paidBy in summary) summary[e.paidBy].count += 1;
    const group = (e.splitAmong && e.splitAmong.length) ? e.splitAmong.filter(p => p in summary)
      : (e.shared === false ? null : participants);
    if (!group || group.length === 0) {
      // spesa puramente personale: conta solo per chi l'ha sostenuta
      if (e.paidBy && e.paidBy in summary) summary[e.paidBy].personalTotal += e.amount;
      return;
    }
    const share = e.amount / group.length;
    group.forEach(p => { summary[p].shareOfCommon += share; });
  });
  participants.forEach(p => {
    summary[p].totalCost = summary[p].personalTotal + summary[p].shareOfCommon;
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

function buildCheckTimesHtml(p) {
  const parts = [];
  const ciStart = p.ci_orario && String(p.ci_orario).trim();
  const ciEnd = p.ci_orario_fine && String(p.ci_orario_fine).trim();
  if (ciStart && ciEnd) {
    parts.push(`🕗 Check-in: <b>dalle ${ciStart} alle ${ciEnd}</b>`);
  } else if (ciStart) {
    parts.push(`🕗 Check-in: <b>dalle ${ciStart}</b>`);
  } else if (ciEnd) {
    parts.push(`🕗 Check-in: <b>fino alle ${ciEnd}</b>`);
  }
  if (p.co_orario && String(p.co_orario).trim()) parts.push(`🕓 Check-out: <b>entro le ${p.co_orario}</b>`);
  if (!parts.length) return '';
  return `<div class="stay-checktimes">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
}

function renderStayInfoGrid(rawP) {
  const p = getEffectivePernottamento(rawP);
  document.getElementById('detailStayCheckTimes').innerHTML = buildCheckTimesHtml(p);
  const rows = [
    ['🏨', 'Struttura', p.struttura],
    ['📍', 'Località', p.localita],
    ['🛏', 'Camere', p.n_camere ? `${p.n_camere} (${p.camere || ''})`.replace(' ()', '') : (p.camere || '')],
    ['🚿', 'Bagno', p.bagno],
    ['🍳', 'Cucina', p.cucina],
    ['🥐', 'Colazione', p.colazione],
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
  savePernottamentoData(currentStayNotte);
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
  savePernottamentoData(currentStayNotte);
});

// "da" reale nell'ordine attuale (solo per le tappe imperdibili, le uniche incatenate) —
// usata nella scheda dettagliata di una tappa, stessa logica della card nella lista del giorno
function getEffectiveDaForKey(day, key) {
  const s = getStopByKey(day, key);
  if (!s) return '';
  const pri = getEffectivePriority(key, s);
  if (pri === 'Facoltativa' || pri === 'Da evitare') return s.da || '';
  const merged = getMergedStops(day);
  const mainKeys = merged
    .filter(m => !isStopHidden(m.key))
    .filter(m => {
      const p = getEffectivePriority(m.key, m.stop);
      return !(p === 'Facoltativa' || p === 'Da evitare');
    })
    .map(m => m.key);
  const idx = mainKeys.indexOf(key);
  if (idx <= 0) {
    if (Object.prototype.hasOwnProperty.call(dayStartLocationOverrides, day.id)) return dayStartLocationOverrides[day.id];
    return (day.stops[0] && day.stops[0].da) ? day.stops[0].da : (s.da || '');
  }
  const predItem = merged.find(m => m.key === mainKeys[idx - 1]);
  return (predItem && predItem.stop.a) ? predItem.stop.a : (s.da || '');
}

async function openStopDetailModal(day, key) {
  const s = getStopByKey(day, key);
  if (!s) return;
  currentDetailDay = day;
  currentDetailKey = key;
  const chain = computeDayChain(day);
  const { guidaMin, visitaMin, km: effectiveKm } = chain[key];

  const backdrop = document.getElementById('stopDetailBackdrop');
  const eyebrow = document.getElementById('detailEyebrow');
  const titleEl = document.getElementById('detailTitle');
  const badgesBox = document.getElementById('detailBadges');

  eyebrow.textContent = `${getDayLabel(day)} · da ${getEffectiveDaForKey(day, key)}`;
  titleEl.textContent = s.a || '';

  const isStay = renderStayInfoSection(day, s);
  document.getElementById('detailPrioritySection').style.display = isStay ? 'none' : '';

  const effPriority = getEffectivePriority(key, s);
  let badges = '';
  if (guidaMin > 0) badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${effectiveKm ? ' · ' + effectiveKm + ' km' : ''}</span>`;
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

// ---------------- salvataggio/eliminazione di una foto (Firestore se disponibile, altrimenti solo locale) ----------------
// Un ID documento Firestore non può contenere "/", ".", "#", "$", "[" o "]" — ma i nomi delle
// tappe a volte li contengono (es. "notte 1/2"). Per questo l'ID del documento è sempre "reso
// sicuro" sostituendo quei caratteri, mentre la vera chiave (con i caratteri originali) resta
// salvata dentro al documento stesso: così il collegamento funziona qualunque sia il nome.
function firestoreSafeDocId(realKey) {
  return String(realKey).replace(/[\/.#$\[\]]/g, '_');
}
function savePhotoValue(realKey, type, value, onDone) {
  if (typeof db !== 'undefined' && db) {
    const docId = firestoreSafeDocId(`${type}_${realKey}`);
    db.collection('sharedPhotos').doc(docId).set({ key: realKey, type, value }).then(() => {
      if (onDone) onDone(true);
    }).catch((err) => {
      console.warn('Salvataggio foto su Firestore fallito:', err);
      alert(`⚠️ La foto NON è stata condivisa con gli altri (resta solo su questo dispositivo).\n\nErrore Firebase: ${err.code || err.message || err}\n\nSegnalalo così com'è, aiuta a capire la causa.`);
      if (onDone) onDone(false, err);
    });
  } else if (onDone) {
    onDone(true);
  }
}
function deletePhotoValue(realKey, type, onDone) {
  if (typeof db !== 'undefined' && db) {
    const docId = firestoreSafeDocId(`${type}_${realKey}`);
    db.collection('sharedPhotos').doc(docId).delete().then(() => {
      if (onDone) onDone(true);
    }).catch((err) => {
      console.warn('Eliminazione foto su Firestore fallita:', err);
      alert(`⚠️ Non sono riuscito a togliere la foto anche per gli altri.\n\nErrore Firebase: ${err.code || err.message || err}`);
      if (onDone) onDone(false, err);
    });
  } else if (onDone) {
    onDone(true);
  }
}

document.getElementById('detailPhotoFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !currentDetailDay || !currentDetailKey) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // ridimensiona/comprimi lato client, così la foto sta comoda anche dentro un
      // documento Firestore (limite 1 MB) oltre a occupare poco spazio sul dispositivo
      const compress = (maxDim, quality) => {
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
        return canvas.toDataURL('image/jpeg', quality);
      };
      let dataUrl = compress(1280, 0.78);
      if (dataUrl.length > 900000) dataUrl = compress(1000, 0.6);   // ancora troppo grande: comprimi di più
      if (dataUrl.length > 900000) dataUrl = compress(700, 0.5);    // ultimo tentativo

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
      savePhotoValue(currentDetailKey, 'stop', dataUrl, (success) => {
        if (!success) console.warn('La foto resta salvata solo su questo dispositivo per ora.');
      });
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
  savePhotoValue(currentDetailKey, 'stop', val);
});

document.getElementById('detailPhotoReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete photoOverrides[currentDetailKey];
  saveStore(STORE_KEYS.photoOverrides, photoOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  loadDetailPhoto(currentDetailKey, s);
  document.getElementById('detailPhotoInput').value = getEffectivePhotoSource(currentDetailKey, s);
  document.getElementById('detailPhotoReset').style.display = 'none';
  deletePhotoValue(currentDetailKey, 'stop');
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
  saveStopOverrideData(currentDetailKey);
});

document.getElementById('detailMapsReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete mapsOverrides[currentDetailKey];
  saveStore(STORE_KEYS.mapsOverrides, mapsOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailMapsLink(currentDetailDay, currentDetailKey, s);
  document.getElementById('detailMapsInput').value = getEffectiveMapsDestination(currentDetailDay, currentDetailKey, s);
  document.getElementById('detailMapsReset').style.display = 'none';
  saveStopOverrideData(currentDetailKey);
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
      saveStopOverrideData(key);
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
  saveStopOverrideData(currentDetailKey);
});

document.getElementById('detailDescReset').addEventListener('click', () => {
  if (!currentDetailDay || !currentDetailKey) return;
  delete descriptionOverrides[currentDetailKey];
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  const s = getStopByKey(currentDetailDay, currentDetailKey);
  renderDetailDescription(currentDetailKey, s);
  document.getElementById('detailDescReset').style.display = 'none';
  saveStopOverrideData(currentDetailKey);
});

document.getElementById('detailNoteSave').addEventListener('click', () => {
  const val = document.getElementById('detailNoteTextarea').value.trim();
  if (currentStayNotte) {
    pernottamentoNote[currentStayNotte] = val;
    saveStore(STORE_KEYS.pernottamentoNote, pernottamentoNote);
    renderStayNote(currentStayNotte);
    document.getElementById('detailNoteEdit').classList.remove('open');
    if (currentView === 'info') renderInfo();
    savePernottamentoData(currentStayNotte);
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
  saveStopOverrideData(currentDetailKey);
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
  saveStopOverrideData(currentDetailKey);
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
    btn.textContent = getDayLabel(day);
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
  if (dayMapOpenForDayId !== null && dayMapOpenForDayId !== day.id) hideDayMapPanel();
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
  const naturalPred = getNaturalPredecessorMap(day);
  const firstDep = visible.length ? chain[visible[0].key].partenza : parseHM(getStartTime(day.id));
  const lastArr = visible.length ? chain[visible[visible.length - 1].key].arrivo : firstDep;

  const timesBar = document.getElementById('dayTimes');
  const naturalStartLabel = (day.stops[0] && day.stops[0].da) ? day.stops[0].da : '';
  const currentStartLabel = Object.prototype.hasOwnProperty.call(dayStartLocationOverrides, day.id)
    ? dayStartLocationOverrides[day.id] : naturalStartLabel;
  timesBar.innerHTML = `
    <div class="daytimes-row">
      <div class="daytimes-box">
        <div class="dt-field">
          <label>🌅 Partenza mattutina</label>
          <input type="time" id="dayStartInput" value="${getStartTime(day.id)}">
        </div>
        <div class="dt-field">
          <label>📍 Punto di partenza</label>
          <input type="text" id="dayStartLocationInput" value="${currentStartLabel}" placeholder="es. Reykjavík">
        </div>
        <div class="dt-field dt-computed">
          <label>🌙 Arrivo previsto in serata</label>
          <div class="dt-value">${formatMin(lastArr)}</div>
        </div>
      </div>
      <div class="day-note-box">
        <label>📝 Nota per questa giornata</label>
        <textarea id="dayNoteTextarea" placeholder="Scrivi qui promemoria, idee, cose da non dimenticare per questo giorno...">${dayNotes[day.id] || ''}</textarea>
      </div>
    </div>
    ${startTimes[day.id] ? `<span class="dt-reset" id="dayStartReset">↺ ripristina orario predefinito (${DEFAULT_START_TIME})</span>` : ''}
    ${Object.prototype.hasOwnProperty.call(dayStartLocationOverrides, day.id) ? `<span class="dt-reset" id="dayStartLocationReset">↺ ripristina punto di partenza predefinito (${naturalStartLabel || '—'})</span>` : ''}
    <div class="daytimes-actions">
      <span class="dt-add-stop" id="addStopBtn">➕ Aggiungi tappa in fondo alla giornata</span>
      <span class="dt-add-stop" id="viewDayMapBtn">🗺️ Vedi la mappa di oggi</span>
      ${hiddenList.length ? `<span class="dt-hidden-toggle" id="hiddenStopsToggle">🙈 ${hiddenList.length} tappa/e nascosta/e — mostra</span>` : ''}
    </div>
    <div class="hidden-stops-box" id="hiddenStopsBox"></div>
  `;
  document.getElementById('viewDayMapBtn').addEventListener('click', () => toggleDayMapPanel(day));
  document.getElementById('dayNoteTextarea').addEventListener('blur', (e) => {
    dayNotes[day.id] = e.target.value;
    saveStore(STORE_KEYS.dayNotes, dayNotes);
    saveDayNote(day.id);
  });
  document.getElementById('dayStartLocationInput').addEventListener('change', (e) => {
    const val = e.target.value.trim();
    if (val && val !== naturalStartLabel) {
      dayStartLocationOverrides[day.id] = val;
    } else {
      delete dayStartLocationOverrides[day.id];
    }
    saveStore(STORE_KEYS.dayStartLocation, dayStartLocationOverrides);
    renderDayView();
    saveDayStartLocation(day.id);
  });
  const startLocResetBtn = document.getElementById('dayStartLocationReset');
  if (startLocResetBtn) {
    startLocResetBtn.addEventListener('click', () => {
      delete dayStartLocationOverrides[day.id];
      saveStore(STORE_KEYS.dayStartLocation, dayStartLocationOverrides);
      renderDayView();
      saveDayStartLocation(day.id);
    });
  }
  document.getElementById('dayStartInput').addEventListener('change', (e) => {
    startTimes[day.id] = e.target.value || DEFAULT_START_TIME;
    saveStore(STORE_KEYS.startTimes, startTimes);
    renderDayView();
    saveStartTime(day.id);
  });
  const resetBtn = document.getElementById('dayStartReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      delete startTimes[day.id];
      saveStore(STORE_KEYS.startTimes, startTimes);
      renderDayView();
      saveStartTime(day.id);
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

  // totali della giornata: solo sulle imperdibili, le uniche che contano davvero negli orari
  const mainStopsForTotals = visible.filter(({ key, stop }) => {
    const pri = getEffectivePriority(key, stop);
    return !(pri === 'Facoltativa' || pri === 'Da evitare');
  });
  let totalKm = 0, totalGuidaMin = 0, totalVisitaMin = 0;
  mainStopsForTotals.forEach(({ key }) => {
    const c = chain[key];
    totalKm += c.km || 0;
    totalGuidaMin += c.guidaMin || 0;
    totalVisitaMin += c.visitaMin || 0;
  });
  document.getElementById('progressLabel').innerHTML =
    `${doneList.length} / ${visible.length} tappe completate  ·  ${formatMin(firstDep)} → ${formatMin(lastArr)}` +
    `<br><span class="progress-totals">🚗 ${formatDurationMin(totalGuidaMin)} di guida · 📏 ${Math.round(totalKm * 10) / 10} km · ⏱ ${formatDurationMin(totalVisitaMin)} di visite</span>`;

  const list = document.getElementById('stopsList');
  list.innerHTML = '';

  const mainStops = [];
  const optionalStops = [];
  visible.forEach((item) => {
    const pri = getEffectivePriority(item.key, item.stop);
    if (pri === 'Facoltativa' || pri === 'Da evitare') optionalStops.push(item);
    else mainStops.push(item);
  });

  function buildStopCardHtml({ key, stop: s, custom }, numberLabel, predKeyForWarning, isOptionalSection) {
    const isDone = doneList.includes(key);
    const { partenza, arrivo, guidaMin, visitaMin, km: effectiveKm } = chain[key];
    const effectiveDescFull = getEffectiveDescription(key, s);
    const effectiveDescPreview = effectiveDescFull ? effectiveDescFull.split('\n\n')[0] : '';

    const guidaPotenzialmenteObsoleta = !isOptionalSection && guidaMin > 0 && (naturalPred[key] || null) !== predKeyForWarning;

    // "da" mostra sempre la tappa REALMENTE precedente nell'ordine attuale (solo per le imperdibili,
    // le uniche incatenate) invece del testo statico originale, così resta coerente dopo un riordino
    // o dopo aver spostato una tappa tra imperdibili/facoltative. Se ora è la PRIMA della giornata,
    // mostra da dove si parte davvero (il pernottamento della notte prima), non il proprio "da" originale.
    let effectiveDa = s.da || '';
    if (!isOptionalSection) {
      if (predKeyForWarning) {
        const predItem = merged.find(m => m.key === predKeyForWarning);
        if (predItem && predItem.stop.a) effectiveDa = predItem.stop.a;
      } else if (Object.prototype.hasOwnProperty.call(dayStartLocationOverrides, day.id)) {
        effectiveDa = dayStartLocationOverrides[day.id]; // punto di partenza corretto a mano
      } else if (day.stops[0] && day.stops[0].da) {
        effectiveDa = day.stops[0].da; // punto di partenza naturale della giornata
      }
    }

    const effPri = getEffectivePriority(key, s);
    const pri = priorityInfo(effPri);
    let badges = '';
    if (pri) badges += `<span class="badge ${pri.cls}">${pri.label}</span>`;
    if (!isOptionalSection && guidaMin > 0) {
      const warnSpan = guidaPotenzialmenteObsoleta
        ? `<span class="badge-warn" title="Tappa precedente cambiata: questo tempo di guida potrebbe non essere più giusto, ricontrollalo">⚠️</span>` : '';
      badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${effectiveKm ? ' · ' + effectiveKm + ' km' : ''}${warnSpan}</span>`;
    } else if (isOptionalSection && guidaMin > 0) {
      badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${effectiveKm ? ' · ' + effectiveKm + ' km' : ''} <em>(non conta negli orari)</em></span>`;
    }
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
    const promoteBtn = isOptionalSection
      ? `<span class="stop-priority-quick" data-key="${key}" data-newpri="Imperdibile" title="Inseriscila tra le imperdibili: torna a contare negli orari">⬆️ Rendi imperdibile</span>`
      : `<span class="stop-priority-quick" data-key="${key}" data-newpri="Facoltativa" title="Spostala tra le facoltative: non conterà più negli orari">⬇️ Rendi facoltativa</span>`;

    const card = document.createElement('div');
    card.className = 'stop-card' + (isDone ? ' done' : '') + (isOptionalSection ? ' stop-card-optional' : '');
    card.innerHTML = `
      <div class="stop-top">
        <div class="stop-check ${isDone ? 'checked' : ''}" data-key="${key}">${isDone ? '✓' : ''}</div>
        <div class="stop-move">
          <span class="stop-move-btn stop-move-up" data-key="${key}" title="Sposta su">▲</span>
          <span class="stop-move-btn stop-move-down" data-key="${key}" title="Sposta giù">▼</span>
        </div>
        <div class="stop-main">
          <div class="stop-title-row">
            <div class="stop-title stop-title-clickable" data-key="${key}">${numberLabel !== null ? numberLabel + '. ' : '• '}${s.a || ''}</div>
            <button class="stop-detail-btn detail-open" data-key="${key}">📖 Scheda</button>
          </div>
          <div class="stop-sub">da ${effectiveDa}</div>
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
              <label>Km</label>
              <input type="number" min="0" step="1" class="te-km" value="${effectiveKm}">
            </div>
            <div class="te-row">
              <label>Visita (min)</label>
              <input type="number" min="0" step="1" class="te-visita" value="${visitaMin}">
            </div>
            <div class="te-recalc-row">
              <span class="te-recalc-btn" data-key="${key}" data-predkey="${predKeyForWarning || ''}">🧭 Ricalcola con Google Maps</span>
              <span class="te-recalc-status" id="teRecalcStatus_${key}"></span>
            </div>
            <div class="te-actions">
              <button class="te-apply" data-key="${key}">Applica</button>
              ${isOverridden ? `<button class="te-reset" data-key="${key}">Ripristina</button>` : ''}
            </div>
          </div>
          <div class="stop-badges">${badges}</div>
          ${effectiveDescPreview ? `<div class="stop-desc-preview">${linkify(effectiveDescPreview)}</div>` : ''}
          <span class="stop-toggle" data-key="${key}">✏️ Nota personale</span>
          <div class="stop-personal" data-key="${key}">
            <textarea placeholder="Scrivi qui una nota, un'impressione, un promemoria...">${savedNote}</textarea>
          </div>
          <div class="stop-hide-row">
            ${promoteBtn}
            <span class="stop-move-day-btn" data-key="${key}">📅 Sposta in un altro giorno</span>
            <span class="stop-hide-btn" data-key="${key}" data-custom="${custom ? '1' : '0'}">${custom ? '🗑️ Elimina questa tappa' : '🙈 Nascondi questa tappa'}</span>
          </div>
        </div>
      </div>
    `;
    return card;
  }

  const mainTitle = document.createElement('div');
  mainTitle.className = 'day-section-title';
  mainTitle.innerHTML = `<span class="dst-dot dst-dot-main"></span>Imperdibili (guidano gli orari) — ${mainStops.length}`;
  list.appendChild(mainTitle);
  const mainGroup = document.createElement('div');
  mainGroup.className = 'stops-group stops-group-main';
  mainStops.forEach(({ key, stop: s, custom }, i) => {
    const predKey = i > 0 ? mainStops[i - 1].key : null;
    mainGroup.appendChild(buildStopCardHtml({ key, stop: s, custom }, i + 1, predKey, false));
  });
  list.appendChild(mainGroup);

  if (optionalStops.length) {
    const optTitle = document.createElement('div');
    optTitle.className = 'day-section-title day-section-title-optional';
    optTitle.innerHTML = `<span class="dst-dot dst-dot-optional"></span>Facoltative — inseriscile se hai tempo — ${optionalStops.length}`;
    list.appendChild(optTitle);
    const optHint = document.createElement('div');
    optHint.className = 'day-section-hint';
    optHint.textContent = 'Non contano negli orari finché non le rendi imperdibili con il pulsante qui sotto.';
    list.appendChild(optHint);
    const optGroup = document.createElement('div');
    optGroup.className = 'stops-group stops-group-optional';
    optionalStops.forEach(({ key, stop: s, custom }) => {
      optGroup.appendChild(buildStopCardHtml({ key, stop: s, custom }, null, null, true));
    });
    list.appendChild(optGroup);
  }

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
      const km = parseInt(box.querySelector('.te-km').value, 10) || 0;
      const visita = parseInt(box.querySelector('.te-visita').value, 10) || 0;
      durationOverrides[key] = { guida, visita, km };
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
      saveStopOverrideData(key);
    });
  });
  list.querySelectorAll('.te-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      delete durationOverrides[key];
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
      saveStopOverrideData(key);
    });
  });

  // wire ricalcolo automatico km/guida con Google Maps (Directions, via libreria JS: niente CORS)
  list.querySelectorAll('.te-recalc-btn').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const predKey = el.dataset.predkey;
      const statusEl = document.getElementById('teRecalcStatus_' + key);
      const found = merged.find(m => m.key === key);
      if (!found) return;
      const destStr = resolveDirectionsLocation(day, key, found.stop);

      let originStr;
      if (predKey) {
        const predFound = merged.find(m => m.key === predKey);
        originStr = predFound ? resolveDirectionsLocation(day, predKey, predFound.stop) : null;
      }
      if (!originStr) originStr = getEffectiveDaForKey(day, key); // punto di partenza (prima tappa del giorno, o "da" originale)
      if (!originStr) { statusEl.textContent = '⚠️ Manca il punto di partenza'; return; }

      if (typeof google === 'undefined' || !google.maps || !google.maps.DirectionsService) {
        statusEl.textContent = '⚠️ Libreria Google Maps non ancora caricata, riprova tra un attimo';
        return;
      }
      statusEl.textContent = '⏳ Calcolo in corso…';
      const svc = new google.maps.DirectionsService();
      let recalcSettled = false;
      const recalcTimeout = setTimeout(() => {
        if (!recalcSettled) { recalcSettled = true; statusEl.textContent = '⚠️ Google Maps non ha risposto in tempo, riprova.'; }
      }, 15000);
      svc.route({
        origin: originStr,
        destination: destStr,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        clearTimeout(recalcTimeout);
        if (recalcSettled) return; // il timeout è già scattato, non sovrascrivere il messaggio
        recalcSettled = true;
        if (status !== 'OK' || !result.routes.length) {
          statusEl.textContent = `⚠️ Percorso non trovato (${status}) — inseriscilo a mano`;
          return;
        }
        const leg = result.routes[0].legs[0];
        const km = Math.round(leg.distance.value / 100) / 10; // metri -> km con 1 decimale
        const minuti = Math.round(leg.duration.value / 60);
        const box = list.querySelector(`.stop-timeedit[data-key="${key}"]`);
        box.querySelector('.te-guida').value = minuti;
        box.querySelector('.te-km').value = km;
        statusEl.textContent = `✅ ${minuti} min · ${km} km — tocca "Applica" per salvare`;
      });
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

  // wire "sposta in un altro giorno": porta con sé descrizione/note/foto/posizione/priorità/tempi
  list.querySelectorAll('.stop-move-day-btn').forEach(el => {
    el.addEventListener('click', () => moveStopToDay(day, el.dataset.key));
  });

  // wire spostamento rapido Imperdibile <-> Facoltativa
  list.querySelectorAll('.stop-priority-quick').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      const newPri = el.dataset.newpri;
      if (newPri === 'Imperdibile') {
        // promuovere una facoltativa richiede di scegliere DOVE inserirla: apre il modulo dedicato
        openInsertPositionModal(day, key);
        return;
      }
      const merged2 = getMergedStops(day);
      const found = merged2.find(m => m.key === key);
      if (!found) return;
      if (newPri === found.stop.priorita) {
        delete priorityOverrides[key]; // torna al valore originale, non serve un override
      } else {
        priorityOverrides[key] = newPri;
      }
      saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
      renderDayView();
      saveStopOverrideData(key);
    });
  });

  // wire spostamento su/giù (riordino manuale delle tappe)
  function moveStop(key, direction) {
    // sposta la tappa dentro alla SUA sezione (imperdibili o facoltative), non tra le due:
    // le due liste restano separate anche nell'ordine salvato
    const inMain = mainStops.some(m => m.key === key);
    const group = (inMain ? mainStops : optionalStops).map(v => v.key);
    const idx = group.indexOf(key);
    const swapWith = idx + direction;
    if (idx === -1 || swapWith < 0 || swapWith >= group.length) return;
    [group[idx], group[swapWith]] = [group[swapWith], group[idx]];
    const newMainOrder = inMain ? group : mainStops.map(v => v.key);
    const newOptionalOrder = inMain ? optionalStops.map(v => v.key) : group;
    const hiddenKeys = merged.map(m => m.key).filter(k => isStopHidden(k));
    stopOrderByDay[day.id] = newMainOrder.concat(newOptionalOrder, hiddenKeys);
    saveStore(STORE_KEYS.stopOrder, stopOrderByDay);
    renderDayView();
    saveStopOrder(day.id);
  }
  list.querySelectorAll('.stop-move-up').forEach(el => {
    el.addEventListener('click', () => moveStop(el.dataset.key, -1));
  });
  list.querySelectorAll('.stop-move-down').forEach(el => {
    el.addEventListener('click', () => moveStop(el.dataset.key, 1));
  });

  // se il pannello mappa è già aperto per questo giorno, lo ridisegna con l'ordine appena aggiornato
  if (dayMapOpenForDayId === day.id) renderDayMapPanel(day);
}

// ---------------- mappa della giornata: percorso reale delle imperdibili + punti delle facoltative ----------------
// Ora è un pannello persistente (non un modulo che si chiude a ogni tocco): resta aperto sopra
// la lista delle tappe, così puoi confrontarlo mentre riordini — e si ridisegna da solo ogni
// volta che sposti qualcosa, restando sempre coerente con l'ordine attuale.
let dayMapInstance = null;
let dayMapDirRenderer = null;
let dayMapOptionalMarkers = [];
let dayMapMainMarkers = [];
let dayMapStartMarker = null;
let dayMapEndMarker = null;
let dayMapSupermarketMarkers = [];
let dayMapOpenForDayId = null;

function toggleDayMapPanel(day) {
  if (dayMapOpenForDayId === day.id) {
    hideDayMapPanel();
  } else {
    showDayMapPanel(day);
  }
}
function showDayMapPanel(day) {
  dayMapOpenForDayId = day.id;
  document.getElementById('dayMapPanel').style.display = '';
  renderDayMapPanel(day);
}
function hideDayMapPanel() {
  dayMapOpenForDayId = null;
  document.getElementById('dayMapPanel').style.display = 'none';
}

function renderDayMapPanel(day) {
  const merged = getMergedStops(day);
  const visible = merged.filter(m => !isStopHidden(m.key));
  const mainStops = visible.filter(m => {
    const pri = getEffectivePriority(m.key, m.stop);
    return !(pri === 'Facoltativa' || pri === 'Da evitare');
  });
  const optionalStops = visible.filter(m => {
    const pri = getEffectivePriority(m.key, m.stop);
    return pri === 'Facoltativa' || pri === 'Da evitare';
  });

  document.getElementById('dayMapPanelTitle').textContent = `Mappa — ${getDayLabel(day)}`;
  const statusEl = document.getElementById('dayMapStatus');
  statusEl.textContent = '';

  // il "bonus" supermercati non ha senso per Arrivo e Giorno 1 (zona Reykjavík, già ben servita)
  const bonusRow = document.getElementById('dayMapBonusRow');
  bonusRow.style.display = (day.id === 0 || day.id === 1) ? 'none' : '';
  const supermarketToggle = document.getElementById('dayMapSupermarketToggle');
  supermarketToggle.checked = false;
  supermarketToggle.onchange = () => {
    if (supermarketToggle.checked) {
      searchSupermarketsAlongRoute(day, mainStops);
    } else {
      dayMapSupermarketMarkers.forEach(m => m.setMap(null));
      dayMapSupermarketMarkers = [];
      statusEl.textContent = '';
    }
  };

  if (typeof google === 'undefined' || !google.maps) {
    statusEl.textContent = '⚠️ Libreria Google Maps non ancora caricata, riprova tra un attimo.';
    return;
  }
  if (mainStops.length < 1) {
    statusEl.textContent = '⚠️ Serve almeno 1 tappa imperdibile per tracciare un percorso su questa giornata.';
    return;
  }

  const canvas = document.getElementById('dayMapCanvas');
  dayMapInstance = new google.maps.Map(canvas, {
    center: { lat: 64.9631, lng: -19.0208 }, // centro approssimativo dell'Islanda, come partenza
    zoom: 7,
  });
  dayMapDirRenderer = new google.maps.DirectionsRenderer({ map: dayMapInstance, suppressMarkers: true });
  dayMapOptionalMarkers.forEach(m => m.setMap(null));
  dayMapOptionalMarkers = [];
  dayMapMainMarkers.forEach(m => m.setMap(null));
  dayMapMainMarkers = [];
  if (dayMapStartMarker) { dayMapStartMarker.setMap(null); dayMapStartMarker = null; }
  if (dayMapEndMarker) { dayMapEndMarker.setMap(null); dayMapEndMarker = null; }
  dayMapSupermarketMarkers.forEach(m => m.setMap(null));
  dayMapSupermarketMarkers = [];

  // punto di partenza (pernottamento della notte prima) e di arrivo (pernottamento di stasera):
  // fanno parte del percorso vero e proprio, non solo marcatori isolati come prima
  const morningLabel = getEffectiveDaForKey(day, mainStops[0].key);
  const eveningNativeStop = day.stops.find(s => s.a && /\(pernottamento/i.test(s.a));
  let eveningLoc = null, eveningLabel = null, eveningKey = null;
  if (eveningNativeStop) {
    eveningLabel = eveningNativeStop.a;
    eveningKey = stopKeyByName(day.id, eveningNativeStop.a);
    eveningLoc = resolveDirectionsLocation(day, eveningKey, eveningNativeStop);
  }

  statusEl.textContent = '⏳ Traccio il percorso completo della giornata…';
  const svc = new google.maps.DirectionsService();
  const originStr = morningLabel ? `${morningLabel}, Iceland` : resolveDirectionsLocation(day, mainStops[0].key, mainStops[0].stop);
  const destStr = eveningLoc || resolveDirectionsLocation(day, mainStops[mainStops.length - 1].key, mainStops[mainStops.length - 1].stop);
  const waypoints = mainStops.map(m => ({
    location: resolveDirectionsLocation(day, m.key, m.stop),
    stopover: true,
  }));

  svc.route({
    origin: originStr,
    destination: destStr,
    waypoints,
    optimizeWaypoints: false, // mantiene l'ordine scelto in app, non lo riordina da solo
    travelMode: google.maps.TravelMode.DRIVING,
  }, (result, status) => {
    if (status !== 'OK' || !result.routes.length) {
      statusEl.textContent = `⚠️ Percorso non tracciabile (${status}) — verifico quale tratto specifico non funziona…`;
      diagnoseFailingSegment(day, mainStops, morningLabel, destStr, svc, statusEl);
      return;
    }
    dayMapDirRenderer.setDirections(result);

    // marcatori verdi e numerati (1, 2, 3...) al posto delle lettere di default di Google,
    // così coincidono con la numerazione già usata nella lista del giorno; al passaggio del
    // cursore mostrano il nome della tappa
    const legs = result.routes[0].legs;
    const infoWindow = new google.maps.InfoWindow();
    const attachHover = (marker, label) => {
      marker.addListener('mouseover', () => { infoWindow.setContent(label); infoWindow.open(dayMapInstance, marker); });
      marker.addListener('mouseout', () => infoWindow.close());
    };

    // punto di partenza: dove inizia il primo tratto (leg[0].start_location)
    dayMapStartMarker = new google.maps.Marker({
      position: legs[0].start_location,
      map: dayMapInstance,
      title: `Partenza: ${morningLabel || ''}`,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#3468c9', fillOpacity: 1, strokeColor: '#1a3d80', strokeWeight: 2 },
      label: { text: '🏠', fontSize: '11px' },
      zIndex: 998,
    });
    attachHover(dayMapStartMarker, `🔵 Partenza: ${morningLabel || ''}`);

    // tappe imperdibili: la posizione di ciascuna è la fine del tratto corrispondente
    mainStops.forEach((m, i) => {
      const marker = new google.maps.Marker({
        position: legs[i].end_location,
        map: dayMapInstance,
        label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '13px' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 15, fillColor: '#2f9e63', fillOpacity: 1, strokeColor: '#1a6b40', strokeWeight: 2 },
        title: m.stop.a,
      });
      attachHover(marker, `🟢 ${i + 1}. ${m.stop.a}`);
      marker.addListener('click', () => openStopDetailModal(day, m.key));
      dayMapMainMarkers.push(marker);
    });

    // punto di arrivo: dove finisce l'ultimo tratto (leg finale)
    const lastLeg = legs[legs.length - 1];
    dayMapEndMarker = new google.maps.Marker({
      position: lastLeg.end_location,
      map: dayMapInstance,
      title: `Arrivo: ${eveningLabel || ''}`,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#a4508c', fillOpacity: 1, strokeColor: '#5c2650', strokeWeight: 2 },
      label: { text: '🌙', fontSize: '11px' },
      zIndex: 998,
    });
    attachHover(dayMapEndMarker, `🟣 Arrivo: ${eveningLabel || ''}`);
    if (eveningKey) dayMapEndMarker.addListener('click', () => openStopDetailModal(day, eveningKey));

    statusEl.textContent = optionalStops.length ? '⏳ Posiziono le facoltative…' : '';
    placeOptionalMarkers(day, optionalStops, statusEl, infoWindow);
  });
}

// prova ogni singolo tratto separatamente (partenza→1ª tappa, tappa N→tappa N+1, ultima tappa→arrivo),
// per capire esattamente quale coppia di punti non ha un percorso stradale calcolabile tra loro
function diagnoseFailingSegment(day, mainStops, morningLabel, destStr, svc, statusEl) {
  const points = [
    { label: morningLabel ? `Partenza (${morningLabel})` : 'Partenza', loc: morningLabel ? `${morningLabel}, Iceland` : null },
    ...mainStops.map(m => ({ label: m.stop.a, loc: resolveDirectionsLocation(day, m.key, m.stop) })),
    { label: 'Arrivo (pernottamento di stasera)', loc: destStr },
  ].filter(p => p.loc); // se manca la partenza (giorno senza pernottamento precedente noto), la salta

  let i = 0;
  const tryNext = () => {
    if (i >= points.length - 1) {
      statusEl.textContent = '⚠️ Percorso non tracciabile, ma ogni singolo tratto risulta valido singolarmente — riprova, potrebbe essere un problema temporaneo di Google Maps.';
      return;
    }
    const from = points[i], to = points[i + 1];
    svc.route({
      origin: from.loc,
      destination: to.loc,
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status !== 'OK' || !result.routes.length) {
        statusEl.textContent = `⚠️ Il tratto "${from.label}" → "${to.label}" non ha un percorso stradale calcolabile (${status}). Controlla la posizione impostata su una delle due (specialmente se hai inserito coordinate a mano: verifica di non aver invertito latitudine e longitudine).`;
        return;
      }
      i++;
      tryNext();
    });
  };
  tryNext();
}

// ---------------- bonus: supermercati vicino alle tappe imperdibili del giorno (Google Places) ----------------
async function searchSupermarketsAlongRoute(day, mainStops) {
  const statusEl = document.getElementById('dayMapStatus');
  if (typeof google === 'undefined' || !google.maps.places) {
    statusEl.textContent = '⚠️ Libreria Google Places non disponibile (serve abilitare "Places API (New)" su Google Cloud).';
    document.getElementById('dayMapSupermarketToggle').checked = false;
    return;
  }
  if (!google.maps.places.Place || !google.maps.places.Place.searchNearby) {
    statusEl.textContent = '⚠️ Questa versione della libreria Places non supporta la ricerca nuova — riprova tra un attimo o segnalamelo.';
    document.getElementById('dayMapSupermarketToggle').checked = false;
    return;
  }
  statusEl.textContent = '⏳ Cerco i supermercati lungo il percorso…';
  const seenPlaceIds = new Set();
  const errorMessages = new Set();
  let missingLocation = 0;

  const searches = mainStops.map(async (m) => {
    const marker = dayMapMainMarkers.find(mk => mk.getTitle() === m.stop.a);
    const location = marker ? marker.getPosition() : null;
    if (!location) { missingLocation++; return; }

    try {
      const { places } = await google.maps.places.Place.searchNearby({
        locationRestriction: { center: location, radius: 8000 }, // 8 km intorno a ogni tappa imperdibile
        includedPrimaryTypes: ['supermarket'],
        fields: ['id', 'displayName', 'location', 'formattedAddress'],
        maxResultCount: 10,
      });
      (places || []).forEach((place) => {
        if (seenPlaceIds.has(place.id)) return; // evita doppioni se vicino a più tappe
        seenPlaceIds.add(place.id);
        const mk = new google.maps.Marker({
          position: place.location,
          map: dayMapInstance,
          title: place.displayName,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#e8791a', fillOpacity: 1, strokeColor: '#8a4a0f', strokeWeight: 2 },
        });
        mk.addListener('click', () => {
          const q = encodeURIComponent(place.displayName + (place.formattedAddress ? ' ' + place.formattedAddress : ''));
          window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
        });
        dayMapSupermarketMarkers.push(mk);
      });
    } catch (err) {
      errorMessages.add(err && err.message ? err.message : String(err));
      console.warn('Ricerca supermercati fallita per', m.stop.a, '-', err);
    }
  });

  await Promise.all(searches);

  if (errorMessages.size) {
    statusEl.textContent = `⚠️ Errore nella ricerca supermercati: ${[...errorMessages].join(' | ')} — controlla che "Places API (New)" sia abilitata E aggiunta alle restrizioni della chiave su Google Cloud.`;
  } else if (missingLocation === mainStops.length) {
    statusEl.textContent = '⚠️ Non riesco a trovare la posizione delle tappe di oggi sulla mappa — riapri la mappa (chiudi e "Vedi la mappa di oggi" di nuovo) e riprova.';
  } else {
    statusEl.textContent = dayMapSupermarketMarkers.length
      ? `🛒 ${dayMapSupermarketMarkers.length} supermercati trovati entro 8 km dalle tappe di oggi.`
      : '🛒 Nessun supermercato trovato entro 8 km dalle tappe di oggi.';
  }
}

function placeOptionalMarkers(day, optionalStops, statusEl, sharedInfoWindow) {
  if (!optionalStops.length) { statusEl.textContent = ''; return; }
  const geocoder = google.maps.Geocoder ? new google.maps.Geocoder() : null;
  const infoWindow = sharedInfoWindow || new google.maps.InfoWindow();
  let done = 0;
  const placeMarker = (position, title, key) => {
    const marker = new google.maps.Marker({
      position, map: dayMapInstance, title,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#e9a83c', fillOpacity: 1, strokeColor: '#7a5a12', strokeWeight: 2 },
    });
    marker.addListener('mouseover', () => { infoWindow.setContent(`🟡 ${title}`); infoWindow.open(dayMapInstance, marker); });
    marker.addListener('mouseout', () => infoWindow.close());
    marker.addListener('click', () => openStopDetailModal(day, key));
    dayMapOptionalMarkers.push(marker);
  };
  optionalStops.forEach(({ key, stop }) => {
    const loc = resolveDirectionsLocation(day, key, stop);
    if (typeof loc === 'object') {
      // sono già coordinate: nessun bisogno di geocodificare, si piazza subito il marcatore
      placeMarker(loc, stop.a, key);
      done++;
      if (done === optionalStops.length) statusEl.textContent = '';
      return;
    }
    if (!geocoder) {
      console.warn('Geocoding non disponibile, salto:', stop.a);
      done++;
      if (done === optionalStops.length) statusEl.textContent = '';
      return;
    }
    geocoder.geocode({ address: loc }, (results, status) => {
      done++;
      if (status === 'OK' && results.length) {
        placeMarker(results[0].geometry.location, stop.a, key);
      } else {
        console.warn('Geocoding facoltativa fallito:', stop.a, status);
      }
      if (done === optionalStops.length) statusEl.textContent = '';
    });
  });
}

document.getElementById('dayMapPanelClose').addEventListener('click', hideDayMapPanel);

function moveStopToDay(day, key) {
  const s = getStopByKey(day, key);
  if (!s) return;

  const dayOptions = TRIP_DATA.days.map(d => `${d.id} — ${d.label || 'Giorno ' + d.id}`).join('\n');
  const answer = prompt(`Sposta "${s.a}" in quale giorno? Scrivi il numero:\n\n${dayOptions}`, String(day.id));
  if (answer === null) return;
  const targetDayId = parseInt(answer.trim(), 10);
  const targetDay = TRIP_DATA.days.find(d => d.id === targetDayId);
  if (!targetDay) { alert('Numero di giorno non valido, non ho spostato nulla.'); return; }
  if (targetDayId === day.id) return; // stesso giorno, niente da fare

  if (!confirm(`Spostare "${s.a}" su "${targetDay.label || 'Giorno ' + targetDay.id}"? Descrizione, note, foto, posizione e priorità già impostate vengono portate con sé.`)) return;

  // raccoglie tutto quello che è già stato personalizzato su questa tappa
  const { guidaMin, visitaMin, km } = getEffectiveDurations(key, s);
  const effPriority = getEffectivePriority(key, s);
  const effDesc = descriptionOverrides[key] || s.descrizione || '';
  const effNote = noteOverrides[key] || s.note || '';
  const effMapsRaw = Object.prototype.hasOwnProperty.call(mapsOverrides, key) ? mapsOverrides[key] : null;
  const effPhoto = photoOverrides[key] || null;

  const guidaStr = `${Math.floor(guidaMin / 60)}:${String(guidaMin % 60).padStart(2, '0')}`;
  const visitaStr = `${Math.floor(visitaMin / 60)}:${String(visitaMin % 60).padStart(2, '0')}`;

  // crea la tappa "gemella" nel giorno di destinazione (in fondo; la si può poi riordinare a piacere)
  const newKey = addCustomStop(targetDayId, {
    a: s.a, da: '', guida: guidaStr, visita: visitaStr, km,
    priorita: effPriority || 'Facoltativa',
  });

  if (effDesc) { descriptionOverrides[newKey] = effDesc; saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides); }
  if (effNote) { noteOverrides[newKey] = effNote; saveStore(STORE_KEYS.noteOverrides, noteOverrides); }
  if (effMapsRaw) { mapsOverrides[newKey] = effMapsRaw; saveStore(STORE_KEYS.mapsOverrides, mapsOverrides); }
  saveStopOverrideData(newKey);
  if (effPhoto) {
    photoOverrides[newKey] = effPhoto;
    saveStore(STORE_KEYS.photoOverrides, photoOverrides);
    savePhotoValue(newKey, 'stop', effPhoto);
  }

  // toglie la tappa dal giorno di origine (elimina se era già una tappa aggiunta da te, altrimenti nascondi
  // quella "originale" dell'itinerario — non si può cancellare, ma restando nascosta non compare più)
  const wasCustom = key.startsWith('custom_');
  if (wasCustom) {
    deleteCustomStop(day.id, key);
  } else {
    setStopHidden(key, true);
  }
  // ripulisce le personalizzazioni della vecchia chiave, ormai trasferite alla nuova
  delete descriptionOverrides[key]; delete noteOverrides[key]; delete priorityOverrides[key];
  delete mapsOverrides[key]; delete photoOverrides[key]; delete durationOverrides[key];
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  saveStore(STORE_KEYS.noteOverrides, noteOverrides);
  saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
  saveStore(STORE_KEYS.mapsOverrides, mapsOverrides);
  saveStore(STORE_KEYS.photoOverrides, photoOverrides);
  saveStore(STORE_KEYS.durationOverrides, durationOverrides);
  saveStopOverrideData(key);
  if (effPhoto) deletePhotoValue(key, 'stop');

  renderDayView();
  alert(`Fatto: "${s.a}" è ora su "${targetDay.label || 'Giorno ' + targetDay.id}", in fondo alla giornata (tra le facoltative se non avevi una priorità impostata) — riordinala con le frecce o "Rendi imperdibile" quando vuoi.`);
}

function openInsertPositionModal(day, key) {
  const merged = getMergedStops(day);
  const found = merged.find(m => m.key === key);
  if (!found) return;
  const stopName = found.stop.a;

  const visible = merged.filter(m => !isStopHidden(m.key));
  const mainStops = visible.filter(m => {
    const pri = getEffectivePriority(m.key, m.stop);
    return !(pri === 'Facoltativa' || pri === 'Da evitare');
  });

  document.getElementById('ipmTitle').textContent = `Dove inserire "${stopName}"?`;
  const listEl = document.getElementById('ipmList');
  const previewEl = document.getElementById('ipmPreview');
  const confirmBtn = document.getElementById('ipmConfirm');
  previewEl.style.display = 'none';
  confirmBtn.style.display = 'none';

  if (typeof google === 'undefined' || !google.maps || !google.maps.DirectionsService) {
    listEl.innerHTML = `<div class="ipm-hint-error">⚠️ Libreria Google Maps non ancora caricata, riprova tra un attimo.</div>`;
    document.getElementById('insertPositionModalBackdrop').classList.add('open');
    lockBodyScroll();
    return;
  }

  // candidati: "all'inizio della giornata" + "dopo ciascuna imperdibile attuale" (l'ultimo = in fondo)
  const candidates = [{ label: `📍 All'inizio della giornata`, afterIdx: -1 }];
  mainStops.forEach((m, i) => candidates.push({ label: `Dopo "${m.stop.a}"`, afterIdx: i }));

  listEl.innerHTML = `<div class="ipm-progress" id="ipmProgress">⏳ Calcolo tutte le opzioni con Google Maps (0/${candidates.length})…</div>`;
  document.getElementById('insertPositionModalBackdrop').classList.add('open');
  lockBodyScroll();

  const svc = new google.maps.DirectionsService();
  const routeAsync = (originStr, destStr) => new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
    const timeoutId = setTimeout(() => done(null), 15000); // non resta bloccato per sempre se Google Maps non risponde
    svc.route({ origin: originStr, destination: destStr, travelMode: google.maps.TravelMode.DRIVING }, (result, status) => {
      clearTimeout(timeoutId);
      if (status !== 'OK' || !result.routes.length) { done(null); return; }
      const leg = result.routes[0].legs[0];
      done({ min: Math.round(leg.duration.value / 60), km: Math.round(leg.distance.value / 100) / 10 });
    });
  });

  const chain = computeDayChain(day);
  const lastMain = mainStops[mainStops.length - 1];
  const currentLastArr = lastMain ? chain[lastMain.key].arrivo : parseHM(getStartTime(day.id));
  const { visitaMin } = getEffectiveDurations(key, found.stop);
  const destStr = resolveDirectionsLocation(day, key, found.stop);

  const results = [];
  let done = 0;

  (async () => {
    for (const candidate of candidates) {
      const prevItem = candidate.afterIdx === -1 ? null : mainStops[candidate.afterIdx];
      const nextItem = candidate.afterIdx + 1 < mainStops.length ? mainStops[candidate.afterIdx + 1] : null;
      const originStr = prevItem
        ? resolveDirectionsLocation(day, prevItem.key, prevItem.stop)
        : getEffectiveDaForKey(day, mainStops.length ? mainStops[0].key : key);

      const legIn = await routeAsync(originStr, destStr);
      let legOut = null;
      if (legIn && nextItem) {
        const destOutStr = resolveDirectionsLocation(day, nextItem.key, nextItem.stop);
        legOut = await routeAsync(destStr, destOutStr);
      }

      if (legIn && (!nextItem || legOut)) {
        let deltaOutMin = 0;
        if (nextItem && legOut) {
          const oldGuidaOut = getEffectiveDurations(nextItem.key, nextItem.stop).guidaMin;
          deltaOutMin = legOut.min - oldGuidaOut;
        }
        const totalDelta = legIn.min + visitaMin + deltaOutMin;
        results.push({ candidate, nextItem, guidaInMin: legIn.min, kmIn: legIn.km, guidaOutMin: legOut ? legOut.min : null, kmOut: legOut ? legOut.km : null, deltaOutMin, totalDelta, newLastArr: currentLastArr + totalDelta });
      } else {
        results.push({ candidate, error: true });
      }
      done++;
      const progressEl = document.getElementById('ipmProgress');
      if (progressEl) progressEl.textContent = `⏳ Calcolo tutte le opzioni con Google Maps (${done}/${candidates.length})…`;
    }
    renderResults();
  })();

  function renderResults() {
    const ok = results.filter(r => !r.error);
    ok.sort((a, b) => a.totalDelta - b.totalDelta);
    const bestKey = ok.length ? ok[0].candidate.afterIdx : null;
    // mantieni l'ordine originale (dall'inizio della giornata in poi) ma segnala la migliore
    const displayOrder = results.slice().sort((a, b) => a.candidate.afterIdx - b.candidate.afterIdx);

    listEl.innerHTML = displayOrder.map(r => {
      if (r.error) {
        return `<div class="ipm-candidate ipm-candidate-error" data-idx="${r.candidate.afterIdx}">${r.candidate.label} — <em>percorso non trovato</em></div>`;
      }
      const isBest = r.candidate.afterIdx === bestKey;
      return `
        <div class="ipm-candidate${isBest ? ' ipm-recommended' : ''}" data-idx="${r.candidate.afterIdx}">
          <div class="ipm-candidate-label">${isBest ? '🌟 ' : ''}${r.candidate.label}${isBest ? ' <span class="ipm-badge">Consigliata</span>' : ''}</div>
          <div class="ipm-candidate-sub">+${r.totalDelta} min in totale · arrivo stimato ${formatMin(r.newLastArr)}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.ipm-candidate:not(.ipm-candidate-error)').forEach(el => {
      el.addEventListener('click', () => {
        listEl.querySelectorAll('.ipm-candidate').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        const idx = parseInt(el.dataset.idx, 10);
        const r = results.find(x => x.candidate.afterIdx === idx);
        showPreviewResult(r);
      });
    });

    if (ok.length) {
      // seleziona subito la consigliata, così l'utente vede la scheda pronta senza dover toccare nulla
      const bestEl = listEl.querySelector('.ipm-recommended');
      if (bestEl) {
        bestEl.classList.add('selected');
        showPreviewResult(ok[0]);
      }
    }
  }

  function showPreviewResult(r) {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `
      <div class="ipm-result">
        🚗 ${r.guidaInMin} min · ${r.kmIn} km per arrivarci &nbsp;·&nbsp; ⏱ ${visitaMin} min di visita
        ${r.guidaOutMin !== null ? `<br>🚗 ${r.guidaOutMin} min · ${r.kmOut} km per ripartire verso la tappa dopo (${r.deltaOutMin >= 0 ? '+' : ''}${r.deltaOutMin} min rispetto a prima)` : '<br><em>È l\'ultima tappa del giorno, nessun tragitto dopo da ricalcolare.</em>'}
        <div class="ipm-result-total">
          Tempo totale aggiunto alla giornata: <b>${r.totalDelta >= 0 ? '+' : ''}${r.totalDelta} min</b><br>
          🌙 Nuovo arrivo in serata stimato: <b>${formatMin(r.newLastArr)}</b> <span class="ipm-was">(era ${formatMin(currentLastArr)})</span>
        </div>
      </div>
    `;
    confirmBtn.style.display = '';
    confirmBtn.onclick = () => applyInsertion(r.candidate, r.guidaInMin, r.kmIn, r.guidaOutMin, r.kmOut, r.nextItem);
  }

  function applyInsertion(candidate, guidaInMin, kmIn, guidaOutMin, kmOut, nextItem) {
    priorityOverrides[key] = 'Imperdibile';
    saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);

    durationOverrides[key] = { guida: guidaInMin, km: kmIn, visita: visitaMin };
    saveStore(STORE_KEYS.durationOverrides, durationOverrides);
    saveStopOverrideData(key);

    if (nextItem && guidaOutMin !== null) {
      const nextDur = getEffectiveDurations(nextItem.key, nextItem.stop);
      durationOverrides[nextItem.key] = { guida: guidaOutMin, km: kmOut, visita: nextDur.visitaMin };
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      saveStopOverrideData(nextItem.key);
    }

    const newMainOrder = mainStops.map(m => m.key);
    newMainOrder.splice(candidate.afterIdx + 1, 0, key);
    const optionalKeys = visible
      .filter(m => {
        const pri = getEffectivePriority(m.key, m.stop);
        return (pri === 'Facoltativa' || pri === 'Da evitare') && m.key !== key;
      })
      .map(m => m.key);
    const hiddenKeys = merged.map(m => m.key).filter(k => isStopHidden(k));
    stopOrderByDay[day.id] = newMainOrder.concat(optionalKeys, hiddenKeys);
    saveStore(STORE_KEYS.stopOrder, stopOrderByDay);
    saveStopOrder(day.id);

    document.getElementById('insertPositionModalBackdrop').classList.remove('open');
    unlockBodyScroll();
    renderDayView();
  }
}
document.getElementById('ipmCancel').addEventListener('click', () => {
  document.getElementById('insertPositionModalBackdrop').classList.remove('open');
  unlockBodyScroll();
});
document.getElementById('insertPositionModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'insertPositionModalBackdrop') {
    e.currentTarget.classList.remove('open');
    unlockBodyScroll();
  }
});

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

  // ---- riepilogo per persona: quanto costa il viaggio a testa (non chi ha pagato) ----
  const perPerson = computePerPersonSummary();
  const perPersonBox = document.getElementById('perPersonBox');
  let ppHtml = '<div class="per-person-list">';
  participants.forEach(p => {
    const s = perPerson[p];
    ppHtml += `
      <div class="per-person-row">
        <span class="pp-name">${p}</span>
        <span class="pp-count" title="Numero di spese registrate a suo nome">🧾 ${s.count}</span>
        <span class="pp-total pp-total-main">${fmtEuro(s.totalCost)} <small>quota totale</small></span>
      </div>
      <div class="pp-breakdown">${fmtEuro(s.personalTotal)} personali · ${fmtEuro(s.shareOfCommon)} quota spese comuni</div>
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
  renderSettlementsList();

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
    if (e.shared === false && e.splitAmong && e.splitAmong.length) {
      typeTag = `👥 diviso con ${e.splitAmong.length} (${e.splitAmong.join(', ')}) · pagato da ${e.paidBy || '—'}`;
    } else if (e.shared === false) {
      typeTag = `👤 personale · pagato da ${e.paidBy || '—'}`;
    } else if (e.paymentSource === 'card') {
      typeTag = '💳 cassa comune (carta)';
    } else {
      typeTag = `🤝 cassa comune · anticipato da ${e.paidBy || '—'}`;
    }
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
  const sep = key.indexOf('::');
  if (sep === -1) return { dayLabel: '?', dayOrder: 999, stopName: key, defaultPriority: null }; // formato sconosciuto o vecchio (posizione)
  const dayId = parseInt(key.slice(0, sep), 10);
  const stopName = key.slice(sep + 2);
  const day = TRIP_DATA.days.find(d => d.id === dayId);
  const dayLabel = day ? getDayLabel(day) : `Giorno ${dayId + 1}`;
  const stop = day ? day.stops.find(s => s.a === stopName) : null;
  return { dayLabel, dayOrder: dayId, stopName, defaultPriority: stop ? (stop.priorita || null) : null };
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
        const defInfo = r.defaultPriority ? priorityInfo(r.defaultPriority) : null;
        html += `<span class="pc-choice-chip pc-default-chip" data-key="${r.key}" data-pri="${r.defaultPriority || ''}" title="Applica il valore di partenza">Partenza: ${defInfo ? defInfo.label : '—'}</span>`;
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
      if (chip.classList.contains('pc-default-chip')) {
        delete priorityOverrides[key]; // "Partenza" = torna al valore di base, nessun override
      } else {
        priorityOverrides[key] = pri;
      }
      saveStore(STORE_KEYS.priorityOverrides, priorityOverrides);
      renderPriorityCollector();
      saveStopOverrideData(key);
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
        ${buildCheckTimesHtml(p)}
        ${infoRows.length ? `<div class="stay-info-grid">${infoRows.map(([icon, label, val]) =>
          `<div class="stay-info-item"><span class="stay-info-icon">${icon}</span><span class="stay-info-label">${label}</span><span class="stay-info-val">${val}</span></div>`
        ).join('')}</div>` : ''}
        ${p.extra ? `<div class="stay-extra">${linkify(p.extra)}</div>` : ''}
        <div class="stay-photo-actions">
          <label class="stay-photo-btn" for="stayPhotoFile_${key}">📷 ${photoSrc ? 'Cambia' : 'Aggiungi'} foto dal dispositivo</label>
          <input type="file" id="stayPhotoFile_${key}" data-key="${key}" accept="image/*" style="display:none">
          ${photoSrc ? `<span class="stay-photo-remove" data-key="${key}">🗑️ Rimuovi foto</span>` : ''}
        </div>
        <div class="stay-photo-link-row">
          <input type="text" class="stay-photo-link-input" data-key="${key}" placeholder="...oppure incolla qui un link diretto a un'immagine" value="${(photoSrc && !photoSrc.startsWith('data:')) ? photoSrc.replace(/"/g, '&quot;') : ''}">
          <button class="stay-photo-link-save" data-key="${key}">Salva link</button>
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
          const compress = (maxDim, quality) => {
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
            return canvas.toDataURL('image/jpeg', quality);
          };
          let dataUrl = compress(1280, 0.78);
          if (dataUrl.length > 900000) dataUrl = compress(1000, 0.6);
          if (dataUrl.length > 900000) dataUrl = compress(700, 0.5);

          pernottamentoPhoto[key] = dataUrl;
          const ok = saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
          if (!ok) {
            delete pernottamentoPhoto[key];
            alert('Spazio di archiviazione esaurito: elimina qualche foto già caricata e riprova.');
            return;
          }
          renderInfo();
          savePhotoValue(key, 'stay', dataUrl, (success) => {
            if (!success) console.warn('La foto resta salvata solo su questo dispositivo per ora.');
          });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  });

  list.querySelectorAll('.stay-photo-remove').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      delete pernottamentoPhoto[key];
      saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
      renderInfo();
      deletePhotoValue(key, 'stay');
    });
  });

  list.querySelectorAll('.stay-photo-link-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const input = list.querySelector(`.stay-photo-link-input[data-key="${key}"]`);
      const val = input.value.trim();
      if (!val) return;
      pernottamentoPhoto[key] = val;
      saveStore(STORE_KEYS.pernottamentoPhoto, pernottamentoPhoto);
      renderInfo();
      savePhotoValue(key, 'stay', val, (success) => {
        if (!success) console.warn('Il link resta salvato solo su questo dispositivo per ora.');
      });
    });
  });

  list.querySelectorAll('.stay-note-textarea').forEach(ta => {
    ta.addEventListener('blur', () => {
      pernottamentoNote[ta.dataset.key] = ta.value;
      saveStore(STORE_KEYS.pernottamentoNote, pernottamentoNote);
      savePernottamentoData(ta.dataset.key);
    });
  });
}

// ---------------- view switching ----------------
function switchView(view) {
  currentView = view;
  document.getElementById('view-days').style.display = view === 'days' ? '' : 'none';
  document.getElementById('view-budget').style.display = view === 'budget' ? '' : 'none';
  document.getElementById('view-info').style.display = view === 'info' ? '' : 'none';
  document.getElementById('view-utili').style.display = view === 'utili' ? '' : 'none';
  document.getElementById('fabAddExpenseTop').style.display = (view === 'info' || view === 'utili') ? 'none' : '';
  document.querySelectorAll('.navbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  if (view === 'budget') renderBudget();
  if (view === 'info') renderInfo();
  if (view === 'utili') renderUtili();
}

// ---------------- vista "Utili": link curati + note personalizzate a sezioni ----------------
const USEFUL_LINKS = [
  { icon: '🌌', title: 'Previsioni aurora boreale', url: 'https://en.vedur.is/weather/forecasts/aurora/', desc: 'Mappa nuvolosità + indice KP, ufficiale Veðurstofa Íslands.' },
  { icon: '🌤️', title: 'Meteo Islanda', url: 'https://en.vedur.is/', desc: 'Previsioni ufficiali, avvisi di vento e maltempo.' },
  { icon: '🛣️', title: 'Condizioni delle strade', url: 'https://www.road.is/', desc: 'Stato in tempo reale di ogni strada, chiusure, webcam (anche umferdin.is).' },
  { icon: '🆘', title: 'SafeTravel — piano di viaggio', url: 'https://safetravel.is/', desc: 'Avvisi di sicurezza, registra il tuo percorso giornaliero, link all\'app 112.' },
  { icon: '🅿️', title: 'Parcheggi — app Parka', url: 'https://parka.is/', desc: 'App più diffusa per pagare i parcheggi in tutta l\'Islanda.' },
  { icon: '🅿️', title: 'Parcheggi — app EasyPark', url: 'https://easypark.is/', desc: 'Alternativa a Parka, molto usata anche a Reykjavík.' },
  { icon: '⛽', title: 'Distributori N1', url: 'https://www.n1.is/', desc: 'Rete di distributori più diffusa, utile per programmare i rifornimenti.' },
  { icon: '⛽', title: 'Distributori Orkan', url: 'https://www.orkan.is/', desc: 'Altra rete di distributori diffusa in tutta l\'isola.' },
  { icon: '📞', title: 'Emergenze — 112 Iceland', url: 'https://www.112.is/', desc: 'Numero unico di emergenza islandese; l\'app invia la posizione GPS ai soccorsi.' },
];

function renderUsefulLinks() {
  const grid = document.getElementById('usefulLinksGrid');
  grid.innerHTML = USEFUL_LINKS.map(l => `
    <a class="useful-link-card" href="${l.url}" target="_blank" rel="noopener">
      <div class="ul-icon">${l.icon}</div>
      <div class="ul-body">
        <div class="ul-title">${l.title}</div>
        <div class="ul-desc">${l.desc}</div>
      </div>
    </a>
  `).join('');
}

function renderCustomSections() {
  const box = document.getElementById('customSectionsList');
  if (customSections.length === 0) {
    box.innerHTML = `<div class="pc-hint">Nessuna sezione ancora — tocca "➕ Aggiungi una sezione" per iniziare.</div>`;
    return;
  }
  const sorted = [...customSections].sort((a, b) => a.ts - b.ts);
  box.innerHTML = sorted.map(sec => `
    <div class="custom-section-card" data-id="${sec.id}">
      <div class="cs-header">
        <div class="cs-title">${sec.title}</div>
        <div class="cs-actions">
          <span class="cs-edit" data-id="${sec.id}">✏️</span>
          <span class="cs-delete" data-id="${sec.id}">🗑️</span>
        </div>
      </div>
      <div class="cs-text">${linkify(sec.text || '')}</div>
      <div class="cs-edit-box" id="csEdit_${sec.id}" style="display:none;">
        <input type="text" class="cs-edit-title" value="${sec.title.replace(/"/g, '&quot;')}" placeholder="Titolo sezione">
        <textarea class="cs-edit-text" placeholder="Testo della sezione...">${sec.text || ''}</textarea>
        <div class="detail-edit-actions">
          <button class="btn primary cs-save" data-id="${sec.id}">Salva</button>
          <span class="detail-reset-link cs-cancel" data-id="${sec.id}">Annulla</span>
        </div>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.cs-edit').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('csEdit_' + el.dataset.id).style.display = 'block';
    });
  });
  box.querySelectorAll('.cs-cancel').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('csEdit_' + el.dataset.id).style.display = 'none';
    });
  });
  box.querySelectorAll('.cs-save').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const card = box.querySelector(`.custom-section-card[data-id="${id}"]`);
      const title = card.querySelector('.cs-edit-title').value.trim() || 'Senza titolo';
      const text = card.querySelector('.cs-edit-text').value.trim();
      if (typeof db !== 'undefined' && db) {
        db.collection('customSections').doc(id).update({ title, text }).catch((err) => {
          console.warn('Aggiornamento sezione fallito:', err);
          alert('⚠️ Modifica non salvata in modo permanente. Errore: ' + (err.code || err.message || err));
        });
      } else {
        const sec = customSections.find(s => s.id === id);
        if (sec) { sec.title = title; sec.text = text; saveStore(STORE_KEYS.customSections, customSections); renderCustomSections(); }
      }
    });
  });
  box.querySelectorAll('.cs-delete').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (!confirm('Eliminare questa sezione?')) return;
      if (typeof db !== 'undefined' && db && customSectionsFirestoreConnected) {
        db.collection('customSections').doc(id).delete().catch((err) => console.warn('Eliminazione sezione fallita:', err));
      } else {
        customSections = customSections.filter(s => s.id !== id);
        saveStore(STORE_KEYS.customSections, customSections);
        renderCustomSections();
      }
    });
  });
}

document.getElementById('addCustomSectionBtn').addEventListener('click', () => {
  const title = prompt('Titolo della sezione (es. "Documenti", "Numeri utili"):');
  if (!title || !title.trim()) return;
  const text = prompt('Testo della sezione (puoi modificarlo dopo):') || '';
  const entry = { title: title.trim(), text: text.trim(), ts: Date.now() };
  if (typeof db !== 'undefined' && db) {
    db.collection('customSections').add(entry).catch((err) => {
      console.warn('Salvataggio sezione su Firestore fallito, salvo solo in locale:', err);
      entry.id = 'cs' + Date.now() + Math.random().toString(36).slice(2, 7);
      customSections.push(entry);
      saveStore(STORE_KEYS.customSections, customSections);
      renderCustomSections();
    });
  } else {
    entry.id = 'cs' + Date.now() + Math.random().toString(36).slice(2, 7);
    customSections.push(entry);
    saveStore(STORE_KEYS.customSections, customSections);
    renderCustomSections();
  }
});

function renderUtili() {
  renderUsefulLinks();
  renderCustomSections();
}

document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ---------------- ricerca globale delle località ----------------
const searchModalBackdrop = document.getElementById('searchModalBackdrop');

function openSearchModal() {
  document.getElementById('searchInput').value = '';
  renderSearchResults('');
  searchModalBackdrop.classList.add('open');
  lockBodyScroll();
  setTimeout(() => document.getElementById('searchInput').focus(), 50);
}
function closeSearchModal() {
  searchModalBackdrop.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('searchOpenDesktop').addEventListener('click', openSearchModal);
document.getElementById('searchOpenMobile').addEventListener('click', openSearchModal);
document.getElementById('searchClose').addEventListener('click', closeSearchModal);
searchModalBackdrop.addEventListener('click', (e) => { if (e.target === searchModalBackdrop) closeSearchModal(); });

function normalizeForSearch(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // ignora maiuscole/accenti
}

function renderSearchResults(query) {
  const box = document.getElementById('searchResults');
  const q = normalizeForSearch(query.trim());

  const allStops = [];
  TRIP_DATA.days.forEach(day => {
    getMergedStops(day).forEach(({ key, stop }) => {
      if (!stop.a) return;
      allStops.push({ key, day, name: stop.a, hidden: isStopHidden(key) });
    });
  });

  const results = q
    ? allStops.filter(s => normalizeForSearch(s.name).includes(q))
    : [];

  if (!q) {
    box.innerHTML = `<div class="search-hint">Scrivi il nome di una località per trovarla in qualsiasi giorno, senza doverli scorrere uno a uno.</div>`;
    return;
  }
  if (results.length === 0) {
    box.innerHTML = `<div class="search-hint">Nessuna località trovata per "${query}".</div>`;
    return;
  }
  box.innerHTML = results.slice(0, 40).map(r => `
    <div class="search-result-row" data-key="${r.key}" data-day="${r.day.id}">
      <span class="search-result-day">${getDayLabel(r.day)}</span>
      <span class="search-result-name">${r.name}${r.hidden ? ' <em>(nascosta)</em>' : ''}</span>
    </div>
  `).join('');

  box.querySelectorAll('.search-result-row').forEach(row => {
    row.addEventListener('click', () => {
      const dayId = parseInt(row.dataset.day, 10);
      const key = row.dataset.key;
      closeSearchModal();
      currentDayId = dayId;
      switchView('days');
      renderDayTabs();
      renderDayView();
      const day = TRIP_DATA.days.find(d => d.id === dayId);
      setTimeout(() => openStopDetailModal(day, key), 150);
    });
  });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  renderSearchResults(e.target.value);
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
  const splitField = document.getElementById('expSplitField');

  if (selectedType === 'shared') {
    sourceField.style.display = '';
    if (selectedSource === 'card') {
      paidByField.style.display = 'none';
    } else {
      paidByField.style.display = '';
      paidByLabel.textContent = 'Anticipato da';
    }
    splitField.style.display = 'none'; // una spesa di cassa comune è già divisa tra tutti
  } else {
    // spesa personale: niente scelta di fonte, serve solo sapere chi l'ha pagata
    sourceField.style.display = 'none';
    paidByField.style.display = '';
    paidByLabel.textContent = 'Pagato da';
    splitField.style.display = '';
  }
}

function renderExpSplitPeople() {
  const box = document.getElementById('expSplitPeople');
  const payer = document.getElementById('expPaidBy').value;
  box.innerHTML = participants.map(p => `
    <label class="exp-split-person">
      <input type="checkbox" value="${p}" ${p === payer ? 'checked' : ''}> ${p}
    </label>
  `).join('');
}

document.getElementById('expSplitToggle').addEventListener('change', (e) => {
  const box = document.getElementById('expSplitPeople');
  box.style.display = e.target.checked ? '' : 'none';
  if (e.target.checked) renderExpSplitPeople();
});

document.getElementById('expPaidBy').addEventListener('change', () => {
  if (document.getElementById('expSplitToggle').checked) renderExpSplitPeople();
});

function openExpenseModal() {
  const daySel = document.getElementById('expDay');
  daySel.innerHTML = TRIP_DATA.days.map(d => `<option value="${getDayLabel(d)}">${getDayLabel(d)}</option>`).join('')
    + `<option value="Generale">Generale (aereo, noleggio, ecc.)</option>`;
  const currentDay = TRIP_DATA.days.find(d => d.id === currentDayId);
  daySel.value = currentDay ? getDayLabel(currentDay) : `Giorno ${currentDayId + 1}`;

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
  document.getElementById('expSplitToggle').checked = false;
  document.getElementById('expSplitPeople').style.display = 'none';
  document.getElementById('expSplitPeople').innerHTML = '';
  document.getElementById('iskConverterBox').style.display = 'none';
  document.getElementById('iskAmount').value = '';
  updateModalFieldsVisibility();
  expModalBackdrop.classList.add('open');
  lockBodyScroll();
}

document.getElementById('iskConverterToggle').addEventListener('click', () => {
  const box = document.getElementById('iskConverterBox');
  const opening = box.style.display === 'none';
  box.style.display = opening ? '' : 'none';
  if (opening) fetchDailyIskRate();
});
function updateEuroFromIsk() {
  const isk = parseFloat(document.getElementById('iskAmount').value);
  const rate = parseFloat(document.getElementById('iskRate').value) || 140.8;
  if (isk > 0) {
    document.getElementById('expAmount').value = (isk / rate).toFixed(2);
  }
}
document.getElementById('iskAmount').addEventListener('input', updateEuroFromIsk);
document.getElementById('iskRate').addEventListener('input', updateEuroFromIsk);

// tasso di cambio EUR->ISK preso una volta al giorno da Frankfurter (Banca Centrale Europea),
// servizio gratuito senza chiave — se non risponde, resta il valore già presente nel campo
async function fetchDailyIskRate() {
  const today = new Date().toISOString().slice(0, 10);
  const cached = loadStore(STORE_KEYS.iskRateCache, null);
  if (cached && cached.date === today) {
    document.getElementById('iskRate').value = cached.rate;
    return;
  }
  const hint = document.querySelector('.isk-converter-hint');
  const originalHint = hint ? hint.textContent : '';
  if (hint) hint.textContent = '⏳ Aggiorno il tasso di oggi…';
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=ISK');
    const data = await res.json();
    const rate = data && data.rates && data.rates.ISK;
    if (rate) {
      document.getElementById('iskRate').value = Math.round(rate * 10) / 10;
      saveStore(STORE_KEYS.iskRateCache, { rate: Math.round(rate * 10) / 10, date: today });
      updateEuroFromIsk();
    }
  } catch (err) {
    console.warn('Aggiornamento tasso ISK fallito, uso quello già presente:', err);
  } finally {
    if (hint) hint.textContent = originalHint;
  }
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
  const paidByVal = paymentSource === 'card' ? null : document.getElementById('expPaidBy').value;
  let splitAmong = null;
  if (!isShared && document.getElementById('expSplitToggle').checked) {
    splitAmong = Array.from(document.querySelectorAll('#expSplitPeople input[type="checkbox"]:checked')).map(el => el.value);
    if (splitAmong.length < 1) splitAmong = null; // nessuno selezionato: tratta come spesa puramente personale
  }
  const entry = {
    day: document.getElementById('expDay').value,
    category: selectedCategory,
    amount: amount,
    note: document.getElementById('expNote').value.trim(),
    paidBy: paidByVal,
    shared: isShared,
    paymentSource: paymentSource,
    splitAmong: splitAmong,
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

// ---------------- registrare un pagamento di saldo già effettuato ----------------
const settlementModalBackdrop = document.getElementById('settlementModalBackdrop');

function openSettlementModal() {
  const fromSel = document.getElementById('setFrom');
  const toSel = document.getElementById('setTo');
  fromSel.innerHTML = participants.map(p => `<option value="${p}">${p}</option>`).join('');
  toSel.innerHTML = participants.map(p => `<option value="${p}">${p}</option>`).join('');
  if (participants.length > 1) toSel.selectedIndex = 1; // di default diverso dal primo, comodo
  document.getElementById('setAmount').value = '';
  document.getElementById('setNote').value = '';
  settlementModalBackdrop.classList.add('open');
  lockBodyScroll();
}

document.getElementById('fabAddSettlement').addEventListener('click', openSettlementModal);
document.getElementById('setCancel').addEventListener('click', () => { settlementModalBackdrop.classList.remove('open'); unlockBodyScroll(); });
settlementModalBackdrop.addEventListener('click', (e) => { if (e.target === settlementModalBackdrop) { settlementModalBackdrop.classList.remove('open'); unlockBodyScroll(); } });

document.getElementById('setSave').addEventListener('click', () => {
  const from = document.getElementById('setFrom').value;
  const to = document.getElementById('setTo').value;
  const amount = parseFloat(document.getElementById('setAmount').value);
  if (!amount || amount <= 0) {
    document.getElementById('setAmount').focus();
    return;
  }
  if (from === to) {
    alert('"Chi paga" e "A chi" devono essere due persone diverse.');
    return;
  }
  const entry = {
    from, to, amount,
    note: document.getElementById('setNote').value.trim(),
    ts: Date.now(),
  };
  if (typeof db !== 'undefined' && db) {
    db.collection('settlements').add(entry).catch((err) => {
      console.warn('Salvataggio pagamento su Firestore fallito, salvo solo in locale:', err);
      entry.id = 's' + Date.now() + Math.random().toString(36).slice(2, 7);
      settlements.push(entry);
      saveStore(STORE_KEYS.settlements, settlements);
      if (currentView === 'budget') renderBudget();
    });
  } else {
    entry.id = 's' + Date.now() + Math.random().toString(36).slice(2, 7);
    settlements.push(entry);
    saveStore(STORE_KEYS.settlements, settlements);
    if (currentView === 'budget') renderBudget();
  }
  settlementModalBackdrop.classList.remove('open');
  unlockBodyScroll();
  if (currentView === 'budget') renderBudget();
});

function renderSettlementsList() {
  const box = document.getElementById('settlementsList');
  if (!box) return;
  if (settlements.length === 0) {
    box.innerHTML = '';
    return;
  }
  const sorted = [...settlements].sort((a, b) => b.ts - a.ts);
  box.innerHTML = `<div class="section-title" style="padding-left:0;">💸 Pagamenti già registrati</div>` +
    sorted.map(st => `
      <div class="settlement-item">
        <div class="settlement-main">${st.from} → ${st.to}: <b>${fmtEuro(st.amount)}</b>${st.note ? ' · ' + st.note : ''}</div>
        <span class="del" data-id="${st.id}">✕</span>
      </div>
    `).join('');
  box.querySelectorAll('.del').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (typeof db !== 'undefined' && db && settlementsFirestoreConnected) {
        db.collection('settlements').doc(id).delete().catch((err) => console.warn('Eliminazione pagamento fallita:', err));
      } else {
        settlements = settlements.filter(s => s.id !== id);
        saveStore(STORE_KEYS.settlements, settlements);
        renderBudget();
      }
    });
  });
}


document.getElementById('exportBtn').addEventListener('click', () => {
  const payload = { doneStops, personalNotes, expenses, settlements, participants, startTimes, durationOverrides, cardTopups, descriptionOverrides, noteOverrides, priorityOverrides, suggestions, photoOverrides, mapsOverrides, hiddenStops, customStopsByDay, pernottamentoPhoto, pernottamentoNote, pernottamentoFieldOverrides, customSections, dayNotes, dayStartLocationOverrides, stopOrderByDay, exportedAt: new Date().toISOString() };
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
      ['settlements', STORE_KEYS.settlements],
      ['customSections', STORE_KEYS.customSections],
      ['dayNotes', STORE_KEYS.dayNotes],
      ['dayStartLocationOverrides', STORE_KEYS.dayStartLocation],
      ['stopOrderByDay', STORE_KEYS.stopOrder],
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
    settlements = loadStore(STORE_KEYS.settlements, []);
    customSections = loadStore(STORE_KEYS.customSections, []);
    dayNotes = loadStore(STORE_KEYS.dayNotes, {});
    dayStartLocationOverrides = loadStore(STORE_KEYS.dayStartLocation, {});
    stopOrderByDay = loadStore(STORE_KEYS.stopOrder, {});
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

// ---------------- ripristino di un backup per TUTTI (spinge i dati su Firestore) ----------------
// A differenza di "Importa un backup" (che salva solo su questo telefono, e verrebbe risovrascritto
// dalla prossima sincronizzazione), questo pubblica davvero il contenuto del backup su Firestore,
// così diventa il dato "vero" per tutti i dispositivi — pensato per riparare un pasticcio condiviso
// (es. priorità sballate), non per l'uso quotidiano.
document.getElementById('restoreEverywhereFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      alert('File non valido: assicurati di aver selezionato un backup .json esportato da questa app.');
      e.target.value = '';
      return;
    }
    if (typeof db === 'undefined' || !db) {
      alert('⚠️ Nessuna connessione a Firestore in questo momento: impossibile ripristinare per tutti. Riprova quando sei online.');
      e.target.value = '';
      return;
    }
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('it-IT') : 'data sconosciuta';
    const ok = confirm(`⚠️ ATTENZIONE — azione importante.\n\nQuesto ripristinerà il backup del ${when} per TUTTI i partecipanti, sovrascrivendo su Firestore priorità, descrizioni, note, foto, ordine tappe, orari, pernottamenti e tutto il resto — anche quello inserito da altri dopo questa data.\n\nProcedere?`);
    if (!ok) { e.target.value = ''; return; }
    const ok2 = confirm('Sei sicuro? Questa azione non si può annullare facilmente — conviene farla una volta sola, con calma.');
    if (!ok2) { e.target.value = ''; return; }

    const statusMsg = (txt) => { console.log(txt); };
    let pushedCount = 0, failedCount = 0;
    const track = (p) => p.then(() => { pushedCount++; }).catch(() => { failedCount++; });

    const pending = [];

    // sharedStopOverrides: descrizione/note/priorità/posizione/durata, tutte insieme per chiave-tappa
    const stopKeys = new Set([
      ...Object.keys(data.descriptionOverrides || {}), ...Object.keys(data.noteOverrides || {}),
      ...Object.keys(data.priorityOverrides || {}), ...Object.keys(data.mapsOverrides || {}),
      ...Object.keys(data.durationOverrides || {}),
    ]);
    stopKeys.forEach(key => {
      descriptionOverrides[key] = (data.descriptionOverrides || {})[key];
      noteOverrides[key] = (data.noteOverrides || {})[key];
      priorityOverrides[key] = (data.priorityOverrides || {})[key];
      mapsOverrides[key] = (data.mapsOverrides || {})[key];
      durationOverrides[key] = (data.durationOverrides || {})[key];
      const docId = firestoreSafeDocId('stopov_' + key);
      const payload = {
        key,
        description: Object.prototype.hasOwnProperty.call(data.descriptionOverrides || {}, key) ? data.descriptionOverrides[key] : null,
        note: Object.prototype.hasOwnProperty.call(data.noteOverrides || {}, key) ? data.noteOverrides[key] : null,
        priority: Object.prototype.hasOwnProperty.call(data.priorityOverrides || {}, key) ? data.priorityOverrides[key] : null,
        mapsPosition: Object.prototype.hasOwnProperty.call(data.mapsOverrides || {}, key) ? data.mapsOverrides[key] : null,
        duration: Object.prototype.hasOwnProperty.call(data.durationOverrides || {}, key) ? data.durationOverrides[key] : null,
      };
      pending.push(track(db.collection('sharedStopOverrides').doc(docId).set(payload)));
    });

    // hidden stops: prima ripulisce quelle attuali non presenti nel backup, poi scrive quelle del backup
    const backupHidden = data.hiddenStops || {};
    Object.keys(hiddenStops || {}).forEach(key => {
      if (!backupHidden[key]) pending.push(track(db.collection('sharedHiddenStops').doc(firestoreSafeDocId('hidden_' + key)).delete()));
    });
    Object.keys(backupHidden).forEach(key => {
      pending.push(track(db.collection('sharedHiddenStops').doc(firestoreSafeDocId('hidden_' + key)).set({ key })));
    });

    // tappe personalizzate: riscrive quelle del backup (le eventuali extra sul dispositivo corrente restano, si eliminano a mano se serve)
    Object.entries(data.customStopsByDay || {}).forEach(([dayId, arr]) => {
      (arr || []).forEach(entry => {
        pending.push(track(db.collection('sharedCustomStops').doc(firestoreSafeDocId('customstop_' + entry.key)).set({ dayId: String(dayId), ...entry })));
      });
    });

    // ordine tappe per giorno
    Object.entries(data.stopOrderByDay || {}).forEach(([dayId, order]) => {
      pending.push(track(db.collection('sharedStopOrder').doc(firestoreSafeDocId('order_' + dayId)).set({ dayId: String(dayId), order: order || [] })));
    });

    // orari di partenza e punto di partenza per giorno
    Object.entries(data.startTimes || {}).forEach(([dayId, time]) => {
      pending.push(track(db.collection('sharedStartTimes').doc(firestoreSafeDocId('starttime_' + dayId)).set({ dayId: String(dayId), time })));
    });
    Object.entries(data.dayStartLocationOverrides || {}).forEach(([dayId, text]) => {
      pending.push(track(db.collection('sharedDayStartLocations').doc(firestoreSafeDocId('daystartloc_' + dayId)).set({ dayId: String(dayId), text })));
    });
    Object.entries(data.dayNotes || {}).forEach(([dayId, text]) => {
      pending.push(track(db.collection('sharedDayNotes').doc(firestoreSafeDocId('daynote_' + dayId)).set({ dayId: String(dayId), text })));
    });

    // pernottamenti: dati struttura/camere/ecc, foto e note
    Object.entries(data.pernottamentoFieldOverrides || {}).forEach(([notte, fields]) => {
      const noteVal = (data.pernottamentoNote || {})[notte] || '';
      pending.push(track(db.collection('sharedPernottamentoData').doc(firestoreSafeDocId('pern_' + notte)).set({ notte: String(notte), fields: fields || {}, note: noteVal })));
    });

    await Promise.all(pending);

    // spese, saldi e altri dati "personali per dispositivo" non vengono toccati qui apposta: restano
    // gestiti da "Importa un backup" (sopra), per non rischiare di sovrascrivere lavoro recente
    // fatto da altri con una logica diversa da quella già collaudata sopra

    alert(`Ripristino completato.\n\nDocumenti scritti con successo: ${pushedCount}\nFalliti: ${failedCount}\n\nOra pulisci la cache su OGNI dispositivo (disinstalla → cancella dati → riavvia → reinstalla) perché tutti vedano i dati ripristinati.`);
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
