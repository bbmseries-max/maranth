import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router'; // Added RouterLink
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], // Added RouterLink
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  public router = inject(Router);
  public salesService = inject(SalesService);

  public username = signal<string>('');
  public password = signal<string>('');

  public onLogin(): void {
    const user = this.username().trim();
    const pass = this.password().trim();

    // 1. Missing Fields Check
    if (!user || !pass) {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⚠️ Missing Fields',
        message: 'Please enter both your Cashier ID and secure PIN.',
        value: '',
        onConfirm: () => this.salesService.activeModal.set(null)
      });
      return;
    }

    // 2. ⭐ NEW: Check against Real Registered Users in Memory
    const registeredUsers = this.salesService.registeredCashiers();
    const validUser = registeredUsers.find(
      u => u.username.toLowerCase() === user.toLowerCase() && u.pin === pass
    );

    if (validUser) {
      // Success!
      this.salesService.loginCashier(validUser.username);
      this.router.navigate(['/pos']);
    } else {
      // 3. Block them if wrong!
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⛔ Access Denied',
        message: 'Invalid Cashier ID or PIN. Please try again.',
        value: '',
        onConfirm: () => this.salesService.activeModal.set(null)
      });
      
      this.password.set(''); // Clear password for retry
    }
  }
}