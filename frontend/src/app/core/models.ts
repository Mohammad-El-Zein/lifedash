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
    route: null,
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
    route: null,
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
