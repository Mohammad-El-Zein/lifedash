// Seeds finance, jobs, fitness, meals, learning and habits data for the
// screenshot account, so the responsive passes are reviewed against realistic
// content. Skips anything that already has rows.
const API = 'http://localhost:8000/api';
const EMAIL = 'responsive@lifedash.example.com';
const PASSWORD = 'responsive-pw-123';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
const { access_token } = await login.json();
const H = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };

const get = async (path) => {
  const r = await fetch(`${API}${path}`, { headers: H });
  return r.ok ? r.json() : null;
};
const post = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) console.log(`  FAIL ${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.ok ? r.json() : null;
};

const today = new Date();
const iso = (daysAgo) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
const month = today.toISOString().slice(0, 7);

// ---------------------------------------------------------------- finance
const categories = (await get('/finance/categories')) ?? [];
if (categories.length === 0) {
  console.log('finance categories');
  const wanted = [
    { name: 'Lebensmittel', kind: 'expense', color: '#059669' },
    { name: 'Miete', kind: 'expense', color: '#dc2626' },
    { name: 'Mobilität', kind: 'expense', color: '#0ea5e9' },
    { name: 'Freizeit', kind: 'expense', color: '#9333ea' },
    { name: 'Gehalt', kind: 'income', color: '#16a34a' },
  ];
  for (const c of wanted) categories.push(await post('/finance/categories', c));
}
const catId = (name) => categories.find((c) => c && c.name === name)?.id ?? null;

const txs = (await get(`/finance/transactions?month=${month}-01`)) ?? [];
if (txs.length === 0) {
  console.log('finance transactions');
  const rows = [
    { description: 'Gehalt September', amount: 3200, kind: 'income', category_id: catId('Gehalt'), date: iso(23), status: 'paid' },
    { description: 'Miete', amount: 980, kind: 'expense', category_id: catId('Miete'), date: iso(22), status: 'paid' },
    { description: 'Rewe Wocheneinkauf', amount: 84.31, kind: 'expense', category_id: catId('Lebensmittel'), date: iso(6), status: 'paid' },
    { description: 'Monatsticket ÖPNV', amount: 49, kind: 'expense', category_id: catId('Mobilität'), date: iso(20), status: 'paid' },
    { description: 'Kino mit Lena', amount: 27.5, kind: 'expense', category_id: catId('Freizeit'), date: iso(4), status: 'unpaid' },
    { description: 'Edeka', amount: 41.05, kind: 'expense', category_id: catId('Lebensmittel'), date: iso(2), status: 'paid' },
    { description: 'Strom Abschlag', amount: 72, kind: 'expense', category_id: null, date: iso(12), status: 'unpaid' },
  ];
  for (const t of rows) await post('/finance/transactions', t);
}

const budgets = (await get(`/finance/budgets?month=${month}-01`)) ?? [];
if (budgets.length === 0) {
  console.log('finance budgets');
  for (const [name, amount] of [['Lebensmittel', 350], ['Freizeit', 150], ['Mobilität', 60]]) {
    const id = catId(name);
    if (id) await fetch(`${API}/finance/budgets`, { method: 'PUT', headers: H, body: JSON.stringify({ category_id: id, month: `${month}-01`, amount }) });
  }
}

// ------------------------------------------------------------------- jobs
const apps = (await get('/jobs/applications')) ?? [];
if (apps.length === 0) {
  console.log('job applications');
  const rows = [
    { company: 'Nordlicht Software GmbH', position: 'Senior Frontend Engineer', status: 'interview', applied_date: iso(18), link: 'https://example.com/stelle/1', notes: 'Zweites Gespräch am Montag, Tech-Teil mit Live-Coding.', description: 'Angular, TypeScript, Design-System-Arbeit im Produktteam.' },
    { company: 'Hafenblick AG', position: 'Full-Stack Developer', status: 'applied', applied_date: iso(9), link: null, notes: null, description: null },
    { company: 'Kranich Digital', position: 'Angular Developer', status: 'offer', applied_date: iso(35), link: null, notes: 'Angebot liegt vor, Rückmeldung bis Freitag.', description: null },
    { company: 'Steinweg Consulting', position: 'Frontend Consultant', status: 'rejected', applied_date: iso(47), link: null, notes: 'Absage nach dem ersten Gespräch.', description: null },
    { company: 'Blaupause Studio', position: 'UI Engineer', status: 'withdrawn', applied_date: iso(60), link: null, notes: null, description: null },
  ];
  for (const a of rows) await post('/jobs/applications', a);
}

// ---------------------------------------------------------------- habits
const habits = (await get('/habits')) ?? [];
if (habits.length === 0) {
  console.log('habits');
  for (const name of ['Lesen (20 min)', 'Wasser trinken', 'Spazieren gehen', 'Kein Zucker']) {
    const h = await post('/habits', { name, color: '#6366f1' });
    if (h) for (const d of [1, 2, 4, 5]) await post(`/habits/${h.id}/toggle`, { date: iso(d) });
  }
}

// -------------------------------------------------------------- learning
const goals = (await get('/learning/goals')) ?? [];
if (goals.length === 0) {
  console.log('learning goals');
  const g = await post('/learning/goals', { title: 'Angular Signals vertiefen', description: 'Signals, Resources und die neue Control-Flow-Syntax sicher beherrschen.', target_date: iso(-45), status: 'active' });
  if (g) {
    await post(`/learning/goals/${g.id}/milestones`, { title: 'Signals-Doku durchgearbeitet', done: true });
    await post(`/learning/goals/${g.id}/milestones`, { title: 'Eigene Resource-Abstraktion gebaut', done: false });
  }
  await post('/learning/goals', { title: 'Spanisch A2', description: null, target_date: iso(-120), status: 'active' });
}

console.log('\ndone');
