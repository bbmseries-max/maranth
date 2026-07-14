import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../services/sales';

// Protects sensitive routes from standard cashiers
export const adminGuard = () => {
  const salesService = inject(SalesService);
  const router = inject(Router);

  // 1. If the user is an Admin, unlock the doors!
  if (salesService.currentRole() === 'admin') {
    return true;
  }

  // 2. If they are a standard cashier, show an error and bounce them to the POS
  if (salesService.currentCashier()) {
    salesService.activeModal.set({
      type: 'warning', 
      title: '⛔ Access Denied', 
      message: 'You need Store Admin privileges to access the back-office.',
      value: '',
      onConfirm: () => salesService.activeModal.set(null)
    });
    return router.parseUrl('/pos');
  }

  // 3. If they aren't logged in at all, kick them to login
  return router.parseUrl('/login');
};