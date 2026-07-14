import { Routes } from '@angular/router';
import { authGuard } from './shared/guard/auth.guard'; // or './shared/guard/auth.guard' depending on your folder name
import { adminGuard } from './shared/guard/admin.guard';

export const routes: Routes = [
  // Redirect empty path to login
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  
  // Auth Routes (Unprotected)
  { 
    path: 'login', 
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) 
  },
  { 
    path: 'register', 
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent) 
  },
  
  // App Routes (Protected by AuthGuard)
  { 
    path: 'pos', 
    canActivate: [authGuard],
    loadComponent: () => import('./features/pos/pos').then(m => m.PosComponent) 
  },
  { 
    path: 'inventory', 
    canActivate: [authGuard],
    loadComponent: () => import('./features/inventory/inventory').then(m => m.InventoryComponent) 
  },
  { 
    path: 'reports', 
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/reports/reports').then(m => m.ReportsComponent) 
  }
];