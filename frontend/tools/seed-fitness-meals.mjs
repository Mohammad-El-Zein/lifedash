// Seeds fitness and meals data for the screenshot account.
const API = 'http://localhost:8000/api';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'responsive@lifedash.example.com', password: 'responsive-pw-123' }),
});
const { access_token } = await login.json();
const H = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };

const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: H });
  return r.ok ? r.json() : null;
};
const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!r.ok) console.log(`  FAIL ${p} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.ok ? r.json() : null;
};

const iso = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- fitness
let exercises = (await get('/fitness/exercises')) ?? [];
if (exercises.length === 0) {
  console.log('exercises');
  const wanted = [
    { name: 'Bankdrücken', muscle_group: 'Brust' },
    { name: 'Kniebeuge', muscle_group: 'Beine' },
    { name: 'Klimmzüge', muscle_group: 'Rücken' },
    { name: 'Schulterdrücken', muscle_group: 'Schultern' },
  ];
  exercises = [];
  for (const e of wanted) exercises.push(await post('/fitness/exercises', e));
}
const exId = (name) => exercises.find((e) => e && e.name === name)?.id;

const workouts = (await get('/fitness/workouts')) ?? [];
if (workouts.length === 0) {
  console.log('workouts');
  await post('/fitness/workouts', {
    date: iso(1),
    name: 'Push Day',
    notes: 'Gut gelaufen, Bank ging leichter als letzte Woche.',
    sets: [
      { exercise_id: exId('Bankdrücken'), reps: 10, weight_kg: 70 },
      { exercise_id: exId('Bankdrücken'), reps: 8, weight_kg: 75 },
      { exercise_id: exId('Bankdrücken'), reps: 6, weight_kg: 80 },
      { exercise_id: exId('Schulterdrücken'), reps: 12, weight_kg: 30 },
      { exercise_id: exId('Schulterdrücken'), reps: 10, weight_kg: 32.5 },
    ],
  });
  await post('/fitness/workouts', {
    date: iso(4),
    name: 'Pull & Legs',
    notes: null,
    sets: [
      { exercise_id: exId('Kniebeuge'), reps: 10, weight_kg: 90 },
      { exercise_id: exId('Kniebeuge'), reps: 8, weight_kg: 100 },
      { exercise_id: exId('Klimmzüge'), reps: 8, weight_kg: null },
      { exercise_id: exId('Klimmzüge'), reps: 6, weight_kg: null },
    ],
  });
}

// ------------------------------------------------------------------ meals
const ingredients = (await get('/meals/ingredients')) ?? [];
if (ingredients.length === 0) {
  console.log('ingredients');
  const rows = [
    { name: 'Haferflocken', calories_per_100g: 372, protein_per_100g: 13.5, carbs_per_100g: 58.7, fat_per_100g: 7, piece_grams: null },
    { name: 'Hähnchenbrust', calories_per_100g: 108, protein_per_100g: 23.1, carbs_per_100g: 0, fat_per_100g: 1.5, piece_grams: 150 },
    { name: 'Magerquark', calories_per_100g: 67, protein_per_100g: 12, carbs_per_100g: 4.1, fat_per_100g: 0.3, piece_grams: null },
    { name: 'Banane', calories_per_100g: 93, protein_per_100g: 1.1, carbs_per_100g: 21.4, fat_per_100g: 0.2, piece_grams: 120 },
    { name: 'Olivenöl', calories_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 99.9, piece_grams: null },
  ];
  for (const i of rows) await post('/meals/ingredients', i);
}

const meals = (await get(`/meals?date=${iso(0)}`)) ?? [];
if (!Array.isArray(meals) || meals.length === 0) {
  console.log('meals');
  const rows = [
    { date: iso(0), meal_type: 'breakfast', name: 'Haferflocken mit Banane', calories: 480, protein_g: 18, carbs_g: 72, fat_g: 10 },
    { date: iso(0), meal_type: 'lunch', name: 'Hähnchen mit Reis und Brokkoli', calories: 640, protein_g: 48, carbs_g: 62, fat_g: 16 },
    { date: iso(0), meal_type: 'snack', name: 'Magerquark mit Beeren', calories: 210, protein_g: 26, carbs_g: 14, fat_g: 2 },
    { date: iso(0), meal_type: 'dinner', name: 'Ofengemüse mit Feta', calories: 520, protein_g: 21, carbs_g: 34, fat_g: 30 },
  ];
  for (const m of rows) await post('/meals', m);
}

console.log('\ndone');
