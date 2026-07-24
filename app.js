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

const DEFAULT_START_TIME = '08:00';

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
function computeBalances() {
  const net = {};
  participants.forEach(p => { net[p] = 0; });
  expenses.forEach(e => {
    if (e.shared === false) return; // spesa personale, non entra nella cassa comune
    if (!e.paidBy || !(e.paidBy in net)) return;
    const share = e.amount / participants.length;
    net[e.paidBy] += e.amount - share;
    participants.forEach(p => {
      if (p !== e.paidBy) net[p] -= share;
    });
  });
  return net; // positivo = deve ricevere, negativo = deve dare
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

// ---------------- render: day tabs ----------------
function renderDayTabs() {
  const wrap = document.getElementById('dayTabs');
  wrap.innerHTML = '';
  TRIP_DATA.days.forEach(day => {
    const btn = document.createElement('button');
    btn.className = 'daytab' + (day.id === currentDayId ? ' active' : '');
    btn.textContent = `Giorno ${day.id}`;
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

    const pri = priorityInfo(s.priorita);
    let badges = '';
    if (pri) badges += `<span class="badge ${pri.cls}">${pri.label}</span>`;
    if (s.km) badges += `<span class="badge time">🚗 ${s.km} km</span>`;
    if (s.parcheggio !== null && s.parcheggio !== undefined) {
      badges += s.parcheggio > 0
        ? `<span class="badge cost">🅿️ ${fmtEuro(s.parcheggio)}</span>`
        : `<span class="badge free">🅿️ gratuito</span>`;
    }
    if (s.ingresso !== null && s.ingresso !== undefined && s.ingresso > 0) {
      badges += `<span class="badge cost">🎟 ${fmtEuro(s.ingresso)}</span>`;
    }

    const noteKey = stopKey(day.id, idx);
    const savedNote = personalNotes[noteKey] || '';
    const { partenza, arrivo, guidaMin, visitaMin } = chain[idx];
    const isOverridden = !!durationOverrides[noteKey];

    card.innerHTML = `
      <div class="stop-top">
        <div class="stop-check ${isDone ? 'checked' : ''}" data-idx="${idx}">${isDone ? '✓' : ''}</div>
        <div class="stop-main">
          <div class="stop-title">${idx + 1}. ${s.a || ''}</div>
          <div class="stop-sub">da ${s.da || ''}</div>
          <div class="stop-info-btns">
            ${s.descrizione ? `<span class="info-btn desc-toggle" data-idx="${idx}">📝 Descrizione</span>` : ''}
            ${s.wiki ? `<span class="info-btn photo-toggle" data-idx="${idx}">📷 Foto</span>` : ''}
          </div>
          ${s.descrizione ? `<div class="stop-descrizione" data-idx="${idx}"><p>${s.descrizione}</p></div>` : ''}
          ${s.wiki ? `<div class="stop-photo-panel" data-idx="${idx}" data-wiki="${s.wiki.replace(/"/g, '&quot;')}" data-loaded="0"></div>` : ''}
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

  // wire description toggle (bottone separato)
  list.querySelectorAll('.desc-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const idx = el.dataset.idx;
      const box = list.querySelector(`.stop-descrizione[data-idx="${idx}"]`);
      if (box) box.classList.toggle('open');
      el.classList.toggle('active', box && box.classList.contains('open'));
    });
  });

  // wire photo toggle (bottone separato) — carica la foto al primo apertura
  list.querySelectorAll('.photo-toggle').forEach(el => {
    el.addEventListener('click', async () => {
      const idx = el.dataset.idx;
      const box = list.querySelector(`.stop-photo-panel[data-idx="${idx}"]`);
      if (!box) return;
      box.classList.toggle('open');
      el.classList.toggle('active', box.classList.contains('open'));
      if (box.classList.contains('open') && box.dataset.loaded === '0') {
        box.dataset.loaded = '1';
        const wikiTitle = box.dataset.wiki;
        box.innerHTML = `<div class="stop-photo-loading">📷 carico foto…</div>`;
        const src = await getWikiImage(wikiTitle);
        if (src) {
          box.innerHTML = `<img src="${src}" alt="${wikiTitle}" loading="lazy">`;
        } else {
          box.innerHTML = `<div class="stop-photo-loading">📷 nessuna foto disponibile</div>`;
        }
      }
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

  // ---- saldi tra partecipanti ----
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
    balHtml += `<div class="empty-state">Nessuna spesa di cassa comune ancora, oppure i conti sono già in pari.</div>`;
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
    list.innerHTML = `<div class="empty-state">Nessuna spesa registrata ancora.<br>Usa il tasto "＋ Spesa" per iniziare.</div>`;
    return;
  }
  list.innerHTML = '';
  [...expenses].reverse().forEach(e => {
    const item = document.createElement('div');
    item.className = 'expense-item';
    const typeTag = e.shared === false ? '👤 personale' : '🤝 cassa comune';
    item.innerHTML = `
      <div class="info">
        <div class="cat">${e.category} — ${e.day}</div>
        <div class="meta">${typeTag} · pagato da ${e.paidBy || '—'}${e.note ? ' · ' + e.note : ''}</div>
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
      // aggiorna anche i riferimenti "pagato da" nelle spese già registrate
      expenses.forEach(e => { if (e.paidBy === oldVal) e.paidBy = newVal; });
      saveStore(STORE_KEYS.expenses, expenses);
      participants[i] = newVal;
      saveStore(STORE_KEYS.participants, participants);
    });
  });
}

function renderInfo() {
  renderParticipants();
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
  document.getElementById('fabAddExpense').style.display = view === 'info' ? 'none' : 'flex';
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
let selectedType = 'shared'; // 'shared' = cassa comune, 'personal' = spesa personale

function openExpenseModal() {
  const daySel = document.getElementById('expDay');
  daySel.innerHTML = TRIP_DATA.days.map(d => `<option value="Giorno ${d.id}">Giorno ${d.id}</option>`).join('')
    + Array.from({length: 14 - TRIP_DATA.days.length}, (_, i) => {
        const n = TRIP_DATA.days.length + i + 1;
        return `<option value="Giorno ${n}">Giorno ${n}</option>`;
      }).join('')
    + `<option value="Generale">Generale (aereo, noleggio, ecc.)</option>`;
  daySel.value = `Giorno ${currentDayId}`;

  const typeChips = document.getElementById('expTypeChips');
  typeChips.innerHTML = `
    <span class="chip ${selectedType === 'shared' ? 'selected' : ''}" data-type="shared">🤝 Cassa comune</span>
    <span class="chip ${selectedType === 'personal' ? 'selected' : ''}" data-type="personal">👤 Spesa personale</span>
  `;
  typeChips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedType = chip.dataset.type;
      typeChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
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
  expModalBackdrop.classList.add('open');
}

document.getElementById('fabAddExpense').addEventListener('click', openExpenseModal);
document.getElementById('fabAddExpenseDesktop').addEventListener('click', openExpenseModal);
document.getElementById('expCancel').addEventListener('click', () => expModalBackdrop.classList.remove('open'));
expModalBackdrop.addEventListener('click', (e) => { if (e.target === expModalBackdrop) expModalBackdrop.classList.remove('open'); });

document.getElementById('expSave').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('expAmount').value);
  if (!amount || amount <= 0) {
    document.getElementById('expAmount').focus();
    return;
  }
  const entry = {
    id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
    day: document.getElementById('expDay').value,
    category: selectedCategory,
    amount: amount,
    note: document.getElementById('expNote').value.trim(),
    paidBy: document.getElementById('expPaidBy').value,
    shared: selectedType === 'shared',
    ts: Date.now(),
  };
  expenses.push(entry);
  saveStore(STORE_KEYS.expenses, expenses);
  expModalBackdrop.classList.remove('open');
  if (currentView === 'budget') renderBudget();
});

// ---------------- export / backup ----------------
document.getElementById('exportBtn').addEventListener('click', () => {
  const payload = { doneStops, personalNotes, expenses, participants, startTimes, durationOverrides, exportedAt: new Date().toISOString() };
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
