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
  const persone = TRIP_DATA.persone;
  const totale = expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPersona = totale / persone;

  const byDay = {};
  expenses.forEach(e => {
    byDay[e.day] = (byDay[e.day] || 0) + e.amount;
  });

  const summary = document.getElementById('budgetSummary');
  let rows = `
    <div class="row total"><span class="label">Totale speso</span><span class="value">${fmtEuro(totale)}</span></div>
    <div class="row"><span class="label">A persona (÷${persone})</span><span class="value">${fmtEuro(perPersona)}</span></div>
  `;
  Object.keys(byDay).sort().forEach(day => {
    rows += `<div class="row"><span class="label">${day}</span><span class="value">${fmtEuro(byDay[day])}</span></div>`;
  });
  summary.innerHTML = rows;

  const list = document.getElementById('expenseList');
  if (expenses.length === 0) {
    list.innerHTML = `<div class="empty-state">Nessuna spesa registrata ancora.<br>Usa il tasto "＋ Spesa" per iniziare.</div>`;
    return;
  }
  list.innerHTML = '';
  [...expenses].reverse().forEach(e => {
    const item = document.createElement('div');
    item.className = 'expense-item';
    item.innerHTML = `
      <div class="info">
        <div class="cat">${e.category} — ${e.day}</div>
        <div class="meta">${e.note ? e.note + ' · ' : ''}${new Date(e.ts).toLocaleDateString('it-IT')}</div>
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

// ---------------- render: info / pernottamenti ----------------
function renderInfo() {
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

function openExpenseModal() {
  const daySel = document.getElementById('expDay');
  daySel.innerHTML = TRIP_DATA.days.map(d => `<option value="Giorno ${d.id}">Giorno ${d.id}</option>`).join('')
    + Array.from({length: 14 - TRIP_DATA.days.length}, (_, i) => {
        const n = TRIP_DATA.days.length + i + 1;
        return `<option value="Giorno ${n}">Giorno ${n}</option>`;
      }).join('')
    + `<option value="Generale">Generale (aereo, noleggio, ecc.)</option>`;
  daySel.value = `Giorno ${currentDayId}`;

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
    ts: Date.now(),
  };
  expenses.push(entry);
  saveStore(STORE_KEYS.expenses, expenses);
  expModalBackdrop.classList.remove('open');
  if (currentView === 'budget') renderBudget();
});

// ---------------- export / backup ----------------
document.getElementById('exportBtn').addEventListener('click', () => {
  const payload = { doneStops, personalNotes, expenses, exportedAt: new Date().toISOString() };
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
