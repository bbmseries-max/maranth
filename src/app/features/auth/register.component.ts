import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { AuthService } from '../../shared/services/auth.service';

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
  public authService = inject(AuthService);

  public username = signal<string>('');
  public pin = signal<string>('');
  public confirmPin = signal<string>('');
  public managerPin = signal<string>('');

  public assignedRole: 'admin' | 'cashier' = 'cashier';

  public isFirstSetup = computed(() => {
    return this.authService.registeredCashiers().length === 0;
  });

  public async onRegister(): Promise<void> {
    const user = this.username().trim();
    const p1 = this.pin().trim();
    const p2 = this.confirmPin().trim();

    if (!user || !p1 || !p2) {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⚠️ Missing Fields',
        message: 'Please fill out all basic fields.',
        value: '',
        onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    if (p1 !== p2) {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⚠️ PIN Mismatch',
        message: 'The PINs you entered do not match.',
        value: '',
        onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    if (p1.length < 4) {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⚠️ Weak PIN',
        message: 'For security, your PIN must be at least 4 characters long.',
        value: '',
        onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    if (!this.isFirstSetup()) {
      const mPin = this.managerPin().trim();

      if (!mPin) {
        this.salesService.activeModal.set({
          type: 'warning',
          title: '⛔ Approval Required',
          message: 'An existing Admin PIN is required to authorize new accounts.',
          value: '',
          onConfirm: () => this.salesService.closeModal()
        });
        return;
      }

      const admins = this.authService.registeredCashiers().filter(u => u.role === 'admin' && u.isApproved !== false);
      const validAdmin = admins.find(a => a.pin === mPin);

      if (!validAdmin) {
        this.salesService.activeModal.set({
          type: 'warning',
          title: '⛔ Access Denied',
          message: 'Invalid Admin PIN. Registration blocked.',
          value: '',
          onConfirm: () => this.salesService.closeModal()
        });
        return;
      }
    }

    const finalRole = this.isFirstSetup() ? 'admin' : this.assignedRole;

    const result = await this.authService.registerNewCashier(user, p1, finalRole, true);

    if (result.success) {
      this.authService.setSession(user, finalRole);
      this.router.navigate(['/pos']);
    } else {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⛔ Username Taken',
        message: result.error || 'This Cashier ID is already in use. Please choose another.',
        value: '',
        onConfirm: () => this.salesService.closeModal()
      });
    }
  }
}