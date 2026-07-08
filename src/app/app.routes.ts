import { Routes } from '@angular/router';
import { PosComponent } from './features/pos/pos';

export const routes: Routes = [
  // 🚀 Load the main storefront view directly on the base URL
  { path: '', component: PosComponent },
  
  // Explicit route alias matching our feature folder name
  { path: 'pos', component: PosComponent },
  
  // 🔄 Wildcard catch-all: If the user inputs a bad path, bounce them back to the POS
  { path: '**', redirectTo: '' }
];