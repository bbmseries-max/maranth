import { Routes } from '@angular/router';
import('./features/reports/reports').then(m => m.ReportsComponent)

export const routes: Routes = [
  // 1. Root default fallback path auto-redirects directly to the Cashier Screen
  { 
    path: '', 
    redirectTo: 'pos', 
    pathMatch: 'full' 
  },

  // 2. Front-Office Cash Register Workspace
  { 
    path: 'pos', 
    loadComponent: () => import('./features/pos/pos').then(m => m.PosComponent) // Adjust to your exact exported class name inside pos.ts
  },

  // 3. Back-Office Administrative Stock Dashboard
  { 
    path: 'inventory', 
    loadComponent: () => import('./features/inventory/inventory').then(m => m.InventoryComponent)
  },
  { 
    path: 'reports', 
    loadComponent: () => import('./features/reports/reports').then(m => m.ReportsComponent)
  },
  { 
    path: 'sales-reports', 
    loadComponent: () => import('./features/reports/sales-reports').then(m => m.SalesReportsComponent) 
  },

  // 4. Wildcard catch-all safety redirect
  { 
    path: '**', 
    redirectTo: 'pos' 
  }
];