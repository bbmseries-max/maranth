import { Routes } from '@angular/router';
import { authGuard } from './shared/guard/auth.guard';
import { adminGuard } from './shared/guard/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Auth Routes
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent)
  },

  // Cashier & Admin Routes
  {
    path: 'pos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/pos/pos').then(m => m.PosComponent)
  },

  // Admin-Only Routes (protects Staff Management, Cost Prices, and Z-Reports)
  {
    path: 'inventory',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/inventory/inventory').then(m => m.InventoryComponent)
  },
  {
    path: 'reports',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/reports/reports').then(m => m.ReportsComponent)
  },

  // Fallback for unknown URLs
  { path: '**', redirectTo: 'login' }
];