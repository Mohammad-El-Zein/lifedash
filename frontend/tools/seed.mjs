// Seeds a handful of calendar events for the screenshot account, so the
// responsive passes are reviewed against a realistic week rather than an
// empty grid. Idempotent-ish: re-running adds duplicates, so only run once.
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
const auth = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };

const existing = await (await fetch(`${API}/calendar/events`, { headers: auth })).json();
if (Array.isArray(existing) && existing.length) {
  console.log(`already seeded (${existing.length} events)`);
  process.exit(0);
}

const monday = new Date();
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const iso = (offset) => {
  const d = new Date(monday);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const events = [
  { title: 'Daily Standup', start_time: '09:00', end_time: '09:15', color: '#6366f1', recurrence_days: [0, 1, 2, 3, 4], start_date: iso(0) },
  { title: 'Deep Work', start_time: '10:00', end_time: '12:30', color: '#0ea5e9', recurrence_days: [0, 2, 4], start_date: iso(0) },
  { title: 'Gym', start_time: '18:00', end_time: '19:15', color: '#059669', recurrence_days: [1, 3], start_date: iso(0) },
  { title: 'Zahnarzt', location: 'Hauptstraße 4', start_time: '14:00', end_time: '14:45', color: '#d97706', start_date: iso(2) },
  { title: 'Sprint Review', location: 'Raum Nord', start_time: '15:00', end_time: '16:30', color: '#9333ea', start_date: iso(4) },
  { title: 'Brunch mit Lena', start_time: '11:00', end_time: '13:00', color: '#dc2626', start_date: iso(5) },
  { title: 'Wocheneinkauf', start_time: '16:00', end_time: '17:00', color: '#0891b2', start_date: iso(6) },
];

for (const event of events) {
  const res = await fetch(`${API}/calendar/events`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ description: null, location: null, end_date: null, recurrence_days: null, ...event }),
  });
  console.log(`${res.ok ? 'ok  ' : 'FAIL'} ${event.title}${res.ok ? '' : ` — ${await res.text()}`}`);
}
