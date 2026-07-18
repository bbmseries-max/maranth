import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);

  // ⭐ Updated Tabs
  public activeTab = signal<string>('dashboard');

  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    if (isNaN(parsed)) return '€0.00';
    return '€' + parsed.toFixed(2);
  }

  private safeParseLocal(key: string | number): number {
    if (typeof key === 'number') {
      return isNaN(key) ? 0 : key;
    }
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 0;
    const val = localStorage.getItem(key as string);
    if (val === null || val === undefined || val === '' || val === 'undefined' || val === 'NaN') return 0;
    const parsed = Number(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  public startingFloat = signal<number>(this.safeParseLocal('maranth_float'));
  public supplierPayouts = signal<number>(this.safeParseLocal('maranth_payouts'));
  
  public liveCashInDrawer = computed(() => {
    const today = new Date().toDateString();
    let todaysCashSales = 0;
    const txs = this.salesService.transactions() || [];
    
    txs.forEach(tx => {
      if (tx && tx.timestamp) {
        if (new Date(tx.timestamp).toDateString() === today && tx.paymentMethod === 'Cash') {
          todaysCashSales += this.safeParseLocal(tx.grandTotal as any);
        }
      }
    });

    const currentFloat = this.safeParseLocal(this.startingFloat() as any);
    const currentPayouts = this.safeParseLocal(this.supplierPayouts() as any);
    const finalTotal = currentFloat + todaysCashSales - currentPayouts;
    return isNaN(finalTotal) ? 0 : finalTotal;
  });

  public salesTarget = 1000; 
  public targetProgress = computed(() => {
    const today = new Date().toDateString();
    let todayRev = 0;
    const txs = this.salesService.transactions() || [];
    
    txs.forEach(tx => {
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === today) {
        todayRev += this.safeParseLocal(tx.grandTotal as any);
      }
    });
    
    const safeRev = isNaN(todayRev) ? 0 : todayRev;
    let rawPercent = (safeRev / this.salesTarget) * 100;
    if (isNaN(rawPercent) || !isFinite(rawPercent)) rawPercent = 0;
    
    return { rev: safeRev, percent: Math.min(100, rawPercent) };
  });

  public threeHourSnapshot = computed(() => {
    const now = Date.now();
    const threeHoursAgo = now - (3 * 60 * 60 * 1000); 
    let rev = 0;
    let count = 0;

    const txs = this.salesService.transactions() || [];
    txs.forEach(tx => {
      if (tx && tx.timestamp) {
        const txTime = new Date(tx.timestamp).getTime();
        if (txTime >= threeHoursAgo && txTime <= now) {
          rev += this.safeParseLocal(tx.grandTotal as any);
          count++;
        }
      }
    });

    return { revenue: isNaN(rev) ? 0 : rev, count };
  });

  // ========================================================
  // ⭐ NEW: BUSIEST HOURS CHART LOGIC
  // ========================================================
  public busiestHours = computed(() => {
    const txs = this.salesService.transactions() || [];
    const hourlyData = new Array(24).fill(0);
    
    txs.forEach(tx => {
      if (tx && tx.timestamp) {
        const hour = new Date(tx.timestamp).getHours();
        hourlyData[hour] += this.safeParseLocal(tx.grandTotal as any);
      }
    });

    // Find the max hour to scale the bars from 0 to 100%
    const maxRev = Math.max(...hourlyData, 1); 

    return hourlyData.map((rev, index) => {
      const hourLabel = index.toString().padStart(2, '0') + ':00';
      const percentage = (rev / maxRev) * 100;
      return { hour: hourLabel, revenue: rev, percentage };
    });
  });

  public getExpireStatus(expire?: string): 'safe' | 'warning' | 'danger' | 'none' {
    if (!expire) return 'none';
    const expDate = new Date(expire + 'T00:00:00');
    if (isNaN(expDate.getTime())) return 'none'; 
    const diffDays = Math.ceil((expDate.getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'danger'; 
    if (diffDays <= 14) return 'warning'; 
    return 'safe'; 
  }

  public systemAlerts = computed(() => {
    const alerts: { type: string, msg: string }[] = [];
    const prods = this.salesService.products() || [];
    prods.forEach(p => {
      if (!p) return;
      const stock = this.safeParseLocal(p.stockQuantity as any);
      if (stock <= this.safeParseLocal(p.minStockWarning || 5 as any)) alerts.push({ type: 'warning', msg: `Low Stock: ${p.name} (${stock} left)` });
      if (this.getExpireStatus(p.expire) === 'danger') alerts.push({ type: 'danger', msg: `🔴 EXPIRED: ${p.name}!` });
    });
    return alerts;
  });

  public addManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '💵 Add Cash to Drawer', message: 'Enter the amount of cash added (Starting float or top-up):', value: '',
      onConfirm: (val) => {
        const amount = this.safeParseLocal(val as any);
        const newTotal = this.safeParseLocal(this.startingFloat() as any) + amount;
        this.startingFloat.set(newTotal);
        if (typeof window !== 'undefined') localStorage.setItem('maranth_float', newTotal.toString());
        this.salesService.closeModal();
      }
    });
  }

  public removeManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '📤 Remove Cash from Drawer', message: 'Enter the amount removed (Supplier payment or safe drop):', value: '',
      onConfirm: (val) => {
        const amount = this.safeParseLocal(val as any);
        const newTotal = this.safeParseLocal(this.supplierPayouts() as any) + amount;
        this.supplierPayouts.set(newTotal);
        if (typeof window !== 'undefined') localStorage.setItem('maranth_payouts', newTotal.toString());
        this.salesService.closeModal();
      }
    });
  }

  public resetDrawer(): void {
    this.salesService.activeModal.set({
      type: 'warning', title: '⚠️ Close Shift / Reset Drawer', message: 'Are you sure you want to reset the Cash Tracker back to zero?', value: '',
      onConfirm: () => {
        this.startingFloat.set(0);
        this.supplierPayouts.set(0);
        if (typeof window !== 'undefined') {
          localStorage.setItem('maranth_float', '0');
          localStorage.setItem('maranth_payouts', '0');
        }
        this.salesService.closeModal();
      }
    });
  }

  public todaysTransactions = computed(() => {
    const today = new Date().toDateString();
    const txs = this.salesService.transactions() || [];
    return txs.filter(tx => tx && tx.timestamp && new Date(tx.timestamp).toDateString() === today).reverse();
  });
}