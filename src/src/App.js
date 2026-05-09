import React, { useState, useCallback } from 'react';
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

function Toast({ msg }) {
  return msg ? <div className="toast show">{msg}</div> : null;
}

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
        <p className="login-note">Your data is saved to your own Google Drive</p>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('hap_token') || null);
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('hap_user');
    return u ? JSON.parse(u) : null;
  });
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(!!localStorage.getItem('hap_token'));
  const [syncing, setSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fDate, setFDate] = useState(today());
  const [fSession, setFSession] = useState('Morning');
  const [fId, setFId] = useState('');
  const [fName, setFName] = useState('');
  const [fQty, setFQty] = useState('');
  const [fRate, setFRate] = useState('');
  const [fFat, setFFat] = useState('');
  const [fSnf, setFSnf] = useState('');
  const [smsText, setSmsText] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [eDate, setEDate] = useState(today());
  const [eAmount, setEAmount] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [filterMonth, setFilterMonth] = useState(thisMonth());
  const [filterSession, setFilterSession] = useState('');
  const [expFilterMonth, setExpFilterMonth] = useState(thisMonth());
  const [profitMonth, setProfitMonth] = useState(thisMonth());

  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500); };

  const logout = () => {
    localStorage.removeItem('hap_token');
    localStorage.removeItem('hap_user');
    setToken(null); setUser(null);
    setEntries([]); setExpenses([]);
  };

  React.useEffect(() => {
    const savedToken = localStorage.getItem('hap_token');
    if (savedToken && !folderId) {
      setLoading(true);
      loadData(savedToken)
        .then(data => {
          setEntries(data.entries);
          setExpenses(data.expenses);
          setFolderId(data.folderId);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('hap_token');
          localStorage.removeItem('hap_user');
          setToken(null); setUser(null);
          setLoading(false);
        });
    }
  }, []);

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
        setEntries(data.entries); setExpenses(data.expenses); setFolderId(data.folderId);
        toast('✅ Loaded from Google Drive!');
      } catch { toast('⚠️ Could not load Drive data'); }
      setLoading(false);
    },
    onError: () => toast('❌ Login failed'),
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile',
  });

  const syncEntries = useCallback(async (e) => {
    if (!token || !folderId) return;
    setSyncing(true);
    try { await saveEntries(token, folderId, e); } catch { toast('⚠️ Sync failed'); }
    setSyncing(false);
  }, [token, folderId]);

  const syncExpenses = useCallback(async (e) => {
    if (!token || !folderId) return;
    setSyncing(true);
    try { await saveExpenses(token, folderId, e); } catch { toast('⚠️ Sync failed'); }
    setSyncing(false);
  }, [token, folderId]);

  const handleParseSMS = () => {
    if (!smsText.trim()) { toast('Paste an SMS first'); return; }
    const parsed = parseSMSText(smsText);
    if (!parsed.farmerName && !parsed.qty) { toast('❌ Could not read SMS format'); return; }
    setParsedPreview(parsed);
  };

  const confirmParsed = async () => {
    if (!parsedPreview) return;
    const e = { ...parsedPreview, id: Date.now() };
    if (!e.amount && e.qty && e.rate) e.amount = Math.round(e.qty * e.rate * 100) / 100;
    const updated = [e, ...entries];
    setEntries(updated); await syncEntries(updated);
    toast('✅ Entry added from SMS!');
    setSmsText(''); setParsedPreview(null);
  };

  const addEntry = async () => {
    if (!fDate || !fName || !fQty || !fRate) { toast('Fill Date, Name, Qty & Rate'); return; }
    const amount = Math.round(parseFloat(fQty) * parseFloat(fRate) * 100) / 100;
    const e = { id: Date.now(), date: fDate, session: fSession, farmerId: fId, farmerName: fName, qty: parseFloat(fQty), rate: parseFloat(fRate), fat: parseFloat(fFat)||0, snf: parseFloat(fSnf)||0, amount };
    const updated = [e, ...entries];
    setEntries(updated); await syncEntries(updated);
    toast('✅ Entry saved to Drive!');
    setFId(''); setFName(''); setFQty(''); setFRate(''); setFFat(''); setFSnf('');
  };

  const deleteEntry = async (id) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated); await syncEntries(updated); toast('🗑 Deleted');
  };

  const addExpense = async () => {
    if (!eDate || !eAmount || !eDesc) { toast('Fill all expense fields'); return; }
    const e = { id: Date.now(), date: eDate, amount: parseFloat(eAmount), desc: eDesc };
    const updated = [e, ...expenses];
    setExpenses(updated); await syncExpenses(updated);
    toast('✅ Expense saved to Drive!');
    setEAmount(''); setEDesc('');
  };

  const deleteExpense = async (id) => {
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated); await syncExpenses(updated); toast('🗑 Deleted');
  };

  const calcAmt = () => (Math.round((parseFloat(fQty)||0) * (parseFloat(fRate)||0) * 100) / 100).toFixed(2);

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
    const income = me.reduce((s,e) => s+(e.amount||0), 0);
    const exp = mx.reduce((s,e) => s+e.amount, 0);
    return { income, exp, profit: income-exp, litres: me.reduce((s,e)=>s+e.qty,0) };
  };

  if (!token) return <LoginScreen onLogin={login} />;
  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner">🥛</div>
      <p>Loading your journal from Google Drive...</p>
    </div>
  );

  const filteredEntries = entries
    .filter(e => (!filterMonth || e.date?.startsWith(filterMonth)) && (!filterSession || e.session === filterSession))
    .sort((a,b) => b.date?.localeCompare(a.date));
  const filteredExpenses = expenses
    .filter(e => !expFilterMonth || e.date?.startsWith(expFilterMonth))
    .sort((a,b) => b.date?.localeCompare(a.date));
  const todayE = entries.filter(e => e.date === today());
  const monthE = entries.filter(e => e.date?.startsWith(thisMonth()));
return (
    <div className="app">
      <nav className="nav">
        <div className="nav-left">
          <span className="nav-brand syne">🥛 <span>HAP</span> Milk Journal</span>
          {syncing && <span className="sync-badge">⟳ Saving...</span>}
        </div>
        <div className="nav-right">
          <div className="nav-tabs">
            {['dashboard','log','expenses','profit'].map(p => (
              <button key={p} className={`nav-tab${page===p?' active':''}`} onClick={() => setPage(p)}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
          <div className="user-chip" onClick={logout} title="Tap to logout">
            {user?.picture && <img src={user.picture} alt="user" className="user-pic" />}
            <span className="user-name">{user?.given_name || 'User'}</span>
            <span style={{fontSize:'10px',color:'#a8c5b5'}}>⏻</span>
          </div>
        </div>
      </nav>

      <div className="content">
        {page === 'dashboard' && (
          <div>
            <div className="section-title syne">Today's Overview</div>
            <div className="summary-grid">
              <div className="sum-card accent"><div className="sum-label">Today's Litres</div><div className="sum-value">{todayE.reduce((s,e)=>s+e.qty,0).toFixed(2)} L</div><div className="sum-sub">{todayE.length} session(s)</div></div>
              <div className="sum-card accent"><div className="sum-label">Today's Amount</div><div className="sum-value">₹{todayE.reduce((s,e)=>s+(e.amount||0),0).toFixed(2)}</div><div className="sum-sub">Income</div></div>
              <div className="sum-card"><div className="sum-label">This Month Litres</div><div className="sum-value">{monthE.reduce((s,e)=>s+e.qty,0).toFixed(2)} L</div><div className="sum-sub">{monthE.length} entries</div></div>
              <div className="sum-card"><div className="sum-label">This Month Income</div><div className="sum-value">₹{monthE.reduce((s,e)=>s+(e.amount||0),0).toFixed(2)}</div><div className="sum-sub">Gross</div></div>
            </div>
            <div className="section-title syne">Recent Entries</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Session</th><th>Farmer</th><th>Qty</th><th>Fat%</th><th>SNF%</th><th>Amt ₹</th></tr></thead>
                <tbody>
                  {entries.slice(0,5).map(e => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td>
                      <td><span className={`badge ${e.session==='Morning'?'badge-m':'badge-e'}`}>{e.session}</span></td>
                      <td><b>{e.farmerName}</b><br/><small>{e.farmerId}</small></td>
                      <td>{e.qty}</td><td>{e.fat||'—'}</td><td>{e.snf||'—'}</td>
                      <td className="amt">₹{e.amount?.toFixed(2)}</td>
                    </tr>
                  ))}
                  {!entries.length && <tr><td colSpan="7"><div className="empty">🥛 No entries yet</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {page === 'log' && (
          <div>
            <div className="card sms-card">
              <div className="card-title syne">📱 Smart SMS Paste</div>
              <textarea className="sms-area" value={smsText} onChange={e=>setSmsText(e.target.value)} placeholder="Paste your society SMS here..." />
              <div className="row-gap">
                <button className="btn btn-primary" onClick={handleParseSMS}>Auto Detect & Fill</button>
                <button className="btn btn-ghost" onClick={()=>{setSmsText('');setParsedPreview(null);}}>Clear</button>
              </div>
              {parsedPreview && (
                <div className="preview-box">
                  <div className="preview-title syne">✅ Detected Entry</div>
                  <div className="preview-row"><span>Farmer</span><b>{parsedPreview.farmerName} ({parsedPreview.farmerId})</b></div>
                  <div className="preview-row"><span>Date / Session</span><b>{parsedPreview.date} / {parsedPreview.session}</b></div>
                  <div className="preview-row"><span>Qty / Fat / SNF</span><b>{parsedPreview.qty}L | {parsedPreview.fat}% | {parsedPreview.snf}%</b></div>
                  <div className="preview-row"><span>Rate / Amount</span><b>₹{parsedPreview.rate}/L → ₹{parsedPreview.amount}</b></div>
                  <div className="row-gap" style={{marginTop:10}}>
                    <button className="btn btn-primary" onClick={confirmParsed}>✅ Add Entry</button>
                    <button className="btn btn-ghost" onClick={()=>setParsedPreview(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title syne">✏️ Manual Entry</div>
              <div className="form-grid">
                <div className="form-group"><label>Date</label><input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} /></div>
                <div className="form-group"><label>Session</label><select value={fSession} onChange={e=>setFSession(e.target.value)}><option>Morning</option><option>Evening</option></select></div>
                <div className="form-group"><label>Farmer ID</label><input value={fId} onChange={e=>setFId(e.target.value)} placeholder="00202870" /></div>
                <div className="form-group"><label>Farmer Name</label><input value={fName} onChange={e=>setFName(e.target.value)} placeholder="DEEPAK RAJA" /></div>
                <div className="form-group"><label>Qty (Litres)</label><input type="number" value={fQty} onChange={e=>setFQty(e.target.value)} placeholder="0.00" /></div>
                <div className="form-group"><label>Rate (₹/Lt)</label><input type="number" value={fRate} onChange={e=>setFRate(e.target.value)} placeholder="0.00" /></div>
                <div className="form-group"><label>Fat %</label><input type="number" value={fFat} onChange={e=>setFFat(e.target.value)} placeholder="0.0" /></div>
                <div className="form-group"><label>SNF %</label><input type="number" value={fSnf} onChange={e=>setFSnf(e.target.value)} placeholder="0.0" /></div>
                <div className="form-group full"><label>Amount (Auto)</label><div className="amt-display syne">₹ {calcAmt()}</div></div>
              </div>
              <div className="row-gap" style={{marginTop:14}}>
                <button className="btn btn-primary" onClick={addEntry}>+ Add Entry</button>
              </div>
            </div>
            <div className="table-wrap">
              <div className="table-header">
                <span className="syne" style={{fontWeight:700}}>All Entries</span>
                <div className="row-gap">
                  <input type="month" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} />
                  <select value={filterSession} onChange={e=>setFilterSession(e.target.value)}>
                    <option value="">All Sessions</option><option>Morning</option><option>Evening</option>
                  </select>
                </div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Session</th><th>Farmer</th><th>Qty</th><th>Fat%</th><th>SNF%</th><th>Rate</th><th>Amt ₹</th><th></th></tr></thead>
                <tbody>
                  {filteredEntries.map(e=>(
                    <tr key={e.id}>
                      <td>{fmtDate(e.date)}</td>
                      <td><span className={`badge ${e.session==='Morning'?'badge-m':'badge-e'}`}>{e.session}</span></td>
                      <td><b>{e.farmerName}</b><br/><small>{e.farmerId}</small></td>
                      <td>{e.qty}</td><td>{e.fat||'—'}</td><td>{e.snf||'—'}</td>
                      <td>₹{e.rate}</td><td className="amt">₹{e.amount?.toFixed(2)}</td>
                      <td><button className="btn-del" onClick={()=>deleteEntry(e.id)}>✕</button></td>
                    </tr>
                  ))}
                  {!filteredEntries.length && <tr><td colSpan="9"><div className="empty">No entries found</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {page === 'expenses' && (
          <div>
            <div className="card">
              <div className="card-title syne">🌾 Add Feed Expense</div>
              <div className="form-grid">
                <div className="form-group"><label>Date</label><input type="date" value={eDate} onChange={e=>setEDate(e.target.value)} /></div>
                <div className="form-group"><label>Amount (₹)</label><input type="number" value={eAmount} onChange={e=>setEAmount(e.target.value)} placeholder="0.00" /></div>
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
                  <span>Total ({filteredExpenses.length} entries)</span>
                  <span className="exp-total-amt">₹ {filteredExpenses.reduce((s,e)=>s+e.amount,0).toFixed(2)}</span>
                </div>
              )}
              {filteredExpenses.map(e=>(
                <div className="expense-item" key={e.id}>
                  <div><div className="exp-name">🌾 {e.desc}</div><div className="exp-date">{fmtDate(e.date)}</div></div>
                  <div className="row-gap">
                    <div className="exp-amt syne">−₹{e.amount.toFixed(2)}</div>
                    <button className="btn-del" onClick={()=>deleteExpense(e.id)}>✕</button>
                  </div>
                </div>
              ))}
              {!filteredExpenses.length && <div className="empty">No expenses recorded</div>}
            </div>
          </div>
        )}

        {page === 'profit' && (
          <div>
            <div className="profit-header">
              <span className="section-title syne" style={{margin:0}}>Monthly Profit</span>
              <select value={profitMonth} onChange={e=>setProfitMonth(e.target.value)}>
                {getAllMonths().map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
            </div>
            {(() => {
              const { income, exp, profit, litres } = profitData(profitMonth);
              return (
                <div className="profit-cards">
                  <div className="profit-card"><div><div className="pc-label">Milk Income</div><div className="pc-value green">₹ {income.toFixed(2)}</div></div><div className="pc-icon">🥛</div></div>
                  <div className="profit-card"><div><div className="pc-label">Feed Expenses</div><div className="pc-value red">₹ {exp.toFixed(2)}</div></div><div className="pc-icon">🌾</div></div>
                  <div className="profit-card dark"><div><div className="pc-label">Net Profit</div><div className={`pc-value ${profit>=0?'white':'loss'}`}>₹ {profit.toFixed(2)}</div></div><div className="pc-icon">{profit>=0?'📈':'📉'}</div></div>
                  <div className="profit-card"><div><div className="pc-label">Total Litres</div><div className="pc-value">{litres.toFixed(2)} L</div></div><div className="pc-icon">🪣</div></div>
                </div>
              );
            })()}
            <div className="table-wrap">
              <div className="table-header"><span className="syne" style={{fontWeight:700}}>Month-wise History</span></div>
              <table>
                <thead><tr><th>Month</th><th>Income ₹</th><th>Expenses ₹</th><th>Net Profit ₹</th><th>Litres</th></tr></thead>
                <tbody>
                  {getAllMonths().map(m => {
                    const d = profitData(m);
                    return (
                      <tr key={m} style={{background: m===profitMonth?'var(--green-pale)':''}}>
                        <td><b>{fmtMonth(m)}</b></td>
                        <td className="amt">₹{d.income.toFixed(2)}</td>
                        <td style={{color:'var(--red)'}}>₹{d.exp.toFixed(2)}</td>
                        <td style={{fontWeight:700,color:d.profit>=0?'var(--green-dark)':'var(--red)'}}>₹{d.profit.toFixed(2)}</td>
                        <td>{d.litres.toFixed(2)} L</td>
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
