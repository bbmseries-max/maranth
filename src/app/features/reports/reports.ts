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

  public cashRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'CASH')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public cardRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'CARD')
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