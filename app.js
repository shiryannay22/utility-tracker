import { firebaseConfig, allowedEmails, recaptchaSiteKey } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  initializeAppCheck, ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
  getAI, getGenerativeModel, GoogleAIBackend
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js";

const app = initializeApp(firebaseConfig);

// App Check protects the Gemini API from being called by anyone but this app.
if (recaptchaSiteKey && !recaptchaSiteKey.startsWith('YOUR_')) {
  try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (e) { console.error('App Check init failed', e); }
}

const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let visionModel = null;
try {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  visionModel = getGenerativeModel(ai, { model: "gemini-3.1-flash-lite" });
} catch (e) { console.error('AI Logic init failed', e); }

const state = { tab: 'water', water: [], electric: [], user: null };

const fmt = (n, d = 2) => (isFinite(n) ? Number(n).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: d }) : '—');
const money = (n) => isFinite(n) ? '₪' + fmt(n) : '—';
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sortByDate = (arr) => [...arr].sort((a, b) => new Date(a.currDate || 0) - new Date(b.currDate || 0));

const ICON_EDIT = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
const ICON_TRASH = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const ICON_PLUS = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICON_LOGIN = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;

/* ================= AUTH ================= */
function renderAuthGate(kind, message) {
  const gate = document.getElementById('auth-gate');
  const appRoot = document.getElementById('app-root');
  appRoot.style.display = 'none';
  gate.style.display = 'flex';
  gate.innerHTML = `
    <div class="auth-card">
      <h1>מעקב הוצאות מים וחשמל</h1>
      ${kind === 'denied'
        ? `<p class="auth-msg denied">${message}</p><button class="btn ghost" id="signout-btn">התנתקות</button>`
        : `<p class="auth-msg">התחברו עם חשבון Google כדי לצפות ולעדכן את הנתונים המשותפים.</p><button class="btn primary-mixed" id="signin-btn">${ICON_LOGIN}התחברות עם Google</button>`
      }
    </div>`;
  const signInBtn = document.getElementById('signin-btn');
  if (signInBtn) signInBtn.onclick = () => signInWithPopup(auth, provider).catch(e => alert('ההתחברות נכשלה: ' + e.message));
  const signOutBtn = document.getElementById('signout-btn');
  if (signOutBtn) signOutBtn.onclick = () => signOut(auth);
}

function showApp() {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('app-root').style.display = 'block';
  document.getElementById('user-email').textContent = state.user.email;
}

onAuthStateChanged(auth, (user) => {
  if (!user) { state.user = null; renderAuthGate('signin'); return; }
  if (allowedEmails.includes(user.email)) {
    state.user = user;
    showApp();
    subscribeToData();
  } else {
    renderAuthGate('denied', `החשבון ${user.email} לא מורשה לגשת לכלי הזה. אם זה חשבון הגוגל הנכון, בדקו שהוא נוסף לרשימת המורשים.`);
  }
});

document.getElementById('signout-link').onclick = () => signOut(auth);

/* ================= FIRESTORE SYNC ================= */
let unsubWater = null, unsubElectric = null;

function subscribeToData() {
  if (unsubWater) unsubWater();
  if (unsubElectric) unsubElectric();
  unsubWater = onSnapshot(collection(db, 'water'), (snap) => {
    state.water = snap.docs.map(d => d.data());
    renderWater(); renderDash();
  }, (err) => console.error('water sync error', err));
  unsubElectric = onSnapshot(collection(db, 'electric'), (snap) => {
    state.electric = snap.docs.map(d => d.data());
    renderElectric(); renderDash();
  }, (err) => console.error('electric sync error', err));
}

async function saveEntry(kind, rec) {
  await setDoc(doc(db, kind, rec.id), rec);
}
async function deleteEntry(kind, id) {
  await deleteDoc(doc(db, kind, id));
}

/* ================= WATER TAB ================= */
function waterCalc(e) {
  const consumption = (e.currReading !== '' && e.prevReading !== '') ? (Number(e.currReading) - Number(e.prevReading)) : null;
  const autoTotal = (Number(e.qtyA || 0) * Number(e.priceA || 0)) + (Number(e.qtyB || 0) * Number(e.priceB || 0)) + Number(e.sewage || 0);
  return { consumption, autoTotal };
}

function renderWater() {
  const root = document.getElementById('tab-water');
  const list = sortByDate(state.water);
  root.innerHTML = `
    <div class="section-title">
      <h2 class="accent-water">מים</h2>
    </div>
    <div class="form-card" id="water-form"></div>
    <div class="table-wrap water">
      <table>
        <thead><tr>
          <th>תאריך קריאה קודמת</th><th>קריאה קודמת (מ"ק)</th>
          <th>תאריך קריאה נוכחית</th><th>קריאה נוכחית (מ"ק)</th>
          <th>צריכה (מ"ק)</th>
          <th>כמות ת. א' / מחיר</th><th>כמות ת. ב' / מחיר</th>
          <th>ביוב (₪)</th><th>סה"כ לתשלום</th><th>הערות</th><th></th>
        </tr></thead>
        <tbody id="water-tbody"></tbody>
      </table>
    </div>`;
  const tbody = root.querySelector('#water-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">עוד לא נוספו קריאות מים. לחצו על "הוספת קריאה חדשה" למעלה כדי להתחיל.</td></tr>`;
  } else {
    tbody.innerHTML = list.map(e => {
      const { consumption, autoTotal } = waterCalc(e);
      const total = (e.total !== '' && e.total != null) ? Number(e.total) : autoTotal;
      return `<tr>
        <td data-label="תאריך קריאה קודמת">${e.prevDate || '—'}</td>
        <td data-label="קריאה קודמת"><span class="meter water">${fmt(e.prevReading, 2)}</span></td>
        <td data-label="תאריך קריאה נוכחית">${e.currDate || '—'}</td>
        <td data-label="קריאה נוכחית"><span class="meter water">${fmt(e.currReading, 2)}</span></td>
        <td data-label="צריכה (מ״ק)">${consumption != null ? fmt(consumption, 2) : '—'}</td>
        <td data-label="תעריף א׳ (כמות/מחיר)">${fmt(e.qtyA, 2)} / ${money(e.priceA)}</td>
        <td data-label="תעריף ב׳ (כמות/מחיר)">${fmt(e.qtyB, 2)} / ${money(e.priceB)}</td>
        <td data-label="ביוב">${money(e.sewage)}</td>
        <td data-label="סה״כ לתשלום"><span class="amount-chip water">${money(total)}</span></td>
        <td class="sub notes-cell" data-label="הערות" style="font-family:'Heebo',sans-serif; white-space:normal; max-width:140px;">${e.notes || ''}</td>
        <td data-label=""><div class="row-actions">
          <button class="icon-btn" data-edit="${e.id}" data-kind="water" title="עריכה">${ICON_EDIT}</button>
          <button class="icon-btn" data-del="${e.id}" data-kind="water" title="מחיקה">${ICON_TRASH}</button>
        </div></td>
      </tr>`;
    }).join('');
  }
  tbody.querySelectorAll('button[data-edit]').forEach(btn => {
    if (btn.dataset.kind === 'water') btn.onclick = () => openWaterForm(state.water.find(x => x.id === btn.dataset.edit));
  });
  tbody.querySelectorAll('button[data-del]').forEach(btn => {
    if (btn.dataset.kind === 'water') btn.onclick = async () => {
      if (confirm('למחוק את הרשומה?')) await deleteEntry('water', btn.dataset.del);
    };
  });
}

function blankWater() { return { id: null, prevDate: '', prevReading: '', currDate: '', currReading: '', qtyA: '', priceA: '', qtyB: '', priceB: '', sewage: '', total: '', notes: '' }; }

function openWaterForm(existing) {
  const card = document.getElementById('water-form');
  const e = existing || blankWater();
  card.classList.add('open');
  card.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>תאריך קריאה קודמת</label><input type="date" id="f-prevDate" value="${e.prevDate}"></div>
      <div class="field"><label>קריאה קודמת (מ"ק)</label><input type="number" step="0.01" id="f-prevReading" value="${e.prevReading}"></div>
      <div class="field"><label>תאריך קריאה נוכחית</label><input type="date" id="f-currDate" value="${e.currDate}"></div>
      <div class="field"><label>קריאה נוכחית (מ"ק)</label><input type="number" step="0.01" id="f-currReading" value="${e.currReading}"></div>
      <div class="field"><label>כמות תעריף א' (מ"ק)</label><input type="number" step="0.01" id="f-qtyA" value="${e.qtyA}"></div>
      <div class="field"><label>מחיר תעריף א' (₪/מ"ק)</label><input type="number" step="0.0001" id="f-priceA" value="${e.priceA}"></div>
      <div class="field"><label>כמות תעריף ב' (מ"ק)</label><input type="number" step="0.01" id="f-qtyB" value="${e.qtyB}"></div>
      <div class="field"><label>מחיר תעריף ב' (₪/מ"ק)</label><input type="number" step="0.0001" id="f-priceB" value="${e.priceB}"></div>
      <div class="field"><label>עלות ביוב (₪)</label><input type="number" step="0.01" id="f-sewage" value="${e.sewage}"></div>
      <div class="field"><label>סה"כ לתשלום (₪) - לפי החשבון</label><input type="number" step="0.01" id="f-total" value="${e.total}" placeholder="ריק = חישוב אוטומטי"></div>
      <div class="field notes" style="grid-column: 1 / -1;"><label>הערות</label><input type="text" id="f-notes" value="${e.notes || ''}" placeholder="לדוגמה: תיקון נזילה, חודש חריג..."></div>
    </div>
    <div class="form-actions">
      <button class="btn primary water" id="f-save">שמירה</button>
      <button class="btn ghost" id="f-cancel">ביטול</button>
    </div>`;
  card.querySelector('#f-cancel').onclick = () => { card.classList.remove('open'); card.innerHTML = ''; };
  card.querySelector('#f-save').onclick = async () => {
    const val = id => card.querySelector('#' + id).value;
    const rec = {
      id: e.id || uid(),
      prevDate: val('f-prevDate'), prevReading: val('f-prevReading'),
      currDate: val('f-currDate'), currReading: val('f-currReading'),
      qtyA: val('f-qtyA'), priceA: val('f-priceA'),
      qtyB: val('f-qtyB'), priceB: val('f-priceB'),
      sewage: val('f-sewage'), total: val('f-total'), notes: val('f-notes')
    };
    await saveEntry('water', rec);
    card.classList.remove('open'); card.innerHTML = '';
  };
}

/* ================= ELECTRIC TAB ================= */
function electricCalc(e) {
  const consumption = (e.currReading !== '' && e.prevReading !== '') ? (Number(e.currReading) - Number(e.prevReading)) : null;
  const autoTotal = (consumption != null && e.priceAgorot !== '') ? (consumption * Number(e.priceAgorot) / 100) : null;
  return { consumption, autoTotal };
}

function renderElectric() {
  const root = document.getElementById('tab-electric');
  const list = sortByDate(state.electric);
  root.innerHTML = `
    <div class="section-title">
      <h2 class="accent-electric">חשמל</h2>
    </div>
    <div class="form-card" id="el-form"></div>
    <div class="table-wrap electric">
      <table>
        <thead><tr>
          <th>תאריך קריאה קודמת</th><th>קריאה קודמת (קוט"ש)</th>
          <th>תאריך קריאה נוכחית</th><th>קריאה נוכחית (קוט"ש)</th>
          <th>צריכה (קוט"ש)</th>
          <th>מחיר לקוט"ש (אג')</th><th>סה"כ לתשלום</th><th>הערות</th><th></th>
        </tr></thead>
        <tbody id="el-tbody"></tbody>
      </table>
    </div>`;
  const tbody = root.querySelector('#el-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">עוד לא נוספו קריאות חשמל. לחצו על "הוספת קריאה חדשה" למעלה כדי להתחיל.</td></tr>`;
  } else {
    tbody.innerHTML = list.map(e => {
      const { consumption, autoTotal } = electricCalc(e);
      const total = (e.total !== '' && e.total != null) ? Number(e.total) : autoTotal;
      return `<tr>
        <td data-label="תאריך קריאה קודמת">${e.prevDate || '—'}</td>
        <td data-label="קריאה קודמת"><span class="meter electric">${fmt(e.prevReading, 2)}</span></td>
        <td data-label="תאריך קריאה נוכחית">${e.currDate || '—'}</td>
        <td data-label="קריאה נוכחית"><span class="meter electric">${fmt(e.currReading, 2)}</span></td>
        <td data-label="צריכה (קוט״ש)">${consumption != null ? fmt(consumption, 2) : '—'}</td>
        <td data-label="מחיר לקוט״ש (אג׳)">${fmt(e.priceAgorot, 2)}</td>
        <td data-label="סה״כ לתשלום"><span class="amount-chip electric">${total != null ? money(total) : '—'}</span></td>
        <td class="sub notes-cell" data-label="הערות" style="font-family:'Heebo',sans-serif; white-space:normal; max-width:140px;">${e.notes || ''}</td>
        <td data-label=""><div class="row-actions">
          <button class="icon-btn" data-edit="${e.id}" data-kind="electric" title="עריכה">${ICON_EDIT}</button>
          <button class="icon-btn" data-del="${e.id}" data-kind="electric" title="מחיקה">${ICON_TRASH}</button>
        </div></td>
      </tr>`;
    }).join('');
  }
  tbody.querySelectorAll('button[data-edit]').forEach(btn => {
    if (btn.dataset.kind === 'electric') btn.onclick = () => openElectricForm(state.electric.find(x => x.id === btn.dataset.edit));
  });
  tbody.querySelectorAll('button[data-del]').forEach(btn => {
    if (btn.dataset.kind === 'electric') btn.onclick = async () => {
      if (confirm('למחוק את הרשומה?')) await deleteEntry('electric', btn.dataset.del);
    };
  });
}

function blankElectric() { return { id: null, prevDate: '', prevReading: '', currDate: '', currReading: '', priceAgorot: '', total: '', notes: '' }; }

function openElectricForm(existing) {
  const card = document.getElementById('el-form');
  const e = existing || blankElectric();
  card.classList.add('open');
  card.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>תאריך קריאה קודמת</label><input type="date" id="f-prevDate" value="${e.prevDate}"></div>
      <div class="field"><label>קריאה קודמת (קוט"ש)</label><input type="number" step="0.01" id="f-prevReading" value="${e.prevReading}"></div>
      <div class="field"><label>תאריך קריאה נוכחית</label><input type="date" id="f-currDate" value="${e.currDate}"></div>
      <div class="field"><label>קריאה נוכחית (קוט"ש)</label><input type="number" step="0.01" id="f-currReading" value="${e.currReading}"></div>
      <div class="field"><label>מחיר לקוט"ש (אג' ללא מע"מ)</label><input type="number" step="0.01" id="f-priceAgorot" value="${e.priceAgorot}"></div>
      <div class="field"><label>סה"כ לתשלום (₪) - לפי החשבון</label><input type="number" step="0.01" id="f-total" value="${e.total}" placeholder="ריק = חישוב אוטומטי"></div>
      <div class="field notes" style="grid-column: 1 / -1;"><label>הערות</label><input type="text" id="f-notes" value="${e.notes || ''}" placeholder="לדוגמה: מזגן חדש, חודש חם..."></div>
    </div>
    <div class="form-actions">
      <button class="btn primary electric" id="f-save">שמירה</button>
      <button class="btn ghost" id="f-cancel">ביטול</button>
    </div>`;
  card.querySelector('#f-cancel').onclick = () => { card.classList.remove('open'); card.innerHTML = ''; };
  card.querySelector('#f-save').onclick = async () => {
    const val = id => card.querySelector('#' + id).value;
    const rec = {
      id: e.id || uid(),
      prevDate: val('f-prevDate'), prevReading: val('f-prevReading'),
      currDate: val('f-currDate'), currReading: val('f-currReading'),
      priceAgorot: val('f-priceAgorot'), total: val('f-total'), notes: val('f-notes')
    };
    await saveEntry('electric', rec);
    card.classList.remove('open'); card.innerHTML = '';
  };
}

/* ================= COMBINED ADD-READING FORM ================= */
function openCombinedForm() {
  const card = document.getElementById('combined-form');
  card.classList.add('open');
  card.innerHTML = `
    <div class="section-title"><h2>הוספת קריאה חדשה</h2></div>
    <div class="shared-dates">
      <div class="field"><label>תאריך קריאה קודמת</label><input type="date" id="c-prevDate"></div>
      <div class="field"><label>תאריך קריאה נוכחית</label><input type="date" id="c-currDate"></div>
    </div>
    <div class="combined-groups">
      <div class="combined-group water">
        <h4><span class="dot water"></span>מים</h4>
        <div class="form-grid">
          <div class="field"><label>קריאה קודמת (מ"ק)</label><input type="number" step="0.01" id="c-w-prevReading"></div>
          <div class="field"><label>קריאה נוכחית (מ"ק)</label><input type="number" step="0.01" id="c-w-currReading"></div>
          <div class="field"><label>כמות תעריף א' (מ"ק)</label><input type="number" step="0.01" id="c-w-qtyA"></div>
          <div class="field"><label>מחיר תעריף א' (₪/מ"ק)</label><input type="number" step="0.0001" id="c-w-priceA"></div>
          <div class="field"><label>כמות תעריף ב' (מ"ק)</label><input type="number" step="0.01" id="c-w-qtyB"></div>
          <div class="field"><label>מחיר תעריף ב' (₪/מ"ק)</label><input type="number" step="0.0001" id="c-w-priceB"></div>
          <div class="field"><label>עלות ביוב (₪)</label><input type="number" step="0.01" id="c-w-sewage"></div>
          <div class="field"><label>סה"כ לתשלום (₪)</label><input type="number" step="0.01" id="c-w-total" placeholder="ריק = חישוב אוטומטי"></div>
        </div>
      </div>
      <div class="combined-group electric">
        <h4><span class="dot electric"></span>חשמל</h4>
        <div class="form-grid">
          <div class="field"><label>קריאה קודמת (קוט"ש)</label><input type="number" step="0.01" id="c-e-prevReading"></div>
          <div class="field"><label>קריאה נוכחית (קוט"ש)</label><input type="number" step="0.01" id="c-e-currReading"></div>
          <div class="field"><label>מחיר לקוט"ש (אג')</label><input type="number" step="0.01" id="c-e-priceAgorot"></div>
          <div class="field"><label>סה"כ לתשלום (₪)</label><input type="number" step="0.01" id="c-e-total" placeholder="ריק = חישוב אוטומטי"></div>
        </div>
      </div>
    </div>
    <div class="field notes" style="margin-top:16px;"><label>הערות</label><input type="text" id="c-notes" placeholder="לדוגמה: חודש חם, תיקון נזילה..."></div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn primary water" id="c-save">שמירה</button>
      <button class="btn ghost" id="c-cancel">ביטול</button>
    </div>`;
  card.querySelector('#c-cancel').onclick = () => { card.classList.remove('open'); card.innerHTML = ''; };
  card.querySelector('#c-save').onclick = async () => {
    const val = id => card.querySelector('#' + id).value;
    const prevDate = val('c-prevDate'), currDate = val('c-currDate'), notes = val('c-notes');
    const waterId = uid(), electricId = uid();
    const waterRec = {
      id: waterId, pairId: electricId,
      prevDate, currDate,
      prevReading: val('c-w-prevReading'), currReading: val('c-w-currReading'),
      qtyA: val('c-w-qtyA'), priceA: val('c-w-priceA'),
      qtyB: val('c-w-qtyB'), priceB: val('c-w-priceB'),
      sewage: val('c-w-sewage'), total: val('c-w-total'), notes
    };
    const electricRec = {
      id: electricId, pairId: waterId,
      prevDate, currDate,
      prevReading: val('c-e-prevReading'), currReading: val('c-e-currReading'),
      priceAgorot: val('c-e-priceAgorot'), total: val('c-e-total'), notes
    };
    await Promise.all([saveEntry('water', waterRec), saveEntry('electric', electricRec)]);
    card.classList.remove('open'); card.innerHTML = '';
  };
}

const manualAddBtn = document.getElementById('manual-add-btn');
if (manualAddBtn) manualAddBtn.onclick = () => openCombinedForm();

/* ================= DASHBOARD ================= */
function lineChart(points, color, valueFmt, width = 680, height = 180) {
  if (points.length < 1) return `<div class="empty-state">אין עדיין מספיק נתונים לגרף</div>`;
  const pad = { t: 16, r: 16, b: 26, l: 44 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const ys = points.map(p => p.v);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys, 1);
  const x = i => pad.l + (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = v => pad.t + h - ((v - minY) / ((maxY - minY) || 1)) * h;
  const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ');
  const area = path + ` L${x(points.length - 1).toFixed(1)},${(pad.t + h).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + h).toFixed(1)} Z`;
  const gridY = [0, 0.5, 1].map(f => pad.t + h - f * h);
  const dots = points.map((p, i) => {
    const cx = x(i).toFixed(1), cy = y(p.v).toFixed(1);
    const tip = `${p.label} · ${valueFmt(p.v)}`;
    return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}"></circle>
    <circle cx="${cx}" cy="${cy}" r="11" fill="transparent" class="chart-dot" data-tip="${tip}"></circle>
    <text x="${cx}" y="${height - 6}" font-size="9.5" fill="var(--muted)" font-family="JetBrains Mono, monospace" text-anchor="middle">${p.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="overflow:visible">
    ${gridY.map(gy => `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${width - pad.r}" y2="${gy.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join('')}
    <path d="${area}" fill="${color}" opacity="0.12" stroke="none"/>
    <path class="line-path" d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>
    ${dots}
    <text x="${pad.l - 6}" y="${pad.t + 6}" font-size="9.5" fill="var(--muted)" font-family="JetBrains Mono, monospace" text-anchor="end">${fmt(maxY, 0)}</text>
    <text x="${pad.l - 6}" y="${(pad.t + h).toFixed(1)}" font-size="9.5" fill="var(--muted)" font-family="JetBrains Mono, monospace" text-anchor="end">${fmt(minY, 0)}</text>
  </svg>`;
}

function donutChart(sumWater, sumEl) {
  const total = sumWater + sumEl;
  if (total <= 0) return '';
  const r = 46, circ = 2 * Math.PI * r;
  const waterPct = sumWater / total, elPct = sumEl / total;
  const waterLen = circ * waterPct, elLen = circ * elPct;
  return `
  <div class="donut-wrap">
    <svg viewBox="0 0 120 120" width="140" height="140">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="14"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--water)" stroke-width="14"
        stroke-dasharray="${waterLen.toFixed(1)} ${(circ - waterLen).toFixed(1)}" stroke-linecap="round"
        transform="rotate(-90 60 60)"/>
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--electric)" stroke-width="14"
        stroke-dasharray="${elLen.toFixed(1)} ${(circ - elLen).toFixed(1)}" stroke-dashoffset="${(-waterLen).toFixed(1)}" stroke-linecap="round"
        transform="rotate(-90 60 60)"/>
      <text x="60" y="57" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700" fill="var(--ink)">${money(total)}</text>
      <text x="60" y="73" text-anchor="middle" font-family="Heebo, sans-serif" font-size="9" fill="var(--muted)">סה"כ במעקב</text>
    </svg>
    <div class="donut-legend">
      <div class="row"><span class="dot water"></span>מים<span class="pct" style="color:var(--water)">${(waterPct * 100).toFixed(0)}%</span></div>
      <div class="row"><span class="dot electric"></span>חשמל<span class="pct" style="color:var(--electric)">${(elPct * 100).toFixed(0)}%</span></div>
    </div>
  </div>`;
}

function trendBadge(current, previous) {
  if (previous == null || !isFinite(previous) || previous === 0 || current == null) return '';
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  if (Math.abs(pct) < 0.5) return '';
  const up = diff > 0;
  return `<span class="trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
}

function animateCharts(root) {
  root.querySelectorAll('.line-path').forEach(path => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    requestAnimationFrame(() => {
      path.style.transition = 'stroke-dashoffset 0.9s ease';
      path.style.strokeDashoffset = 0;
    });
  });
  root.querySelectorAll('.chart-card').forEach(card => {
    if (card.querySelector('.chart-tooltip')) return;
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    card.appendChild(tooltip);
    card.querySelectorAll('.chart-dot').forEach(dot => {
      const show = () => {
        const dr = dot.getBoundingClientRect(), cr = card.getBoundingClientRect();
        tooltip.style.left = (dr.left - cr.left + dr.width / 2) + 'px';
        tooltip.style.top = (dr.top - cr.top) + 'px';
        tooltip.textContent = dot.dataset.tip;
        tooltip.classList.add('show');
      };
      const hide = () => tooltip.classList.remove('show');
      dot.addEventListener('mouseenter', show);
      dot.addEventListener('mouseleave', hide);
      dot.addEventListener('touchstart', (ev) => { ev.preventDefault(); show(); setTimeout(hide, 1800); }, { passive: false });
    });
  });
}

function renderDash() {
  const root = document.getElementById('tab-dash');
  const w = sortByDate(state.water), el = sortByDate(state.electric);
  const shortDate = d => d ? d.slice(5).split('-').reverse().join('/') : '';

  const waterTotals = w.map(e => { const { autoTotal } = waterCalc(e); const t = (e.total !== '' && e.total != null) ? Number(e.total) : autoTotal; return { v: t, label: shortDate(e.currDate) }; });
  const elTotals = el.map(e => { const { autoTotal } = electricCalc(e); const t = (e.total !== '' && e.total != null) ? Number(e.total) : autoTotal; return { v: (t || 0), label: shortDate(e.currDate) }; });
  const waterCons = w.map(e => { const { consumption } = waterCalc(e); return { v: (consumption || 0), label: shortDate(e.currDate) }; });
  const elCons = el.map(e => { const { consumption } = electricCalc(e); return { v: (consumption || 0), label: shortDate(e.currDate) }; });

  const lastWater = waterTotals[waterTotals.length - 1];
  const prevWater = waterTotals[waterTotals.length - 2];
  const lastEl = elTotals[elTotals.length - 1];
  const prevEl = elTotals[elTotals.length - 2];
  const sumWater = waterTotals.reduce((s, p) => s + (p.v || 0), 0);
  const sumEl = elTotals.reduce((s, p) => s + (p.v || 0), 0);

  if (!w.length && !el.length) {
    root.innerHTML = `<div class="section-title"><h2>דשבורד</h2></div><div class="empty-state">אין עדיין נתונים להצגה. הוסיפו קריאה חדשה כדי לראות כאן מגמות.</div>`;
    return;
  }

  root.innerHTML = `
    <div class="section-title"><h2>דשבורד</h2></div>
    <div class="cards">
      <div class="card water-tint"><div class="k">חשבון מים אחרון</div><div class="v water">${lastWater ? money(lastWater.v) : '—'}${trendBadge(lastWater && lastWater.v, prevWater && prevWater.v)}</div><div class="d">${w.length} חשבונות במעקב</div></div>
      <div class="card electric-tint"><div class="k">חשבון חשמל אחרון</div><div class="v electric">${lastEl ? money(lastEl.v) : '—'}${trendBadge(lastEl && lastEl.v, prevEl && prevEl.v)}</div><div class="d">${el.length} חשבונות במעקב</div></div>
      <div class="card water-tint"><div class="k">סה"כ מים במעקב</div><div class="v water">${money(sumWater)}</div></div>
      <div class="card electric-tint"><div class="k">סה"כ חשמל במעקב</div><div class="v electric">${money(sumEl)}</div></div>
    </div>

    <div class="chart-card">
      <h3>התפלגות עלויות</h3>
      <p class="cap">היחס בין מים לחשמל מתוך כל מה שהוזן</p>
      ${donutChart(sumWater, sumEl)}
    </div>

    <div class="chart-card">
      <h3>עלות לתשלום לאורך זמן</h3>
      <p class="cap">כל נקודה = חשבון שהוזן, לפי תאריך הקריאה הנוכחית - עברו עם העכבר מעל נקודה לפרטים</p>
      <div class="legend"><span><span class="dot water"></span>מים</span><span><span class="dot electric"></span>חשמל</span></div>
      ${lineChart(waterTotals, 'var(--water)', money)}
      ${lineChart(elTotals, 'var(--electric)', money)}
    </div>

    <div class="chart-card">
      <h3>צריכת מים (מ"ק)</h3>
      <p class="cap">כמות המים שנצרכה בין קריאה לקריאה</p>
      ${lineChart(waterCons, 'var(--water)', v => fmt(v, 2) + ' מ"ק')}
    </div>

    <div class="chart-card">
      <h3>צריכת חשמל (קוט"ש)</h3>
      <p class="cap">כמות החשמל שנצרכה בין קריאה לקריאה</p>
      ${lineChart(elCons, 'var(--electric)', v => fmt(v, 2) + ' קוט"ש')}
    </div>
  `;

  animateCharts(root);
}

/* ================= PHOTO AUTO-FILL ================= */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function setUploadStatus(kind, msg) {
  const el = document.getElementById('upload-status');
  if (!el) return;
  if (!msg) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="status-banner ${kind}">${msg}</div>`;
}

const extractionInstructions = `This image is a photo of a handwritten note (in Hebrew) from a landlord, breaking down a water and/or electricity bill for a shared rented apartment. Read the handwriting carefully - digits are sometimes written in a stylized/cursive way (for example the digit "2" can look like a "z" shape).

Extract ONLY values that are clearly and explicitly written in the image. Never calculate, infer, guess, or fill in a value that is not directly written down - leave it as an empty string instead.

Return ONLY raw JSON (no markdown code fences, no explanation, nothing before or after) matching exactly this shape:
{
  "water": null OR {
    "prevDate": "YYYY-MM-DD or empty string if not present",
    "prevReading": "previous meter reading, plain numeric string, or empty",
    "currDate": "YYYY-MM-DD or empty string if not present",
    "currReading": "current meter reading, plain numeric string, or empty",
    "qtyA": "quantity at tariff A (tier A), plain numeric string, or empty",
    "priceA": "price per unit at tariff A in NIS, plain numeric string, or empty",
    "qtyB": "quantity at tariff B (tier B), plain numeric string, or empty",
    "priceB": "price per unit at tariff B in NIS, plain numeric string, or empty",
    "sewage": "sewage (biuv) cost in NIS, plain numeric string, or empty",
    "total": "final total to pay for water, plain numeric string, or empty",
    "notes": "a period label like a month/year name if that's how the bill period is written, otherwise empty"
  },
  "electric": null OR {
    "prevDate": "YYYY-MM-DD or empty",
    "prevReading": "plain numeric string or empty",
    "currDate": "YYYY-MM-DD or empty",
    "currReading": "plain numeric string or empty",
    "priceAgorot": "price per kWh in agorot, plain numeric string, or empty",
    "total": "final total to pay for electricity, plain numeric string, or empty",
    "notes": "a period label like a month/year name if that's how the bill period is written, otherwise empty"
  }
}

Numeric strings must use plain digits 0-9 only, no currency symbols, no thousands separators, no units. If the image contains no water information, set "water" to null. If it contains no electricity information, set "electric" to null. If a date only has a month/period name without a specific day, do not guess a day - leave that date field empty and put the period label in "notes" instead.

Your entire reply must be nothing but the JSON object itself - no preamble, no explanation, no markdown fences. The first character must be { and the last character must be }.`;

async function extractBillData(base64, mimeType) {
  if (!visionModel) throw new Error('AI Logic not configured');
  const imagePart = { inlineData: { data: base64, mimeType } };
  const result = await visionModel.generateContent([extractionInstructions, imagePart]);
  const raw = result.response.text().trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found in response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function handleBillPhotos(ev) {
  const files = Array.from(ev.target.files || []);
  if (!files.length) return;
  const label = document.getElementById('upload-btn-label');
  if (label) label.classList.add('disabled');
  setUploadStatus('loading', files.length > 1 ? `מנתח ${files.length} תמונות...` : 'מנתח את התמונה...');

  let addedWater = 0, addedElectric = 0, failed = 0, lastErrorMsg = '';
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      const result = await extractBillData(base64, mimeType);
      const waterId = uid(), electricId = uid();
      if (result && result.water) {
        const rec = Object.assign(blankWater(), result.water, { id: waterId, pairId: (result.electric ? electricId : null) });
        await saveEntry('water', rec);
        addedWater++;
      }
      if (result && result.electric) {
        const rec = Object.assign(blankElectric(), result.electric, { id: electricId, pairId: (result.water ? waterId : null) });
        await saveEntry('electric', rec);
        addedElectric++;
      }
      if (!result || (!result.water && !result.electric)) failed++;
    } catch (err) {
      console.error('bill extraction failed', err);
      failed++;
      lastErrorMsg = (err && err.message) ? String(err.message) : String(err);
    }
  }

  ev.target.value = '';
  if (label) label.classList.remove('disabled');

  if (addedWater || addedElectric) {
    const parts = [];
    if (addedWater) parts.push(addedWater + ' קריאות מים');
    if (addedElectric) parts.push(addedElectric + ' קריאות חשמל');
    let msg = 'נוספו ' + parts.join(' ו-') + ' מהתמונה, ועודכנו אצל שניכם. מומלץ לעבור על השורות החדשות (סמל העריכה) ולוודא שהמספרים נקראו נכון.';
    if (failed) msg += ` (${failed} תמונות לא זוהו).`;
    setUploadStatus('success', msg);
  } else {
    let msg = 'לא הצלחתי לזהות נתוני מים או חשמל בתמונה שהועלתה. אפשר לנסות תמונה ברורה וישרה יותר, או להזין את הקריאה ידנית.';
    if (lastErrorMsg) msg += `<br><br><span style="font-family:'JetBrains Mono',monospace; font-size:11px; opacity:.8;">פרטים טכניים: ${lastErrorMsg}</span>`;
    setUploadStatus('error', msg);
  }
}

const photoInput = document.getElementById('bill-photo-input');
if (photoInput) photoInput.addEventListener('change', handleBillPhotos);

/* ================= TABS ================= */
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-water').style.display = tab === 'water' ? 'block' : 'none';
  document.getElementById('tab-electric').style.display = tab === 'electric' ? 'block' : 'none';
  document.getElementById('tab-dash').style.display = tab === 'dash' ? 'block' : 'none';
}

document.querySelectorAll('.tab-pill').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
switchTab('water');
