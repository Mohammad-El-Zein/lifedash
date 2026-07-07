import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./features/calendar/calendar-week.page').then((m) => m.CalendarWeekPage),
      },
      {
        path: 'finance',
        loadComponent: () =>
          import('./features/finance/finance.page').then((m) => m.FinancePage),
      },
      {
        path: 'fitness',
        loadComponent: () =>
          import('./features/fitness/fitness.page').then((m) => m.FitnessPage),
      },
      {
        path: 'meals',
        loadComponent: () => import('./features/meals/meals.page').then((m) => m.MealsPage),
      },
      {
        path: 'jobs',
        loadComponent: () => import('./features/jobs/jobs.page').then((m) => m.JobsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
