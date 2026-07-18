import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms'; // ⭐ IMPORTED FORMS MODULE
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe], // ⭐ ADDED HERE
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);

  // ⭐ TAB CONTROLLER
  public activeTab = signal<string>('zreport');

  // ========================================================
  // ⭐ TAB 1: Z-REPORT & SALES LEDGER
  // ========================================================
  public selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  public selectedTxnId = signal<string | null>(null);

  public filteredTransactions = computed(() => {
    const targetDate = new Date(this.selectedDate()).toDateString();
    const txs = this.salesService.transactions() || [];
    return txs.filter(tx => tx && tx.timestamp && new Date(tx.timestamp).toDateString() === targetDate).reverse();
  });

  public zReportStats = computed(() => {
    let totalRev = 0;
    let cashRev = 0;
    let cardRev = 0;
    let totalProfit = 0;

    this.filteredTransactions().forEach(tx => {
      const txTotal = this.safeParseLocal(tx.grandTotal as any);
      totalRev += txTotal;
      
      if (tx.paymentMethod === 'Cash') cashRev += txTotal;
      else cardRev += txTotal;

      tx.items.forEach((item: any) => {
        const sellPrice = this.safeParseLocal(item.product.price);
        const costPrice = this.safeParseLocal(item.product.costPrice || item.product.wholesalePrice || 0);
        const qty = this.safeParseLocal(item.quantity);
        totalProfit += (sellPrice - costPrice) * qty;
      });
    });

    return { totalRev, cashRev, cardRev, totalProfit, count: this.filteredTransactions().length };
  });

  public totalRevenue = computed(() => this.zReportStats().totalRev);
  public cashRevenue = computed(() => this.zReportStats().cashRev);
  public cardRevenue = computed(() => this.zReportStats().cardRev);
  public totalSalesCount = computed(() => this.zReportStats().count);

  public printZReport(): void {
    window.print();
  }

  public topSellingProducts = computed(() => {
     const productMap = new Map<string, any>();
     this.filteredTransactions().forEach(tx => {
         tx.items.forEach((item: any) => {
             const pid = item.product.id;
             if (!productMap.has(pid)) {
                 productMap.set(pid, {
                     id: pid,
                     name: item.product.name,
                     unitsSold: 0,
                     totalRevenue: 0,
                     stockQuantity: this.safeParseLocal(item.product.stockQuantity)
                 });
             }
             const prodData = productMap.get(pid);
             prodData.unitsSold += this.safeParseLocal(item.quantity);
             prodData.totalRevenue += (this.safeParseLocal(item.product.price) * this.safeParseLocal(item.quantity));
         });
     });
     return Array.from(productMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
  });

  public selectTxn(id: string): void {
      this.selectedTxnId.set(id);
  }

  public selectedTxnDetails = computed(() => {
      const id = this.selectedTxnId();
      if(!id) return null;
      return this.filteredTransactions().find(tx => tx.id === id) || null;
  });

  public clearAllLedgerData(): void {
      if(confirm("Are you sure you want to clear the entire transaction ledger? This cannot be undone.")) {
          this.salesService.clearTransactions();
      }
  }

  // ========================================================
  // ⭐ TAB 2: ANALYTICS (HEATMAP)
  // ========================================================
  public hourlyHeatmapMetrics = computed(() => {
      const txs = this.salesService.transactions() || [];
      const hourlyData = new Array(24).fill(null).map((_, i) => ({
          hour: i,
          hourLabel: `${i.toString().padStart(2, '0')}:00`,
          revenue: 0,
          ticketCount: 0,
          intensityPercentage: 0,
          averageTicketSize: 0
      }));

      txs.forEach(tx => {
          if(tx && tx.timestamp) {
              const hour = new Date(tx.timestamp).getHours();
              hourlyData[hour].revenue += this.safeParseLocal(tx.grandTotal as any);
              hourlyData[hour].ticketCount += 1;
          }
      });

      const maxRev = Math.max(...hourlyData.map(d => d.revenue), 1);
      
      hourlyData.forEach(d => {
          d.intensityPercentage = (d.revenue / maxRev) * 100;
          d.averageTicketSize = d.ticketCount > 0 ? d.revenue / d.ticketCount : 0;
      });

      return hourlyData;
  });

  public getHeatmapBg(percentage: number): string {
      if (percentage === 0) return 'transparent';
      if (percentage < 20) return '#dbeafe'; 
      if (percentage < 50) return '#60a5fa'; 
      if (percentage < 80) return '#2563eb'; 
      return '#1e3a8a'; 
  }

  // ========================================================
  // ⭐ TAB 3: LIVE DASHBOARD WIDGETS
  // ========================================================
  
 public todayProfit = computed(() => {
    const todayStr = new Date().toDateString();
    let totalEarnings = 0;

    const txs = this.salesService.transactions() || [];
    
    txs.forEach(tx => {
      // Only calculate for today's transactions
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === todayStr) {
        
        // ⭐ FIX: Tell TypeScript to relax by casting tx to 'any'
        const pastOrder: any = tx;
        
        // Grab the items array (it might be saved as 'basket' or 'items')
        const itemsArray = pastOrder.basket || pastOrder.items || [];

        // Loop through every item in this transaction
        if (Array.isArray(itemsArray)) {
          itemsArray.forEach((item: any) => {
            
            const product = item.product || item; 
            
            const retailPrice = this.safeParseLocal(product.price);
            // Check both costPrice and purchasePrice depending on what you named it
            const wholesaleCost = this.safeParseLocal(product.costPrice || product.purchasePrice || 0);
            const quantity = this.safeParseLocal(item.quantity || 1);

            // Calculate profit for this line item and add to total
            const itemProfit = (retailPrice - wholesaleCost) * quantity;
            totalEarnings += itemProfit;
          });
        }
      }
    });

    return isNaN(totalEarnings) ? 0 : totalEarnings;
  });
  
  public startingFloat = signal<number>(this.safeParseLocal('maranth_float'));
  public supplierPayouts = signal<number>(this.safeParseLocal('maranth_payouts'));
  
  public liveCashInDrawer = computed(() => {
    const today = new Date().toDateString();
    let todaysCashSales = 0;
    const txs = this.salesService.transactions() || [];
    txs.forEach(tx => {
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === today && tx.paymentMethod === 'Cash') {
        todaysCashSales += this.safeParseLocal(tx.grandTotal as any);
      }
    });
    const finalTotal = this.safeParseLocal(this.startingFloat() as any) + todaysCashSales - this.safeParseLocal(this.supplierPayouts() as any);
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
    return { rev: safeRev, percent: Math.min(100, isNaN(rawPercent) ? 0 : rawPercent) };
  });

 public dailyShifts = computed(() => {
    const todayStr = new Date().toDateString();
    let shift1 = { rev: 0, count: 0 }; // 08:00 - 15:00
    let shift2 = { rev: 0, count: 0 }; // 15:00 - 17:00
    let shift3 = { rev: 0, count: 0 }; // 17:00 - 23:00

    const txs = this.salesService.transactions() || [];
    txs.forEach(tx => {
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === todayStr) {
        const txHour = new Date(tx.timestamp).getHours(); 
        const amount = this.safeParseLocal(tx.grandTotal as any);

        if (txHour >= 8 && txHour < 15) {
          shift1.rev += amount; shift1.count++;
        } else if (txHour >= 15 && txHour < 17) {
          shift2.rev += amount; shift2.count++;
        } else if (txHour >= 17 && txHour < 23) {
          shift3.rev += amount; shift3.count++;
        }
      }
    });

    return { shift1, shift2, shift3 };
  });

  public systemAlerts = computed(() => {
    const alerts: { type: string, msg: string }[] = [];
    const prods = this.salesService.products() || [];
    prods.forEach(p => {
      if (!p) return;
      const stock = this.safeParseLocal(p.stockQuantity as any);
      if (stock <= this.safeParseLocal(p.minStockWarning || 5 as any)) alerts.push({ type: 'warning', msg: `Low Stock: ${p.name} (${stock} left)` });
      
      if (p.expire) {
        const expDate = new Date(p.expire + 'T00:00:00');
        const diffDays = Math.ceil((expDate.getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) alerts.push({ type: 'danger', msg: `🔴 EXPIRED: ${p.name}!` });
      }
    });
    return alerts;
  });

  public addManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '💵 Add Cash', message: 'Enter cash added:', value: '',
      onConfirm: (val) => {
        const newTotal = this.safeParseLocal(this.startingFloat() as any) + this.safeParseLocal(val as any);
        this.startingFloat.set(newTotal);
        if (typeof window !== 'undefined') localStorage.setItem('maranth_float', newTotal.toString());
        this.salesService.closeModal();
      }
    });
  }

  public removeManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '📤 Remove Cash', message: 'Enter amount removed:', value: '',
      onConfirm: (val) => {
        const newTotal = this.safeParseLocal(this.supplierPayouts() as any) + this.safeParseLocal(val as any);
        this.supplierPayouts.set(newTotal);
        if (typeof window !== 'undefined') localStorage.setItem('maranth_payouts', newTotal.toString());
        this.salesService.closeModal();
      }
    });
  }

  public resetDrawer(): void {
    this.startingFloat.set(0);
    this.supplierPayouts.set(0);
    if (typeof window !== 'undefined') {
      localStorage.setItem('maranth_float', '0');
      localStorage.setItem('maranth_payouts', '0');
    }
  }

  // ========================================================
  // ⭐ HELPERS
  // ========================================================
  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    if (isNaN(parsed)) return '€0.00';
    return '€' + parsed.toFixed(2);
  }

  private safeParseLocal(key: string | number): number {
    if (typeof key === 'number') return isNaN(key) ? 0 : key;
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 0;
    const val = localStorage.getItem(key as string) || key;
    const parsed = Number(val);
    return isNaN(parsed) ? 0 : parsed;
  }
}