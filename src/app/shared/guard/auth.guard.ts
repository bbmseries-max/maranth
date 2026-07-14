import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../services/sales';

// Modern Angular functional route guard
export const authGuard = () => {
  const salesService = inject(SalesService);
  const router = inject(Router);

  // If a cashier is logged in, let them through!
  if (salesService.currentCashier()) {
    return true;
  }

  // Otherwise, kick them back to the login screen
  return router.parseUrl('/login');
};