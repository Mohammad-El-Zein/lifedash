export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  enabled_modules: string[];
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

export const JOB_STATUSES: { value: JobStatus; label: string; color: string }[] = [
  { value: 'applied', label: 'Applied', color: '#3987e5' },
  { value: 'interview', label: 'Interview', color: '#c98500' },
  { value: 'offer', label: 'Offer', color: '#0ca30c' },
  { value: 'rejected', label: 'Rejected', color: '#e66767' },
  { value: 'withdrawn', label: 'Withdrawn', color: '#64748b' },
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

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  icon: string;
  route: string | null; // null = coming soon
}

export const MODULES: ModuleInfo[] = [
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Weekly schedule with recurring events',
    icon: '📅',
    route: '/calendar',
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Transactions, budgets & charts',
    icon: '💶',
    route: '/finance',
  },
  {
    key: 'fitness',
    label: 'Fitness',
    description: 'Workouts, sets & progress',
    icon: '🏋️',
    route: null,
  },
  {
    key: 'meals',
    label: 'Meals',
    description: 'Meal planning & calories',
    icon: '🥗',
    route: null,
  },
  {
    key: 'jobs',
    label: 'Job Applications',
    description: 'Application pipeline & status history',
    icon: '💼',
    route: '/jobs',
  },
  {
    key: 'learning',
    label: 'Learning',
    description: 'Goals, deadlines & milestones',
    icon: '🎓',
    route: null,
  },
  {
    key: 'habits',
    label: 'Habits',
    description: 'Daily habits & streaks',
    icon: '🔥',
    route: null,
  },
];
