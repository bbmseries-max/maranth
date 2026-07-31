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

  // --- VAT DIVISOR HELPER ---
  private getTaxDivisor(product: any): number {
    if (!product) return 1.24;
    const rawRate = product.taxRate ?? product.vatRate ?? product.FPA ?? product.vat ?? product.fpa ?? product.tax 
                 ?? product.vat_rate ?? product.tax_rate ?? product.vatPercent ?? product.taxPercent 
                 ?? product.fpa_rate ?? product.fpaRate ?? product.vat_percent ?? product.vatPercent 
                 ?? product.FPA_RATE ?? product.VAT ?? product.TAX;

    if (rawRate === undefined || rawRate === null) return 1.24;
    let str = String(rawRate).trim().replace('%', '');
    let num = Number(str);
    if (isNaN(num)) return 1.24;

    if (num >= 1.0 && num <= 1.5) return num; // Already divisor e.g. 1.24
    if (num > 1.5) return 1 + (num / 100);    // Percentage e.g. 24 -> 1.24
    if (num > 0) return 1 + num;             // Decimal e.g. 0.24 -> 1.24
    return 1.0;                              // 0% VAT
  }

  // --- GETTERS & COMPUTED SIGNALS ---
  public get cashLogs() { return this.salesService.cashLogs; }

  public formatMoney(val: number): string {
    const num = val || 0;
    return '€' + num.toFixed(2);
  }

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

  public cashRevenue = computed(() => {
    return this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Cash')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public cardRevenue = computed(() => {
    return this.filteredTransactions()
      .filter(tx => tx.paymentMethod === 'Card' || tx.paymentMethod === 'Debit')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalSalesCount = computed(() => this.filteredTransactions().length);

  public zReportStats = computed(() => {
    let totalProfit = 0;
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        const wholesale = item.product.purchasePrice || 0;
        const grossRetail = item.product.price || 0;
        const divisor = this.getTaxDivisor(item.product);
        const netRetail = grossRetail / divisor;
        const qty = item.isRefund ? -item.quantity : item.quantity;
        totalProfit += (netRetail - wholesale) * qty;
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

  public weeklyPerformanceMetrics = computed(() => {
    const days: { dateStr: string, label: string, revenue: number, intensityPercentage: number }[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });

      const dayRevenue = this.salesService.transactions()
        .filter(tx => new Date(tx.timestamp).toISOString().split('T')[0] === dateStr)
        .reduce((sum, tx) => sum + tx.grandTotal, 0);

      days.push({ dateStr, label: dayLabel, revenue: dayRevenue, intensityPercentage: 0 });
    }

    const maxRev = Math.max(...days.map(d => d.revenue));
    if (maxRev > 0) {
      days.forEach(d => { d.intensityPercentage = Math.round((d.revenue / maxRev) * 100); });
    }
    return days;
  });

  public hourlyHeatmapMetrics = computed(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i, hourLabel: `${i.toString().padStart(2, '0')}:00`, revenue: 0, ticketCount: 0, intensityPercentage: 0, averageTicketSize: 0
    }));

    this.filteredTransactions().forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      hours[hour].revenue += tx.grandTotal;
      hours[hour].ticketCount += 1;
    });

    const maxRev = Math.max(...hours.map(h => h.revenue));
    hours.forEach(h => {
      if (maxRev > 0) h.intensityPercentage = Math.round((h.revenue / maxRev) * 100);
      h.averageTicketSize = h.ticketCount > 0 ? h.revenue / h.ticketCount : 0;
    });

    return hours;
  });

  public todayProfit = computed(() => this.zReportStats().totalProfit);

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

  public categoryBreakdown = computed(() => {
    const catMap = new Map<string, { name: string, revenue: number, profit: number }>();
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        const catName = this.salesService.getCategoryName(item.product.categoryId);
        if (!catMap.has(catName)) {
          catMap.set(catName, { name: catName, revenue: 0, profit: 0 });
        }
        const entry = catMap.get(catName)!;
        const qty = item.isRefund ? -item.quantity : item.quantity;
        const grossRev = item.product.price * qty;
        const divisor = this.getTaxDivisor(item.product);
        const netRev = grossRev / divisor;
        const cost = (item.product.purchasePrice || 0) * qty;

        entry.revenue += grossRev;
        entry.profit += (netRev - cost);
      });
    });
    return Array.from(catMap.values());
  });

  public staffPerformance = computed(() => {
    const staffMap = new Map<string, { name: string, tickets: number, revenue: number, avgTicket: number }>();
    this.filteredTransactions().forEach(tx => {
      const cashierName = (tx as any).cashierId || (tx as any).cashierName || (tx as any).cashier || 'Admin';
      if (!staffMap.has(cashierName)) {
        staffMap.set(cashierName, { name: cashierName, tickets: 0, revenue: 0, avgTicket: 0 });
      }
      const entry = staffMap.get(cashierName)!;
      entry.tickets += 1;
      entry.revenue += tx.grandTotal;
      entry.avgTicket = entry.revenue / entry.tickets;
    });
    return Array.from(staffMap.values());
  });

  public inventoryValuation = computed(() => {
    let totalWholesaleValue = 0;
    let totalRetailValue = 0;
    let totalNetRetailValue = 0;

    this.salesService.products().forEach(p => {
      const stock = p.stockQuantity || 0;
      const wholesale = p.purchasePrice || 0;
      const grossRetail = p.price || 0;
      const divisor = this.getTaxDivisor(p);
      const netRetail = grossRetail / divisor;

      totalWholesaleValue += stock * wholesale;
      totalRetailValue += stock * grossRetail;
      totalNetRetailValue += stock * netRetail;
    });

    return {
      totalWholesaleValue,
      totalRetailValue,
      expectedProfit: totalNetRetailValue - totalWholesaleValue
    };
  });

  public securityAuditor = computed(() => {
    const sketchyTxns: TransactionRecord[] = [];
    let refundTotal = 0;

    this.filteredTransactions().forEach(tx => {
      const isRefundTx = tx.grandTotal < 0 || tx.items.some(i => i.isRefund);
      if (isRefundTx) {
        sketchyTxns.push(tx);
        refundTotal += Math.abs(tx.grandTotal);
      }
    });

    return {
      refundCount: sketchyTxns.length,
      refundTotal,
      sketchyTxns
    };
  });

  public trueProfitReport = computed(() => {
    const reportMap = new Map<string, { name: string, qtySold: number, qtyWasted: number, revenue: number, costOfSold: number, costOfWasted: number, trueProfit: number, isLoss: boolean }>();

    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        const name = item.product.name;
        if (!reportMap.has(name)) {
          reportMap.set(name, { name, qtySold: 0, qtyWasted: 0, revenue: 0, costOfSold: 0, costOfWasted: 0, trueProfit: 0, isLoss: false });
        }
        const entry = reportMap.get(name)!;
        const qty = item.isRefund ? -item.quantity : item.quantity;
        const grossRev = item.product.price * qty;
        const cost = (item.product.purchasePrice || 0) * qty;

        entry.qtySold += qty;
        entry.revenue += grossRev;
        entry.costOfSold += cost;
      });
    });

    const targetDate = this.selectedDate();
    const wasteLogs = this.salesService.spoilageLogs ? this.salesService.spoilageLogs() : [];
    wasteLogs.forEach((log: any) => {
      if (log.timestamp && log.timestamp.split('T')[0] === targetDate) {
        const name = log.productName || 'Unknown';
        if (!reportMap.has(name)) {
          reportMap.set(name, { name, qtySold: 0, qtyWasted: 0, revenue: 0, costOfSold: 0, costOfWasted: 0, trueProfit: 0, isLoss: false });
        }
        const entry = reportMap.get(name)!;
        entry.qtyWasted += log.quantity;

        const prod = this.salesService.products().find(p => p.name === name);
        const wholesaleCost = prod?.purchasePrice || 0;
        entry.costOfWasted += (log.quantity * wholesaleCost);
      }
    });

    let results = Array.from(reportMap.values()).map(entry => {
      const prod = this.salesService.products().find(p => p.name === entry.name);
      const divisor = prod ? this.getTaxDivisor(prod) : 1.24;
      const netRevenue = entry.revenue / divisor;
      const totalCost = entry.costOfSold + entry.costOfWasted;
      const trueProfit = netRevenue - totalCost;
      return {
        ...entry,
        trueProfit,
        isLoss: trueProfit < 0
      };
    });

    if (this.showOnlySpoiled()) {
      results = results.filter(r => r.qtyWasted > 0);
    }

    return results;
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

  public addManualCash() {
    this.salesService.activeModal.set({
      type: 'prompt', 
      title: '💵 Add Cash (Step 1 of 2)', 
      message: 'Enter amount of cash added to drawer (€):', 
      value: '',
      onConfirm: (amountVal) => {
        const amt = parseFloat(amountVal);
        if (!isNaN(amt) && amt > 0) {
          setTimeout(() => {
            this.salesService.activeModal.set({
              type: 'prompt',
              title: '📝 Reason for Cash In (Step 2 of 2)',
              message: `Enter reason / excuse for adding €${amt.toFixed(2)}:`,
              value: 'Manual Top-up',
              onConfirm: (reasonVal) => {
                const log = { 
                  id: 'CASH-' + Date.now(), 
                  type: 'IN', 
                  amount: amt, 
                  reason: reasonVal?.trim() || 'Manual Top-up', 
                  timestamp: new Date().toISOString() 
                };
                
                this.salesService.cashLogs.update(logs => [...logs, log]);
                if (this.salesService.db) {
                  setDoc(doc(this.salesService.db, 'cashLogs', log.id), log);
                }
                this.salesService.closeModal();
              }
            });
          }, 100);
        } else {
          this.salesService.closeModal();
        }
      }
    });
  }

  public removeManualCash() {
    this.salesService.activeModal.set({
      type: 'prompt', 
      title: '📤 Cash Payout (Step 1 of 2)', 
      message: 'Enter payout amount removed from drawer (€):', 
      value: '',
      onConfirm: (amountVal) => {
        const amt = parseFloat(amountVal);
        if (!isNaN(amt) && amt > 0) {
          setTimeout(() => {
            this.salesService.activeModal.set({
              type: 'prompt',
              title: '📝 Reason for Payout (Step 2 of 2)',
              message: `Enter reason / excuse for removing €${amt.toFixed(2)}:`,
              value: 'Supplier Payout',
              onConfirm: (reasonVal) => {
                const log = { 
                  id: 'CASH-' + Date.now(), 
                  type: 'OUT', 
                  amount: amt, 
                  reason: reasonVal?.trim() || 'Supplier Payout', 
                  timestamp: new Date().toISOString() 
                };
                
                this.salesService.cashLogs.update(logs => [...logs, log]);
                if (this.salesService.db) {
                  setDoc(doc(this.salesService.db, 'cashLogs', log.id), log);
                }
                this.salesService.closeModal();
              }
            });
          }, 100);
        } else {
          this.salesService.closeModal();
        }
      }
    });
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

  public resetDrawerToZero() {
    const currentCash = this.liveCashInDrawer();
    if (currentCash !== 0) {
      const resetLog = {
        id: 'CASH-' + Date.now(),
        type: currentCash > 0 ? 'OUT' : 'IN',
        amount: Math.abs(currentCash),
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
      message: `Shift closed!\n\nDrawer reset from €${currentCash.toFixed(2)} to €0.00.`, 
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