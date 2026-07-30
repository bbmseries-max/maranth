import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { TransactionRecord } from '../../shared/services/pos-data.models';
import { doc, setDoc } from 'firebase/firestore';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);

  // --- STATE ---
  public activeTab = signal<'zreport' | 'analytics' | 'dashboard'>('zreport');
  public selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  public isShiftModalOpen = signal<boolean>(false);
  public selectedTxnId = signal<string | null>(null);
  public showOnlySpoiled = signal<boolean>(false);

  // --- GETTERS & COMPUTED SIGNALS ---
  public get cashLogs() { return this.salesService.cashLogs; }

  public formatMoney(val: number): string {
    const num = val || 0;
    return '€' + num.toFixed(2);
  }

  // Filter transactions strictly by selected date
  public filteredTransactions = computed(() => {
    const dateFilter = this.selectedDate();
    return this.salesService.sortedTransactions().filter(tx => {
      const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
      return txDate === dateFilter;
    });
  });

  public totalRevenue = computed(() => {
    return this.filteredTransactions().reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  // Physical Cash Sales
  public cashRevenue = computed(() => {
    return this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Cash')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  // Card Settlements (POS Terminal)
  public cardRevenue = computed(() => {
    return this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Card')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  // Customer Tabs / Store Credit / Τεφτέρι (Owed)
  public debitRevenue = computed(() => {
    return this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Debit')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalSalesCount = computed(() => this.filteredTransactions().length);

  public zReportStats = computed(() => {
    let totalProfit = 0;
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        const wholesale = item.product.purchasePrice || 0;
        const retail = item.product.price || 0;
        const qty = item.isRefund ? -item.quantity : item.quantity;
        totalProfit += (retail - wholesale) * qty;
      });
    });
    return { totalProfit };
  });

  public topSellingProducts = computed(() => {
    const itemsMap = new Map<string, { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number }>();
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        const pIdStr = String(item.product.id);
        if (!itemsMap.has(pIdStr)) {
          itemsMap.set(pIdStr, { id: pIdStr, name: item.product.name, unitsSold: 0, totalRevenue: 0, stockQuantity: item.product.stockQuantity || 0 });
        }
        const stats = itemsMap.get(pIdStr)!;
        const qty = item.isRefund ? -item.quantity : item.quantity;
        stats.unitsSold += qty;
        stats.totalRevenue += (item.product.price * qty);
      });
    });
    return Array.from(itemsMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
  });

  public selectedTxnDetails = computed(() => {
    const id = this.selectedTxnId();
    if (!id) return null;
    return this.salesService.transactions().find(tx => tx.id === id) || null;
  });

  public todayProfit = computed(() => this.zReportStats().totalProfit);

  // ⭐ CASH DRAWER CALCULATOR (Isolated strictly by Cash + Cash Logs for selectedDate)
  public liveCashInDrawer = computed(() => {
    let cashIn = 0;
    this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Cash')
      .forEach(tx => cashIn += tx.grandTotal);

    let manualAdjustments = 0;
    const targetDate = this.selectedDate();

    this.salesService.cashLogs().forEach(log => {
      const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
      if (logDate === targetDate) {
        if (log.type === 'IN') manualAdjustments += log.amount;
        if (log.type === 'OUT') manualAdjustments -= log.amount;
      }
    });

    const rawTotal = cashIn + manualAdjustments;
    return Math.round(rawTotal * 100) / 100;
  });

  // --- ACTIONS ---
  public selectTxn(id: string) {
    this.selectedTxnId.set(id);
  }

  public printZReport() {
    window.print();
  }

  public getHeatmapBg(intensityPercentage: number): string {
    if (intensityPercentage === 0) return 'var(--border-line, #f1f5f9)';
    if (intensityPercentage <= 25) return '#93c5fd';
    if (intensityPercentage <= 50) return '#3b82f6';
    if (intensityPercentage <= 75) return '#2563eb';
    return '#1d4ed8';
  }

  public onCloseShiftSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const amountInput = form.querySelector('#drawerAmount') as HTMLInputElement;
    
    const targetFloat = parseFloat(amountInput?.value || '0');
    const currentCash = this.liveCashInDrawer();

    const difference = Math.round((targetFloat - currentCash) * 100) / 100;

    if (difference !== 0) {
      const resetLog = {
        id: 'CASH-' + Date.now(),
        type: difference > 0 ? 'IN' : 'OUT',
        amount: Math.abs(difference),
        reason: '🔒 Shift Close & Cash Reset',
        timestamp: new Date().toISOString()
      };

      this.salesService.cashLogs.update(logs => [...logs, resetLog]);

      if (this.salesService.db) {
        setDoc(doc(this.salesService.db, 'cashLogs', resetLog.id), resetLog);
      }
    }

    this.isShiftModalOpen.set(false);
    
    this.salesService.activeModal.set({
      type: 'success', 
      title: '🔒 Shift Closed', 
      message: `Shift closed!\n\nDrawer reset from €${currentCash.toFixed(2)} to €${targetFloat.toFixed(2)}.`, 
      value: '',
      onConfirm: () => this.salesService.closeModal()
    });
  }

  public clearAllLedgerData() {
    this.salesService.activeModal.set({
      type: 'warning', title: '⚠️ Clear Sales Ledger', message: 'Are you sure you want to permanently erase all sales history?', value: '',
      onConfirm: () => {
        this.salesService.clearLedger();
        this.selectedTxnId.set(null);
        this.salesService.closeModal();
      }
    });
  }
}