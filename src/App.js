import React, { useState, useCallback, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { loadData, saveEntries, saveExpenses } from './drive';
import './App.css';

const today = () => new Date().toISOString().split('T')[0];
const thisMonth = () => today().slice(0, 7);

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}-${m}-${y}`;
}
function fmtMonth(m) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(mo) - 1] + ' ' + y;
}
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function parseSMSText(txt) {
  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
  const entry = {};
  const idLine = lines.find(l => /\d{6,}.*-.*\d+/.test(l));
  if (idLine) { const m = idLine.match(/(\d[\d\s-]+)/); if (m) entry.farmerId = m[1].trim().replace(/\s+/g,''); }
  const nameLine = lines.find(l => /^[A-Z][A-Z\s]{3,}$/.test(l) && !l.includes(':'));
  if (nameLine) entry.farmerName = nameLine.trim();
  const dateLine = lines.find(l => /\d{2}-\d{2}-\d{2,4}/.test(l));
  if (dateLine) {
    const dm = dateLine.match(/(\d{2})-(\d{2})-(\d{2,4})/);
    if (dm) { let yr = dm[3]; if (yr.length===2) yr='20'+yr; entry.date = `${yr}-${dm[2]}-${dm[1]}`; }
    entry.session = /\bE\b/i.test(dateLine) ? 'Evening' : 'Morning';
  }
  const get = (label) => { const l = lines.find(x => new RegExp(label,'i').test(x)); if(l){const m=l.match(/([\d.]+)/);if(m)return parseFloat(m[1]);} return ''; };
  entry.qty = get('qty'); entry.fat = get('fat'); entry.snf = get('snf');
  entry.rate = get('rate'); entry.amount = get('amt');
  return entry;
}

function Toast({ msg }) { return msg ? <div className="toast show">{msg}</div> : null; }

function LoginScreen({ onLogin }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🥛</div>
        <h1 className="login-title syne">HAP Milk Journal</h1>
        <p className="login-sub">Track daily milk collection, expenses & profit</p>
        <button className="google-btn" onClick={onLogin}>
          <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Sign in with Google
        </button>
        <p className="login-note">Data saved to your Google Drive</p>
      </div>
    </div>
  );
}

// ── CALENDAR VIEW ──
function CalendarView({ entries, month }) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDayOfWeek = new Date(y, m - 1, 1).getDay();

  const dayMap = {};
  entries.filter(e => e.date?.startsWith(month)).forEach(e => {
    const day = parseInt(e.date.split('-')[2]);
    if (!dayMap[day]) dayMap[day] = { qty: 0, rates: [], count: 0 };
    dayMap[day].qty += e.qty || 0;
    if (e.rate) dayMap[day].rates.push(e.rate);
    dayMap[day].count++;
  });

  const todayStr = today();
  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="calendar-wrap">
      <div className="cal-day-headers">
        {dayNames.map(d => <div key={d} className="cal-day-name">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty-cell" />;
          const data = dayMap[d];
          const dateStr = `${month}-${String(d).padStart(2,'0')}`;
          const isToday = dateStr === todayStr;
          const avgRate = data ? avg(data.rates) : 0;
          return (
            <div key={d} className={`cal-cell${data ? ' has-data' : ''}${isToday ? ' is-today' : ''}`}>
              <div className="cal-date-num">{d}</div>
              {data && (
                <div className="cal-data">
                  <div className="cal-qty">{data.qty.toFixed(1)}L</div>
                  <div className="cal-rate">₹{avgRate.toFixed(2)}</div>
                  {data.count > 1 && <div className="cal-sessions">{data.count}×</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CYCLE SUMMARY VIEW ──
function CycleSummary({ entries, month }) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const cycles = [
    { label: '1–10', from: 1, to: 10 },
    { label: '11–20', from: 11, to: 20 },
    { label: `21–${daysInMonth}`, from: 21, to: daysInMonth },
  ];

  const monthEntries = entries.filter(e => e.date?.startsWith(month));

  return (
    <div className="cycle-summary-wrap">
      {cycles.map(c => {
        const cEntries = monthEntries.filter(e => {
          const day = parseInt(e.date.split('-')[2]);
          return day >= c.from && day <= c.to;
        });
        const totalLitres = cEntries.reduce((s, e) => s + (e.qty || 0), 0);
        const totalAmt = cEntries.reduce((s, e) => s + (e.amount || 0), 0);
        const avgRateVal = avg(cEntries.map(e => e.rate).filter(Boolean));
        const fromStr = `${String(c.from).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`;
        const toStr = `${String(c.to).padStart(2,'0')}-${String(m).padStart(2,'0')}-${y}`;
        return (
          <div key={c.label} className="cycle-summary-card">
            <div className="cycle-summary-header">
              <span className="cycle-summary-label syne">📅 {fromStr} → {toStr}</span>
              <span className="cycle-summary-badge">{c.label}</span>
            </div>
            <div className="cycle-summary-grid">
              <div className="cycle-stat-item">
                <div className="cycle-stat-label">Total Litres</div>
                <div className="cycle-stat-value litres-color">{totalLitres.toFixed(2)} L</div>
              </div>
              <div className="cycle-stat-item">
                <div className="cycle-stat-label">Avg Rate</div>
                <div className="cycle-stat-value rate-color">₹{avgRateVal.toFixed(2)}</div>
              </div>
              <div className="cycle-stat-item">
                <div className="cycle-stat-label">Total Amount</div>
                <div className="cycle-stat-value amt-color">₹{totalAmt.toFixed(2)}</div>
              </div>
              <div className="cycle-stat-item">
                <div className="cycle-stat-label">Sessions</div>
                <div className="cycle-stat-value">{cEntries.length}</div>
              </div>
            </div>
            {cEntries.length === 0 && <div className="empty" style={{padding:'12px 0 4px'}}>No entries in this cycle</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('hap_token') || null);
  const [user, setUser] = useState(() => { const u = localStorage.getItem('hap_user'); return u ? JSON.parse(u) : null; });
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [summaryMode, setSummaryMode] = useState('today');
  const [summaryTab, setSummaryTab] = useState('overview'); // 'overview' | 'cycle'
  const [loading, setLoading] = useState(!!localStorage.getItem('hap_token'));
  const [syncing, setSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const [smsText, setSmsText] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);



  const [eDate, setEDate] = useState(today());
  const [eAmount, setEAmount] = useState('');
  const [eDesc, setEDesc] = useState('');

  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [filterSession, setFilterSession] = useState('');
  const [expFilterMonth, setExpFilterMonth] = useState(thisMonth());
  const [profitMonth, setProfitMonth] = useState(thisMonth());
  const [calMonth, setCalMonth] = useState(thisMonth());
  const [cycleMonth, setCycleMonth] = useState(thisMonth());

  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); };

  const logout = () => {
    localStorage.removeItem('hap_token'); localStorage.removeItem('hap_user');
    setToken(null); setUser(null); setEntries([]); setExpenses([]); setPayments([]);
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('hap_token');
    if (savedToken && !folderId) {
      setLoading(true);
      loadData(savedToken).then(async data => {
        setEntries(data.entries);
        setExpenses(data.expenses);
        setPayments(data.payments || []);
        setFolderId(data.folderId);
        setLoading(false);
      }).catch(() => {
        localStorage.removeItem('hap_token'); localStorage.removeItem('hap_user');
        setToken(null); setUser(null); setLoading(false);
      });
    }
  }, []); // eslint-disable-line

  const login = useGoogleLogin({
    onSuccess: async (res) => {
      setToken(res.access_token);
      localStorage.setItem('hap_token', res.access_token);
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${res.access_token}` }
      }).then(r => r.json());
      setUser(info);
      localStorage.setItem('hap_user', JSON.stringify(info));
      setLoading(true);
      try {
        const data = await loadData(res.access_token);
        setEntries(data.entries); setExpenses(data.expenses);
        setPayments(data.payments || []);
        setFolderId(data.folderId);
        toast('Loaded from Google Drive!');
      } catch { toast('Could not load Drive data'); }
      setLoading(false);
    },
    onError: () => toast('Login failed'),
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile',
  });

  const syncEntries = useCallback(async (e) => {
    if (!token || !folderId) return;
    setSyncing(true);
    try { await saveEntries(token, folderId, e); } catch { toast('Sync failed'); }
    setSyncing(false);
  }, [token, folderId]);

  const syncExpenses = useCallback(async (e) => {
    if (!token || !folderId) return;
    setSyncing(true);
    try { await saveExpenses(token, folderId, e); } catch { toast('Sync failed'); }
    setSyncing(false);
  }, [token, folderId]);


  const handleParseSMS = () => {
    if (!smsText.trim()) { toast('Paste an SMS first'); return; }
    const parsed = parseSMSText(smsText);
    if (!parsed.farmerName && !parsed.qty) { toast('Could not read SMS format'); return; }
    setParsedPreview(parsed);
  };

  const confirmParsed = async () => {
    if (!parsedPreview) return;
    const e = { ...parsedPreview, id: Date.now() };
    if (!e.amount && e.qty && e.rate) e.amount = Math.round(e.qty * e.rate * 100) / 100;
    const updated = [e, ...entries];
    setEntries(updated); await syncEntries(updated);
    toast('Entry added from SMS!');
    setSmsText(''); setParsedPreview(null);
  };

  const deleteEntry = async (id) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated); await syncEntries(updated); toast('Deleted');
  };

  const addExpense = async () => {
    if (!eDate || !eAmount || !eDesc) { toast('Fill all expense fields'); return; }
    const e = { id: Date.now(), date: eDate, amount: parseFloat(eAmount), desc: eDesc };
    const updated = [e, ...expenses];
    setExpenses(updated); await syncExpenses(updated);
    toast('Expense saved!');
    setEAmount(''); setEDesc('');
  };

  const deleteExpense = async (id) => {
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated); await syncExpenses(updated); toast('Deleted');
  };

  const getWeekDates = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(now); mon.setDate(diff);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const getSummaryStats = (mode) => {
    const weekDates = getWeekDates();
    const filterFn = mode === 'today'
      ? e => e.date === today()
      : mode === 'week'
      ? e => weekDates.includes(e.date)
      : e => e.date?.startsWith(thisMonth());

    const se = entries.filter(filterFn);
    const sQty = se.reduce((s,e)=>s+e.qty,0);
    const sAmt = se.reduce((s,e)=>s+(e.amount||0),0);
    const avgRate = avg(se.map(e=>e.rate).filter(Boolean));
    const avgFat = avg(se.filter(e=>e.fat).map(e=>e.fat));
    const avgSnf = avg(se.filter(e=>e.snf).map(e=>e.snf));
    return { sQty, totalQty: sQty, sAmt, totalAmt: sAmt, avgRate, avgFat, avgSnf, sCount: se.length };
  };

  const getAllMonths = () => {
    const months = new Set();
    entries.forEach(e => { if (e.date) months.add(e.date.slice(0,7)); });
    expenses.forEach(e => { if (e.date) months.add(e.date.slice(0,7)); });
    months.add(thisMonth());
    return [...months].sort().reverse();
  };

  const profitData = (m) => {
    const me = entries.filter(e => e.date?.startsWith(m));
    const mx = expenses.filter(e => e.date?.startsWith(m));
    const mp = payments.filter(p => p.receivedDate?.startsWith(m) || p.fromDate?.startsWith(m));
    const sIncome = me.reduce((s,e)=>s+(e.amount||0),0);
    const exp = mx.reduce((s,e)=>s+e.amount,0);
    const paid = mp.reduce((s,p)=>s+p.amount,0);
    return { sIncome, exp, paid, profit: sIncome - exp, litres: me.reduce((s,e)=>s+e.qty,0) };
  };

  if (!token) return <LoginScreen onLogin={login} />;
  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner">🥛</div>
      <p>Loading from Google Drive...</p>
    </div>
  );

  const filteredEntries = entries
    .filter(e => (!filterMonth || e.date?.startsWith(filterMonth)) && (!filterSession || e.session === filterSession))
    .sort((a,b) => b.date?.localeCompare(a.date));
  const filteredExpenses = expenses
    .filter(e => !expFilterMonth || e.date?.startsWith(expFilterMonth))
    .sort((a,b) => b.date?.localeCompare(a.date));

  const summaryStats = getSummaryStats(summaryMode);

  // NAV: removed 'payments'
  const NAV_TABS = ['dashboard','log','calendar','summary','expenses','profit'];

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-left">
          <span className="nav-brand syne">🥛 <span>HAP</span></span>
          {syncing && <span className="sync-badge">Saving...</span>}
        </div>
        <div className="nav-right">
          <div className="nav-tabs">
            {NAV_TABS.map(p => (
              <button key={p} className={`nav-tab${page===p?' active':''}`} onClick={() => setPage(p)}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
          <div className="user-chip" onClick={logout}>
            {user?.picture && <img src={user.picture} alt="u" className="user-pic" />}
          </div>
        </div>
      </nav>

      <div className="content">

        {/* ── DASHBOARD ── */}
        {page === 'dashboard' && (() => {
          const s = getSummaryStats('today');
          // No last Hatsun payment section — removed
          return (
            <div>
              <div className="section-title syne">Today's Overview</div>
              <div className="summary-grid">
                <div className="sum-card accent"><div className="sum-label">Total Litres</div><div className="sum-value">{s.sQty.toFixed(2)} L</div><div className="sum-sub">{s.sCount} session(s)</div></div>
                <div className="sum-card accent"><div className="sum-label">Total Income</div><div className="sum-value">Rs.{s.sAmt.toFixed(2)}</div><div className="sum-sub">Society</div></div>
                <div className="sum-card"><div className="sum-label">Avg Rate</div><div className="sum-value">Rs.{s.avgRate.toFixed(2)}</div><div className="sum-sub">Per Litre</div></div>
                <div className="sum-card"><div className="sum-label">Avg Fat / SNF</div><div className="sum-value">{s.avgFat.toFixed(1)}%</div><div className="sum-sub">SNF: {s.avgSnf.toFixed(1)}%</div></div>
              </div>

              <div className="section-title syne">Recent Entries</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Session</th><th>Rate</th><th>Qty</th><th>Fat%</th><th>Amt</th></tr></thead>
                  <tbody>
                    {entries.slice(0,5).map(e => (
                      <tr key={e.id}>
                        <td>{fmtDate(e.date)}</td>
                        <td><span className={`badge ${e.session==='Morning'?'badge-m':'badge-e'}`}>{e.session}</span></td>
                        <td>Rs.{e.rate}</td>
                        <td>{e.qty}L</td>
                        <td>{e.fat||'—'}</td>
                        <td className="amt">Rs.{e.amount?.toFixed(2)}</td>
                      </tr>
                    ))}
                    {!entries.length && <tr><td colSpan="6"><div className="empty">No entries yet</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ── LOG ── */}
        {page === 'log' && (
          <div>
            <div className="card sms-card">
              <div className="card-title syne">📱 Smart SMS Paste</div>
              <textarea className="sms-area" value={smsText} onChange={e=>setSmsText(e.target.value)} placeholder="Paste your society SMS here..." />
              <div className="row-gap">
                <button className="btn btn-primary" onClick={handleParseSMS}>Auto Detect</button>
                <button className="btn btn-ghost" onClick={()=>{setSmsText('');setParsedPreview(null);}}>Clear</button>
              </div>
              {parsedPreview && (
                <div className="preview-box">
                  <div className="preview-title syne">✅ Detected</div>
                  <div className="preview-row"><span>Farmer</span><b>{parsedPreview.farmerName}</b></div>
                  <div className="preview-row"><span>Date / Session</span><b>{parsedPreview.date} / {parsedPreview.session}</b></div>
                  <div className="preview-row"><span>Qty / Fat / SNF</span><b>{parsedPreview.qty}L | {parsedPreview.fat}% | {parsedPreview.snf}%</b></div>
                  <div className="preview-row"><span>Rate / Amount</span><b>Rs.{parsedPreview.rate} → Rs.{parsedPreview.amount}</b></div>
                  <div className="row-gap" style={{marginTop:10}}>
                    <button className="btn btn-primary" onClick={confirmParsed}>✅ Add Entry</button>
                    <button className="btn btn-ghost" onClick={()=>setParsedPreview(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="table-wrap">
              <div className="table-header">
                <span className="syne" style={{fontWeight:700}}>Society Entries</span>
                <div className="row-gap">
                  <input type="month" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
                  <select value={filterSession} onChange={e=>setFilterSession(e.target.value)}>
                    <option value="">All</option><option>Morning</option><option>Evening</option>
                  </select>
                </div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Session</th><th>Qty</th><th>Fat</th><th>SNF</th><th>Rate</th><th>Amt</th><th></th></tr></thead>
                <tbody>
                  {filteredEntries.map(e=>(
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td>
                      <td><span className={`badge ${e.session==='Morning'?'badge-m':'badge-e'}`}>{e.session}</span></td>
                      <td>{e.qty}L</td><td>{e.fat||'-'}</td><td>{e.snf||'-'}</td>
                      <td>Rs.{e.rate}</td>
                      <td className="amt">Rs.{e.amount?.toFixed(2)}</td>
                      <td><button className="btn-del" onClick={()=>deleteEntry(e.id)}>✕</button></td>
                    </tr>
                  ))}
                  {!filteredEntries.length && <tr><td colSpan="8"><div className="empty">No entries found</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {page === 'calendar' && (
          <div>
            <div className="cal-header">
              <div className="section-title syne" style={{margin:0}}>Calendar View</div>
              <input type="month" value={calMonth} onChange={e=>setCalMonth(e.target.value)} />
            </div>
            <div className="cal-legend">
              <span className="cal-legend-item"><span className="cal-legend-litres-dot">●</span> Litres</span>
              <span className="cal-legend-item"><span className="cal-legend-rate-dot">●</span> Avg Rate</span>
              <span className="cal-legend-item"><span className="cal-legend-box has-data-col"></span> Has entry</span>
            </div>
            <CalendarView entries={entries} month={calMonth} />
          </div>
        )}

        {/* ── SUMMARY ── */}
        {page === 'summary' && (
          <div>
            {/* Sub-tabs */}
            <div className="overview-tabs" style={{marginBottom:14}}>
              <button className={`ov-tab${summaryTab==='overview'?' active':''}`} onClick={()=>setSummaryTab('overview')}>Overview</button>
              <button className={`ov-tab${summaryTab==='cycle'?' active':''}`} onClick={()=>setSummaryTab('cycle')}>By Cycle</button>
            </div>

            {summaryTab === 'overview' && (
              <>
                <div className="overview-tabs">
                  {['today','week','month'].map(m => (
                    <button key={m} className={`ov-tab${summaryMode===m?' active':''}`} onClick={()=>setSummaryMode(m)}>
                      {m==='today'?'Today':m==='week'?'This Week':'This Month'}
                    </button>
                  ))}
                </div>
                <div className="sum-section-title syne">Milk Summary</div>
                <div className="summary-grid">
                  <div className="sum-card accent">
                    <div className="sum-label">Total Litres</div>
                    <div className="sum-value">{summaryStats.totalQty.toFixed(2)} L</div>
                    <div className="sum-sub">{summaryStats.sCount} entries</div>
                  </div>
                  <div className="sum-card accent">
                    <div className="sum-label">Total Income</div>
                    <div className="sum-value">Rs.{summaryStats.totalAmt.toFixed(2)}</div>
                    <div className="sum-sub">Society</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Avg Rate</div>
                    <div className="sum-value">Rs.{summaryStats.avgRate.toFixed(2)}</div>
                    <div className="sum-sub">Per Litre</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Avg Fat / SNF</div>
                    <div className="sum-value">{summaryStats.avgFat.toFixed(1)}%</div>
                    <div className="sum-sub">SNF: {summaryStats.avgSnf.toFixed(1)}%</div>
                  </div>
                </div>
              </>
            )}

            {summaryTab === 'cycle' && (
              <>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8}}>
                  <span className="sum-section-title syne" style={{margin:0}}>10-Day Cycle Breakdown</span>
                  <input type="month" value={cycleMonth} onChange={e=>setCycleMonth(e.target.value)} />
                </div>
                <CycleSummary entries={entries} month={cycleMonth} />
              </>
            )}
          </div>
        )}

        {/* ── EXPENSES ── */}
        {page === 'expenses' && (
          <div>
            <div className="card">
              <div className="card-title syne">🌾 Add Feed Expense</div>
              <div className="form-grid">
                <div className="form-group"><label>Date</label><input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} /></div>
                <div className="form-group"><label>Amount (Rs)</label><input type="number" value={eAmount} onChange={e=>setEAmount(e.target.value)} placeholder="0.00" /></div>
                <div className="form-group full"><label>Description</label><input value={eDesc} onChange={e=>setEDesc(e.target.value)} placeholder="Cattle feed, Green fodder..." /></div>
              </div>
              <div className="row-gap" style={{marginTop:14}}>
                <button className="btn btn-primary" onClick={addExpense}>+ Add Expense</button>
              </div>
            </div>
            <div className="table-wrap">
              <div className="table-header">
                <span className="syne" style={{fontWeight:700}}>Expense Log</span>
                <input type="month" value={expFilterMonth} onChange={e=>setExpFilterMonth(e.target.value)} />
              </div>
              {filteredExpenses.length > 0 && (
                <div className="exp-total-bar">
                  <span>Total ({filteredExpenses.length})</span>
                  <span className="exp-total-amt">Rs. {filteredExpenses.reduce((s,e)=>s+e.amount,0).toFixed(2)}</span>
                </div>
              )}
              {filteredExpenses.map(e=>(
                <div className="expense-item" key={e.id}>
                  <div><div className="exp-name">{e.desc}</div><div className="exp-date">{fmtDate(e.date)}</div></div>
                  <div className="row-gap">
                    <div className="exp-amt syne">-Rs.{e.amount.toFixed(2)}</div>
                    <button className="btn-del" onClick={()=>deleteExpense(e.id)}>✕</button>
                  </div>
                </div>
              ))}
              {!filteredExpenses.length && <div className="empty">No expenses recorded</div>}
            </div>
          </div>
        )}

        {/* ── PROFIT ── */}
        {page === 'profit' && (
          <div>
            <div className="profit-header">
              <span className="section-title syne" style={{margin:0}}>Profit Summary</span>
              <select value={profitMonth} onChange={e=>setProfitMonth(e.target.value)}>
                {getAllMonths().map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            {(() => {
              const { sIncome, exp, paid, profit, litres } = profitData(profitMonth);
              return (
                <div className="profit-cards">
                  <div className="profit-card"><div><div className="pc-label">Accrued Income</div><div className="pc-value green">Rs. {sIncome.toFixed(2)}</div></div><div className="pc-icon">📊</div></div>
                  <div className="profit-card"><div><div className="pc-label">Hatsun Paid</div><div className="pc-value green">Rs. {paid.toFixed(2)}</div></div><div className="pc-icon">🏦</div></div>
                  <div className="profit-card"><div><div className="pc-label">Feed Expenses</div><div className="pc-value red">Rs. {exp.toFixed(2)}</div></div><div className="pc-icon">🌾</div></div>
                  <div className="profit-card"><div><div className="pc-label">Total Litres</div><div className="pc-value">{litres.toFixed(2)} L</div></div><div className="pc-icon">🪣</div></div>
                  <div className="profit-card dark"><div><div className="pc-label">Net Profit</div><div className={`pc-value ${profit>=0?'white':'loss'}`}>Rs. {profit.toFixed(2)}</div></div><div className="pc-icon">{profit>=0?'📈':'📉'}</div></div>
                </div>
              );
            })()}
            <div className="table-wrap">
              <div className="table-header"><span className="syne" style={{fontWeight:700}}>Month-wise History</span></div>
              <table>
                <thead><tr><th>Month</th><th>Accrued</th><th>Hatsun Paid</th><th>Expenses</th><th>Profit</th></tr></thead>
                <tbody>
                  {getAllMonths().map(m => {
                    const d = profitData(m);
                    return (
                      <tr key={m} style={{background: m===profitMonth?'var(--green-pale)':''}}>
                        <td><b>{fmtMonth(m)}</b></td>
                        <td className="amt">Rs.{d.sIncome.toFixed(2)}</td>
                        <td className="amt">Rs.{d.paid.toFixed(2)}</td>
                        <td style={{color:'var(--red)'}}>Rs.{d.exp.toFixed(2)}</td>
                        <td style={{fontWeight:700,color:d.profit>=0?'var(--green-dark)':'var(--red)'}}>Rs.{d.profit.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Toast msg={toastMsg} />
    </div>
  );
}
