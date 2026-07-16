import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  public router = inject(Router);
  public salesService = inject(SalesService);

  public username = signal<string>('');
  public pin = signal<string>('');
  public confirmPin = signal<string>('');
  
  // ✨ Renamed to bust the compiler cache!
  public assignedRole: 'admin' | 'cashier' = 'cashier';

  // ⭐ NEW: Check if this is a brand new system
  public isFirstSetup = computed(() => {
    return this.salesService.registeredCashiers().length === 0;
  });

  public onRegister(): void {
    const user = this.username().trim();
    const p1 = this.pin().trim();
    const p2 = this.confirmPin().trim();

    if (!user || !p1 || !p2) {
<!-- ... existing code ... -->
    if (p1.length < 4) {
      this.salesService.activeModal.set({
        type: 'warning', title: '⚠️ Weak PIN', message: 'For security, your PIN must be at least 4 characters long.', value: '', onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    // If it's the first setup, FORCE the role to be Admin
    const finalRole = this.isFirstSetup() ? 'admin' : this.assignedRole;

    const success = this.salesService.registerNewCashier(user, p1, finalRole);

    if (success) {
      if (this.isFirstSetup()) {
         this.salesService.loginCashier(user);
         this.router.navigate(['/pos']);
      } else {
         this.salesService.activeModal.set({
            type: 'success', title: '✅ Registration Sent', message: 'Your account was created! A Store Admin must approve it before you can log in.', value: '', onConfirm: () => {
               this.salesService.closeModal();
               this.router.navigate(['/login']);
            }
         });
      }
    } else {
      this.salesService.activeModal.set({
        type: 'warning', title: '⛔ Username Taken', message: 'This Cashier ID is already in use. Please choose another.', value: '', onConfirm: () => this.salesService.closeModal()
      });
    }
  }
}
}