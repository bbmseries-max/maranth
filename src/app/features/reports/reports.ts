import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);
  public selectedTxnId = signal<string | null>(null);

  // 📈 Financial Metrics Summary Analytics
  public totalRevenue = computed(() => {
    return this.salesService.transactions().reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalSalesCount = computed(() => this.salesService.transactions().length);

  // 💵 Cash Revenue (Fixed Case Match)
  public cashRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'Cash') // 🚀 'Cash' matches Service Type
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  // 💳 Card Revenue (Fixed Case Match)
  public cardRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'Card') // 🚀 'Card' matches Service Type
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  // 🏦 Debit Revenue (Added missing channel)
  public debitRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'Debit') // 🚀 Tracks 'Debit' sales
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public selectedTxnDetails = computed(() => {
    const id = this.selectedTxnId();
    return this.salesService.transactions().find(tx => tx.id === id) || null;
  });

  public selectTxn(id: string): void {
    this.selectedTxnId.set(this.selectedTxnId() === id ? null : id);
  }

  public clearAllLedgerData(): void {
    if (confirm('🚨 Warning! Are you sure you want to completely erase the entire sales logs history? This operation cannot be undone.')) {
      this.salesService.transactions.set([]);
      this.selectedTxnId.set(null);
    }
  }
}