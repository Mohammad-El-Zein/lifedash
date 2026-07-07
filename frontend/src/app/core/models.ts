export interface User {
  id: number;
  email: string;
  full_name: string | null;
  job_title: string | null;
  bio: string | null;
  language: string | null;
  theme: string | null;
  has_avatar: boolean;
  role: string;
  enabled_modules: string[];
}

/** PATCH /users/me — only the fields present are applied. */
export interface ProfilePayload {
  full_name?: string | null;
  job_title?: string | null;
  bio?: string | null;
  language?: string;
  theme?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  recurrence_days: number[] | null;
  exceptions: CalendarException[];
}

export interface CalendarException {
  id: number;
  event_id: number;
  original_date: string;
  kind: 'cancelled' | 'moved';
  new_date: string | null;
  new_start_time: string | null;
  new_end_time: string | null;
  note: string | null;
}

export interface EventPayload {
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  recurrence_days: number[] | null;
}

export interface Occurrence {
  event_id: number;
  exception_id: number | null;
  title: string;
  description: string | null;
  location: string | null;
  color: string;
  date: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  is_moved: boolean;
}

export interface WeekResponse {
  week_start: string;
  week_end: string;
  occurrences: Occurrence[];
}

// --- Finance -----------------------------------------------------------------

export interface Category {
  id: number;
  name: string;
  kind: 'income' | 'expense';
  color: string;
}

export type PaidStatus = 'paid' | 'unpaid';

export interface Transaction {
  id: number;
  kind: 'income' | 'expense';
  amount: number;
  description: string | null;
  date: string;
  category_id: number | null;
  status: PaidStatus;
  recurring_id: number | null;
}

export interface TransactionPayload {
  kind: 'income' | 'expense';
  amount: number;
  description: string | null;
  date: string;
  category_id: number | null;
  status?: PaidStatus;
}

export interface RecurringTransaction {
  id: number;
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  category_id: number | null;
  is_active: boolean;
  skipped_months: string[];
}

export interface RecurringPayload {
  kind: 'income' | 'expense';
  amount: number;
  description: string;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  category_id: number | null;
  is_active: boolean;
}

export interface FixedItem {
  transaction_id: number;
  recurring_id: number | null;
  description: string | null;
  amount: number;
  date: string;
  status: PaidStatus;
  category_id: number | null;
}

export interface MonthlyPlan {
  month: string;
  income_total: number;
  recurring_income_total: number;
  one_off_income_total: number;
  fixed_expense_total: number;
  variable_expense_total: number;
  available_for_variable: number;
  fixed_paid_count: number;
  fixed_unpaid_count: number;
  fixed_items: FixedItem[];
}

export interface SavingsSettings {
  monthly_target: number;
  start_month: string;
}

export interface SavingsMonth {
  month: string;
  income: number;
  expenses: number;
  saved: number;
  target: number;
  delta: number;
  is_current: boolean;
}

export interface SavingsOverview {
  monthly_target: number;
  start_month: string;
  months: SavingsMonth[];
  target_total: number;
  saved_total: number;
  delta_total: number;
}

export interface Budget {
  id: number;
  category_id: number;
  month: string;
  amount: number;
}

export interface CategorySummary {
  category_id: number | null;
  name: string;
  color: string;
  spent: number;
  budget: number | null;
}

export interface MonthSummary {
  month: string;
  income_total: number;
  expense_total: number;
  net: number;
  expenses_by_category: CategorySummary[];
}

/** Validated categorical palette for the dark surface (dataviz reference, dark slots). */
export const CATEGORY_COLORS = [
  '#3987e5',
  '#199e70',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
];

// --- Jobs ----------------------------------------------------------------------

export type JobStatus = 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

export const JOB_STATUSES: { value: JobStatus; labelKey: string; color: string }[] = [
  { value: 'applied', labelKey: 'jobs.status.applied', color: '#3987e5' },
  { value: 'interview', labelKey: 'jobs.status.interview', color: '#c98500' },
  { value: 'offer', labelKey: 'jobs.status.offer', color: '#0ca30c' },
  { value: 'rejected', labelKey: 'jobs.status.rejected', color: '#e66767' },
  { value: 'withdrawn', labelKey: 'jobs.status.withdrawn', color: '#64748b' },
];

export interface StatusHistoryEntry {
  id: number;
  status: JobStatus;
  note: string | null;
  changed_at: string;
}

export interface JobDocument {
  id: number;
  application_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface JobApplication {
  id: number;
  company: string;
  position: string;
  link: string | null;
  status: JobStatus;
  applied_date: string | null;
  notes: string | null;
  description: string | null;
  status_history: StatusHistoryEntry[];
  documents: JobDocument[];
}

export interface ApplicationPayload {
  company: string;
  position: string;
  link: string | null;
  applied_date: string | null;
  notes: string | null;
  description: string | null;
}

// --- Fitness -------------------------------------------------------------------

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string | null;
}

export interface ExercisePayload {
  name: string;
  muscle_group: string | null;
}

export interface WorkoutSet {
  id: number;
  exercise_id: number;
  set_number: number;
  reps: number;
  weight_kg: string | null;
}

export interface Workout {
  id: number;
  date: string;
  name: string;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface WorkoutSetPayload {
  exercise_id: number;
  reps: number;
  weight_kg: string | null;
}

export interface WorkoutPayload {
  date: string;
  name: string;
  notes: string | null;
  sets: WorkoutSetPayload[];
}

export interface ProgressPoint {
  date: string;
  workout_id: number;
  top_weight: string;
  reps_at_top: number;
}

export interface ExerciseProgress {
  exercise_id: number;
  name: string;
  points: ProgressPoint[];
}

// --- Meals ---------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: { value: MealType; labelKey: string; icon: string }[] = [
  { value: 'breakfast', labelKey: 'meals.type.breakfast', icon: 'coffee' },
  { value: 'lunch', labelKey: 'meals.type.lunch', icon: 'sandwich' },
  { value: 'dinner', labelKey: 'meals.type.dinner', icon: 'cooking-pot' },
  { value: 'snack', labelKey: 'meals.type.snack', icon: 'apple' },
];

export interface Meal {
  id: number;
  date: string;
  meal_type: MealType;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  template_id: number | null;
}

export interface MealPayload {
  date: string;
  meal_type: MealType;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface MealFromTemplatePayload {
  date: string;
  meal_type: MealType;
  template_id: number;
  portion_factor: number;
}

export interface Ingredient {
  id: number;
  name: string;
  calories_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
  piece_grams: string | null;
}

export interface IngredientPayload {
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  piece_grams: number | null;
}

export type TemplateUnit = 'g' | 'piece';

export interface TemplateItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  unit: TemplateUnit;
  amount: string;
  grams: string;
  calories: string;
}

export interface NutritionTotals {
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

export interface MealTemplate {
  id: number;
  name: string;
  items: TemplateItem[];
  totals: NutritionTotals;
}

export interface TemplateItemPayload {
  ingredient_id: number;
  unit: TemplateUnit;
  amount: number;
}

export interface TemplatePayload {
  name: string;
  items: TemplateItemPayload[];
}

export interface ModuleInfo {
  key: string;
  labelKey: string;
  descriptionKey: string;
  icon: string; // lucide icon name
  route: string | null; // null = coming soon
}

export const MODULES: ModuleInfo[] = [
  {
    key: 'calendar',
    labelKey: 'modules.calendar.label',
    descriptionKey: 'modules.calendar.description',
    icon: 'calendar-days',
    route: '/calendar',
  },
  {
    key: 'finance',
    labelKey: 'modules.finance.label',
    descriptionKey: 'modules.finance.description',
    icon: 'wallet',
    route: '/finance',
  },
  {
    key: 'fitness',
    labelKey: 'modules.fitness.label',
    descriptionKey: 'modules.fitness.description',
    icon: 'dumbbell',
    route: '/fitness',
  },
  {
    key: 'meals',
    labelKey: 'modules.meals.label',
    descriptionKey: 'modules.meals.description',
    icon: 'utensils',
    route: '/meals',
  },
  {
    key: 'jobs',
    labelKey: 'modules.jobs.label',
    descriptionKey: 'modules.jobs.description',
    icon: 'briefcase-business',
    route: '/jobs',
  },
  {
    key: 'learning',
    labelKey: 'modules.learning.label',
    descriptionKey: 'modules.learning.description',
    icon: 'graduation-cap',
    route: null,
  },
  {
    key: 'habits',
    labelKey: 'modules.habits.label',
    descriptionKey: 'modules.habits.description',
    icon: 'flame',
    route: null,
  },
];
