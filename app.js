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
  localStorage.setItem(key, JSON.stringify(value));
}

let doneStops = loadStore(STORE_KEYS.done, {});
let personalNotes = loadStore(STORE_KEYS.notes, {});
let expenses = loadStore(STORE_KEYS.expenses, []);
let startTimes = loadStore(STORE_KEYS.startTimes, {});             // { "1": "08:00", ... }
let durationOverrides = loadStore(STORE_KEYS.durationOverrides, {}); // { "1_0": {guida:40, visita:30}, ... }
let participants = loadStore(STORE_KEYS.participants,
  ['Emilio', 'Giusi', 'Marco', 'Giulio', 'Grazia', 'Ettore']);
let cardTopups = loadStore(STORE_KEYS.cardTopups, []); // [{id, person, amount, ts}]
let descriptionOverrides = loadStore(STORE_KEYS.descriptionOverrides, {}); // { "1_0": "testo modificato dall'utente", ... }
let noteOverrides = loadStore(STORE_KEYS.noteOverrides, {}); // { "1_0": "nota pratica modificata dall'utente", ... }

function getEffectiveDescription(dayId, idx, s) {
  const key = stopKey(dayId, idx);
  return Object.prototype.hasOwnProperty.call(descriptionOverrides, key)
    ? descriptionOverrides[key]
    : (s.descrizione || '');
}
function getEffectiveNote(dayId, idx, s) {
  const key = stopKey(dayId, idx);
  return Object.prototype.hasOwnProperty.call(noteOverrides, key)
    ? noteOverrides[key]
    : (s.note || '');
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
function getEffectiveDurations(dayId, idx, stop) {
  const ov = durationOverrides[stopKey(dayId, idx)] || {};
  const guidaMin = ov.guida !== undefined ? ov.guida : parseHM(stop.guida);
  const visitaMin = ov.visita !== undefined ? ov.visita : parseHM(stop.visita);
  return { guidaMin, visitaMin };
}
function computeDayChain(day) {
  let cursor = parseHM(getStartTime(day.id));
  const out = [];
  day.stops.forEach((s, idx) => {
    const { guidaMin, visitaMin } = getEffectiveDurations(day.id, idx, s);
    const partenza = cursor;
    const arrivo = cursor + guidaMin;
    out.push({ partenza, arrivo, guidaMin, visitaMin });
    cursor = arrivo + visitaMin;
  });
  return out;
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
let currentDetailIdx = null;

async function openStopDetailModal(day, idx) {
  const s = day.stops[idx];
  if (!s) return;
  currentDetailDay = day;
  currentDetailIdx = idx;
  const chain = computeDayChain(day);
  const { guidaMin, visitaMin } = chain[idx];

  const backdrop = document.getElementById('stopDetailBackdrop');
  const photoBox = document.getElementById('detailPhoto');
  const eyebrow = document.getElementById('detailEyebrow');
  const titleEl = document.getElementById('detailTitle');
  const badgesBox = document.getElementById('detailBadges');
  const descEl = document.getElementById('detailDesc');
  const noteSection = document.getElementById('detailNoteSection');
  const noteEl = document.getElementById('detailNote');
  const editBox = document.getElementById('detailDescEdit');
  const textarea = document.getElementById('detailDescTextarea');
  const resetLink = document.getElementById('detailDescReset');

  eyebrow.textContent = `Tappa ${idx + 1} · ${day.label || 'Giorno ' + day.id} · da ${s.da || ''}`;
  titleEl.textContent = s.a || '';

  const pri = priorityInfo(s.priorita);
  let badges = '';
  if (pri) badges += `<span class="badge ${pri.cls}">${pri.label}</span>`;
  if (guidaMin > 0) badges += `<span class="badge time">🚗 ${formatDurationMin(guidaMin)}${s.km ? ' · ' + s.km + ' km' : ''}</span>`;
  if (visitaMin > 0) badges += `<span class="badge time">⏱ ${formatDurationMin(visitaMin)}</span>`;
  if (s.parcheggio !== null && s.parcheggio !== undefined) {
    badges += s.parcheggio > 0 ? `<span class="badge cost">🅿️ ${fmtEuro(s.parcheggio)}</span>` : `<span class="badge free">🅿️ gratuito</span>`;
  }
  if (s.ingresso !== null && s.ingresso !== undefined && s.ingresso > 0) {
    badges += `<span class="badge cost">🎟 ${fmtEuro(s.ingresso)}</span>`;
  }
  badgesBox.innerHTML = badges;

  renderDetailDescription(day, idx, s);
  editBox.classList.remove('open');
  const key = stopKey(day.id, idx);
  resetLink.style.display = Object.prototype.hasOwnProperty.call(descriptionOverrides, key) ? '' : 'none';

  renderDetailNote(day, idx, s);
  document.getElementById('detailNoteEdit').classList.remove('open');
  const noteKeyD = stopKey(day.id, idx);
  document.getElementById('detailNoteReset').style.display =
    Object.prototype.hasOwnProperty.call(noteOverrides, noteKeyD) ? '' : 'none';

  if (s.wiki) {
    photoBox.style.display = '';
    photoBox.innerHTML = `<div class="detail-photo-loading">📷 carico foto…</div>`;
    getWikiImage(s.wiki).then(src => {
      if (src) {
        photoBox.innerHTML = `<img src="${src}" alt="${s.a}" loading="lazy">`;
      } else {
        photoBox.innerHTML = '';
        photoBox.style.display = 'none';
      }
    });
  } else {
    photoBox.style.display = 'none';
    photoBox.innerHTML = '';
  }

  backdrop.classList.add('open');
  lockBodyScroll();
}

function renderDetailDescription(day, idx, s) {
  const descEl = document.getElementById('detailDesc');
  const textarea = document.getElementById('detailDescTextarea');
  const effective = getEffectiveDescription(day.id, idx, s);
  if (effective) {
    descEl.innerHTML = effective.split('\n\n').map(p => `<p>${p}</p>`).join('');
  } else {
    descEl.innerHTML = `<p class="detail-desc-empty">Nessuna descrizione ancora per questa tappa. Tocca "✏️ Modifica" per scriverne una.</p>`;
  }
  textarea.value = effective;
}

function renderDetailNote(day, idx, s) {
  const noteEl = document.getElementById('detailNote');
  const textarea = document.getElementById('detailNoteTextarea');
  const effective = getEffectiveNote(day.id, idx, s);
  if (effective) {
    noteEl.textContent = effective;
    noteEl.classList.remove('detail-desc-empty');
  } else {
    noteEl.textContent = 'Nessuna nota pratica ancora. Tocca "✏️ Modifica" per aggiungerne una (es. condizioni strada, 4x4, guadi).';
    noteEl.classList.add('detail-desc-empty');
  }
  textarea.value = effective;
}

document.getElementById('detailEditToggle').addEventListener('click', () => {
  document.getElementById('detailDescEdit').classList.toggle('open');
});
document.getElementById('detailNoteEditToggle').addEventListener('click', () => {
  document.getElementById('detailNoteEdit').classList.toggle('open');
});

document.getElementById('detailDescSave').addEventListener('click', () => {
  if (!currentDetailDay || currentDetailIdx === null) return;
  const key = stopKey(currentDetailDay.id, currentDetailIdx);
  const val = document.getElementById('detailDescTextarea').value.trim();
  descriptionOverrides[key] = val;
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  const s = currentDetailDay.stops[currentDetailIdx];
  renderDetailDescription(currentDetailDay, currentDetailIdx, s);
  document.getElementById('detailDescEdit').classList.remove('open');
  document.getElementById('detailDescReset').style.display = '';
  renderDayView(); // aggiorna eventuale visibilità pulsante "Scheda" nella lista
});

document.getElementById('detailDescReset').addEventListener('click', () => {
  if (!currentDetailDay || currentDetailIdx === null) return;
  const key = stopKey(currentDetailDay.id, currentDetailIdx);
  delete descriptionOverrides[key];
  saveStore(STORE_KEYS.descriptionOverrides, descriptionOverrides);
  const s = currentDetailDay.stops[currentDetailIdx];
  renderDetailDescription(currentDetailDay, currentDetailIdx, s);
  document.getElementById('detailDescReset').style.display = 'none';
});

document.getElementById('detailNoteSave').addEventListener('click', () => {
  if (!currentDetailDay || currentDetailIdx === null) return;
  const key = stopKey(currentDetailDay.id, currentDetailIdx);
  const val = document.getElementById('detailNoteTextarea').value.trim();
  noteOverrides[key] = val;
  saveStore(STORE_KEYS.noteOverrides, noteOverrides);
  const s = currentDetailDay.stops[currentDetailIdx];
  renderDetailNote(currentDetailDay, currentDetailIdx, s);
  document.getElementById('detailNoteEdit').classList.remove('open');
  document.getElementById('detailNoteReset').style.display = '';
});

document.getElementById('detailNoteReset').addEventListener('click', () => {
  if (!currentDetailDay || currentDetailIdx === null) return;
  const key = stopKey(currentDetailDay.id, currentDetailIdx);
  delete noteOverrides[key];
  saveStore(STORE_KEYS.noteOverrides, noteOverrides);
  const s = currentDetailDay.stops[currentDetailIdx];
  renderDetailNote(currentDetailDay, currentDetailIdx, s);
  document.getElementById('detailNoteReset').style.display = 'none';
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

  const chain = computeDayChain(day);
  const firstDep = chain.length ? chain[0].partenza : parseHM(getStartTime(day.id));
  const lastArr = chain.length ? chain[chain.length - 1].arrivo : firstDep;

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

  const doneList = doneStops[day.id] || [];
  const donePct = day.stops.length ? Math.round((doneList.length / day.stops.length) * 100) : 0;
  document.getElementById('progressFill').style.width = donePct + '%';
  document.getElementById('progressLabel').textContent = `${doneList.length} / ${day.stops.length} tappe completate  ·  ${formatMin(firstDep)} → ${formatMin(lastArr)}`;

  const list = document.getElementById('stopsList');
  list.innerHTML = '';

  day.stops.forEach((s, idx) => {
    const isDone = doneList.includes(idx);
    const card = document.createElement('div');
    card.className = 'stop-card' + (isDone ? ' done' : '');

    const noteKey = stopKey(day.id, idx);
    const { partenza, arrivo, guidaMin, visitaMin } = chain[idx];

    const pri = priorityInfo(s.priorita);
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

    const savedNote = personalNotes[noteKey] || '';
    const isOverridden = !!durationOverrides[noteKey];

    card.innerHTML = `
      <div class="stop-top">
        <div class="stop-check ${isDone ? 'checked' : ''}" data-idx="${idx}">${isDone ? '✓' : ''}</div>
        <div class="stop-main">
          <div class="stop-title-row">
            <div class="stop-title stop-title-clickable" data-idx="${idx}">${idx + 1}. ${s.a || ''}</div>
            <button class="stop-detail-btn detail-open" data-idx="${idx}">📖 Scheda</button>
          </div>
          <div class="stop-sub">da ${s.da || ''}</div>
          <div class="stop-times">
            🕗 <b>${formatMin(partenza)}</b> → <b>${formatMin(arrivo)}</b>
            <span class="stop-time-edit-toggle" data-idx="${idx}">✏️ orari${isOverridden ? ' •' : ''}</span>
          </div>
          <div class="stop-timeedit" data-idx="${idx}">
            <div class="te-row">
              <label>Guida (min)</label>
              <input type="number" min="0" step="1" class="te-guida" value="${guidaMin}">
            </div>
            <div class="te-row">
              <label>Visita (min)</label>
              <input type="number" min="0" step="1" class="te-visita" value="${visitaMin}">
            </div>
            <div class="te-actions">
              <button class="te-apply" data-idx="${idx}">Applica</button>
              ${isOverridden ? `<button class="te-reset" data-idx="${idx}">Ripristina</button>` : ''}
            </div>
          </div>
          <div class="stop-badges">${badges}</div>
          ${s.note ? `<div class="stop-note">${s.note}</div>` : ''}
          <span class="stop-toggle" data-idx="${idx}">✏️ Nota personale</span>
          <div class="stop-personal" data-idx="${idx}">
            <textarea placeholder="Scrivi qui una nota, un'impressione, un promemoria...">${savedNote}</textarea>
          </div>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  // wire checkboxes
  list.querySelectorAll('.stop-check').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      const arr = doneStops[currentDayId] || [];
      const pos = arr.indexOf(idx);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
      doneStops[currentDayId] = arr;
      saveStore(STORE_KEYS.done, doneStops);
      renderDayView();
    });
  });

  // wire personal note toggles
  list.querySelectorAll('.stop-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const idx = el.dataset.idx;
      const box = list.querySelector(`.stop-personal[data-idx="${idx}"]`);
      box.classList.toggle('open');
    });
  });

  // wire detail modal opener (titolo o bottone "Scheda completa")
  list.querySelectorAll('.detail-open, .stop-title-clickable').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      openStopDetailModal(day, idx);
    });
  });

  // wire textarea auto-save
  list.querySelectorAll('.stop-personal textarea').forEach(ta => {
    const idx = ta.closest('.stop-personal').dataset.idx;
    ta.addEventListener('blur', () => {
      const key = stopKey(currentDayId, idx);
      personalNotes[key] = ta.value;
      saveStore(STORE_KEYS.notes, personalNotes);
    });
  });

  // wire time-edit toggles
  list.querySelectorAll('.stop-time-edit-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const idx = el.dataset.idx;
      const box = list.querySelector(`.stop-timeedit[data-idx="${idx}"]`);
      box.classList.toggle('open');
    });
  });

  // wire apply/reset for per-stop duration overrides
  list.querySelectorAll('.te-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      const box = list.querySelector(`.stop-timeedit[data-idx="${idx}"]`);
      const guida = parseInt(box.querySelector('.te-guida').value, 10) || 0;
      const visita = parseInt(box.querySelector('.te-visita').value, 10) || 0;
      durationOverrides[stopKey(currentDayId, idx)] = { guida, visita };
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
    });
  });
  list.querySelectorAll('.te-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      delete durationOverrides[stopKey(currentDayId, idx)];
      saveStore(STORE_KEYS.durationOverrides, durationOverrides);
      renderDayView();
    });
  });
}

// ---------------- render: budget ----------------
function renderBudget() {
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
      expenses = expenses.filter(e => e.id !== id);
      saveStore(STORE_KEYS.expenses, expenses);
      renderBudget();
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

function renderInfo() {
  renderParticipants();
  renderCardTopups();
  const list = document.getElementById('pernottamentiList');
  list.innerHTML = '';
  TRIP_DATA.pernottamenti.forEach(p => {
    const card = document.createElement('div');
    card.className = 'info-card';
    card.innerHTML = `
      <div class="n">Notte ${p.notte} · ${p.checkin} → ${p.checkout}</div>
      <div class="s">${p.struttura}</div>
      <div class="l">${p.localita}</div>
    `;
    list.appendChild(card);
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
    id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
    day: document.getElementById('expDay').value,
    category: selectedCategory,
    amount: amount,
    note: document.getElementById('expNote').value.trim(),
    paidBy: paymentSource === 'card' ? null : document.getElementById('expPaidBy').value,
    shared: isShared,
    paymentSource: paymentSource,
    ts: Date.now(),
  };
  expenses.push(entry);
  saveStore(STORE_KEYS.expenses, expenses);
  expModalBackdrop.classList.remove('open');
  unlockBodyScroll();
  if (currentView === 'budget') renderBudget();
});

// ---------------- export / backup ----------------
document.getElementById('exportBtn').addEventListener('click', () => {
  const payload = { doneStops, personalNotes, expenses, participants, startTimes, durationOverrides, cardTopups, descriptionOverrides, exportedAt: new Date().toISOString() };
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
