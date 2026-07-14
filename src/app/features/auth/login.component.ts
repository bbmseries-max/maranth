import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

    // 1. Check if they left a field blank
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

    // 2. The Real Security Check! (Hardcoded to 1234 for now)
    if (pass === '1234') {
      this.salesService.loginCashier(user);
      this.router.navigate(['/pos']);
    } else {
      // 3. Block them if the PIN is wrong!
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⛔ Access Denied',
        message: 'Invalid Authorization PIN. Please try again.',
        value: '',
        onConfirm: () => this.salesService.activeModal.set(null)
      });
      
      // Clear the password field so they can try again
      this.password.set('');
    }
  }
}