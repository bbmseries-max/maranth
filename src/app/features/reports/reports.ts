import { Component, inject, computed, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

export interface CashLog {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  timestamp: Date;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);
  public Math = Math;

  // ⭐ TAB CONTROLLER
  public activeTab = signal<string>('zreport');
  public analyticsDate = signal<string>(new Date().toISOString().split('T')[0]);

  // ========================================================
  // ⭐ TAB 1: Z-REPORT & SALES LEDGER
  // ========================================================
  public selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  public selectedTxnId = signal<string | null>(null);

  public get cashLogs() { return this.salesService.cashLogs; }
  public isShiftModalOpen = signal<boolean>(false);

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
      const txTotal = this.safeNumber(tx.grandTotal);
      totalRev += txTotal;
      
      if (tx.paymentMethod === 'Cash') cashRev += txTotal;
      else cardRev += txTotal;

      tx.items.forEach((item: any) => {
        const sellPrice = this.safeNumber(item.product.price);
        const costPrice = this.safeNumber(item.product.costPrice || item.product.wholesalePrice || 0);
        const qty = this.safeNumber(item.quantity);
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
                     stockQuantity: this.safeNumber(item.product.stockQuantity)
                 });
             }
             const prodData = productMap.get(pid);
             prodData.unitsSold += this.safeNumber(item.quantity);
             prodData.totalRevenue += (this.safeNumber(item.product.price) * this.safeNumber(item.quantity));
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
              hourlyData[hour].revenue += this.safeNumber(tx.grandTotal);
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
      if (percentage < 20) return 'rgba(59, 130, 246, 0.1)'; 
      if (percentage < 50) return 'rgba(59, 130, 246, 0.3)'; 
      if (percentage < 80) return 'rgba(37, 99, 235, 0.7)'; 
      return 'rgba(30, 64, 175, 1)'; 
  }

  // 3. LAST 7 DAYS PERFORMANCE TREND
  public weeklyPerformanceMetrics = computed(() => {
      const txs = this.salesService.transactions() || [];
      
      const last7Days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i)); 
          return {
              dateStr: d.toDateString(),
              label: d.toLocaleDateString('en-US', { weekday: 'short' }), 
              revenue: 0,
              intensityPercentage: 0
          };
      });

      txs.forEach(tx => {
          if (tx && tx.timestamp) {
              const txDateStr = new Date(tx.timestamp).toDateString();
              const dayBucket = last7Days.find(d => d.dateStr === txDateStr);
              if (dayBucket) {
                  dayBucket.revenue += this.safeNumber(tx.grandTotal);
              }
          }
      });

      const maxRev = Math.max(...last7Days.map(d => d.revenue), 1);
      last7Days.forEach(d => {
          d.intensityPercentage = (d.revenue / maxRev) * 100;
      });

      return last7Days;
  });

  // ========================================================
  // ⭐ TAB 3: LIVE DASHBOARD WIDGETS
  // ========================================================
  public todayProfit = computed(() => {
    const todayStr = new Date().toDateString();
    let totalEarnings = 0;

    const txs = this.salesService.transactions() || [];
    
    txs.forEach(tx => {
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === todayStr) {
        const pastOrder: any = tx;
        const itemsArray = pastOrder.basket || pastOrder.items || [];

        if (Array.isArray(itemsArray)) {
          itemsArray.forEach((item: any) => {
            const product = item.product || item; 
            const retailPrice = this.safeNumber(product.price);
            const wholesaleCost = this.safeNumber(product.costPrice || product.purchasePrice || 0);
            const quantity = this.safeNumber(item.quantity || 1);

            totalEarnings += (retailPrice - wholesaleCost) * quantity;
          });
        }
      }
    });

    return isNaN(totalEarnings) ? 0 : totalEarnings;
  });
  
  constructor() {
    effect(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('maranth_cash_logs', JSON.stringify(this.cashLogs()));
      }
    });
  }

  private loadSavedLogs(): CashLog[] {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('maranth_cash_logs');
    if (!saved) return [];

    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing cash logs', e);
      return [];
    }
  }

  public liveCashInDrawer = computed(() => {
    const today = new Date().toDateString();
    let todaysCashSales = 0;
    
    const txs = this.salesService.transactions() || [];
    txs.forEach(tx => {
      if (tx && tx.timestamp && tx.paymentMethod) {
        const isToday = new Date(tx.timestamp).toDateString() === today;
        const isCash = String(tx.paymentMethod).toLowerCase() === 'cash';
        if (isToday && isCash) {
          todaysCashSales += this.safeNumber(tx.grandTotal);
        }
      }
    });

    let manualCashIn = 0;
    let manualCashOut = 0;
    this.cashLogs().forEach(log => {
      if (log.type === 'IN') manualCashIn += log.amount;
      if (log.type === 'OUT') manualCashOut += log.amount;
    });

    let finalTotal = manualCashIn + todaysCashSales - manualCashOut;
    return isNaN(finalTotal) ? 0 : Math.round(finalTotal * 100) / 100;
  });

  public salesTarget = 1000; 
  public targetProgress = computed(() => {
    const today = new Date().toDateString();
    let todayRev = 0;
    
    const txs = this.salesService.transactions() || [];
    txs.forEach(tx => {
      if (tx && tx.timestamp && new Date(tx.timestamp).toDateString() === today) {
        todayRev += this.safeNumber(tx.grandTotal);
      }
    });
    
    let rawPercent = (todayRev / this.salesTarget) * 100;
    return { rev: todayRev, percent: Math.min(100, isNaN(rawPercent) ? 0 : rawPercent) };
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
        const amount = this.safeNumber(tx.grandTotal);

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
      const stock = this.safeNumber(p.stockQuantity);
      if (stock <= this.safeNumber(p.minStockWarning || 5)) {
        alerts.push({ type: 'warning', msg: `Low Stock: ${p.name} (${stock} left)` });
      }
      
      if (p.expire) {
        const expDate = new Date(p.expire + 'T00:00:00');
        const diffDays = Math.ceil((expDate.getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) alerts.push({ type: 'danger', msg: `🔴 EXPIRED: ${p.name}!` });
      }
    });
    return alerts;
  });

  public async addManualCash(): Promise<void> {
    const amountStr = window.prompt('🟢 ADD CASH\n\nEnter the amount (€):');
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    const reason = window.prompt('Enter the reason (e.g., Starting Float, Change from safe):');
    if (!reason) return;

    const newLog = {
      id: Date.now().toString(),
      type: 'IN',
      amount: amount,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    this.salesService.cashLogs.update((logs: any) => [...logs, newLog]);

    try {
      const { doc, setDoc } = await import('firebase/firestore'); 
      await setDoc(doc(this.salesService.db, 'cashLogs', newLog.id), newLog);
    } catch (error) {
      console.error("Failed to sync cash drawer to Firebase:", error);
    }
  }

  public async removeManualCash(): Promise<void> {
    const amountStr = window.prompt('🔴 PAYOUT / REMOVE CASH\n\nEnter the amount (€):');
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    const reason = window.prompt('Enter the reason (e.g., Supplier payment):');
    if (!reason) return;

    const newLog = {
      id: Date.now().toString(),
      type: 'OUT',
      amount: amount,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    this.salesService.cashLogs.update((logs: any) => [...logs, newLog]);

    try {
      const { doc, setDoc } = await import('firebase/firestore'); 
      await setDoc(doc(this.salesService.db, 'cashLogs', newLog.id), newLog);
    } catch (error) {
      console.error("Failed to sync cash payout to Firebase:", error);
    }
  }

  public resetDrawer(): void {
    this.salesService.cashLogs.set([]);
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

  private safeNumber(val: any): number {
    if (val === null || val === undefined) return 0;
    const parsed = Number(val);
    return isNaN(parsed) ? 0 : parsed;
  }

  public categoryBreakdown = computed(() => {
    const categoryMap = new Map<string, { revenue: number, profit: number }>();
    const allCategories = this.salesService.categories() || [];
    
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach((item: any) => {
        const rawCatId = item.product.categoryId || item.product.category;
        const matchedCategory = allCategories.find((c: any) => c.id === rawCatId);
        const catName = matchedCategory ? matchedCategory.name : 'Uncategorized';
        
        const sellPrice = this.safeNumber(item.product.price);
        const costPrice = this.safeNumber((item.product as any).costPrice || (item.product as any).wholesalePrice || 0);
        const qty = this.safeNumber(item.quantity);
        
        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, { revenue: 0, profit: 0 });
        }
        
        const data = categoryMap.get(catName)!;
        data.revenue += (sellPrice * qty);
        data.profit += ((sellPrice - costPrice) * qty);
      });
    });
    
    return Array.from(categoryMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue);
  });

  public staffPerformance = computed(() => {
    const staffMap = new Map<string, { revenue: number, tickets: number }>();
    
    this.filteredTransactions().forEach(tx => {
      const cashier = (tx as any).cashierId || (tx as any).cashierName || (tx as any).cashier || 'Unknown';
      const total = this.safeNumber(tx.grandTotal);
      
      if (!staffMap.has(cashier)) {
        staffMap.set(cashier, { revenue: 0, tickets: 0 });
      }
      
      const data = staffMap.get(cashier)!;
      data.revenue += total;
      
      if (total > 0) data.tickets += 1; 
    });
    
    return Array.from(staffMap.entries())
      .map(([name, stats]) => ({ 
        name, 
        revenue: stats.revenue, 
        tickets: stats.tickets,
        avgTicket: stats.tickets > 0 ? stats.revenue / stats.tickets : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);
  });

  public trueProfitReport = computed(() => {
    const reportMap = new Map<string, any>();
    const targetDateStr = new Date(this.analyticsDate()).toDateString();
    
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach((item: any) => {
        const pId = item.product.id;
        if (!reportMap.has(pId)) {
          reportMap.set(pId, {
            name: item.product.name,
            qtySold: 0,
            revenue: 0,
            qtyWasted: 0,
            costOfWasted: 0,
            costOfSold: 0,
            buyingPrice: this.safeNumber(item.product.costPrice || item.product.wholesalePrice || 0)
          });
        }
        
        const data = reportMap.get(pId)!;
        const qty = this.safeNumber(item.quantity);
        const sellPrice = this.safeNumber(item.product.price);
        
        data.qtySold += qty;
        data.revenue += (sellPrice * qty);
        data.costOfSold += (data.buyingPrice * qty);
      });
    });

    const allWaste = this.salesService.spoilageLogs ? this.salesService.spoilageLogs() : [];
    
    allWaste.forEach(log => {
      if (new Date(log.timestamp).toDateString() === targetDateStr) {
        if (!reportMap.has(log.productId)) {
          reportMap.set(log.productId, {
            name: log.productName,
            qtySold: 0,
            revenue: 0,
            qtyWasted: 0,
            costOfWasted: 0,
            costOfSold: 0,
            buyingPrice: this.safeNumber(log.buyingPrice)
          });
        }
        
        const data = reportMap.get(log.productId)!;
        const qty = this.safeNumber(log.quantity);
        data.qtyWasted += qty;
        data.costOfWasted += (data.buyingPrice * qty);
      }
    });

    return Array.from(reportMap.values())
      .map(data => {
        const trueProfit = data.revenue - (data.costOfSold + data.costOfWasted);
        return {
          ...data,
          trueProfit,
          isLoss: trueProfit < 0
        };
      })
      .filter(item => item.qtyWasted > 0)
      .sort((a, b) => a.trueProfit - b.trueProfit);
  });

  public inventoryValuation = computed(() => {
    let totalWholesaleValue = 0;
    let totalRetailValue = 0;
    let lowMoversCount = 0;
    
    const prods = this.salesService.products() || [];
    const soldTodayIds = this.topSellingProducts().map(p => p.id); 

    prods.forEach(p => {
      if (!p) return;
      const qty = this.safeNumber(p.stockQuantity);
      if (qty > 0) {
        const cost = this.safeNumber((p as any).costPrice || (p as any).wholesalePrice || 0);
        const retail = this.safeNumber(p.price);
        totalWholesaleValue += (cost * qty);
        totalRetailValue += (retail * qty);

        if (!soldTodayIds.includes(p.id)) {
           lowMoversCount++;
        }
      }
    });
    
    return { 
      totalWholesaleValue, 
      totalRetailValue, 
      expectedProfit: totalRetailValue - totalWholesaleValue,
      lowMoversCount
    };
  });

  public securityAuditor = computed(() => {
    let refundTotal = 0;
    let refundCount = 0;
    const sketchyTxns: any[] = [];

    this.filteredTransactions().forEach(tx => {
      const total = this.safeNumber(tx.grandTotal);
      if (total < 0 || (tx as any).isRefund) {
        refundTotal += Math.abs(total);
        refundCount++;
        sketchyTxns.push(tx);
      }
    });

    return { refundTotal, refundCount, sketchyTxns };
  });

  // Track cash drawer balance (persistent with local storage fallback)
  public cashDrawerBalance = signal<number>(
    Number(localStorage.getItem('cash_drawer_balance')) || 230
  );

// Inside ReportsComponent class in reports.ts

// Inside ReportsComponent class in reports.ts

public async onCloseShiftSubmit(event: Event) {
  event.preventDefault();

  const currentCash = this.liveCashInDrawer();
  if (currentCash <= 0) {
    this.isShiftModalOpen.set(false);
    alert('Το ταμείο είναι μέδη ήδη 0!');
    return;
  }

  // 1. Create a balancing OUT log for the full current cash amount
  const resetLog: CashLog = {
    id: Date.now().toString(),
    type: 'OUT',
    amount: currentCash,
    reason: 'Shift Close / Bank Drop',
    timestamp: new Date()
  };

  // 2. Add the log to cashLogs so (Sales + In) - (Out + Reset) = 0
  this.salesService.cashLogs.update((logs: any) => [...logs, resetLog]);

  // 3. Optional: Sync to Firestore
  try {
    if (this.salesService.db) {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(this.salesService.db, 'cashLogs', resetLog.id), {
        ...resetLog,
        timestamp: resetLog.timestamp.toISOString()
      });
    }
  } catch (error) {
    console.error("Failed to sync shift reset log to Firebase:", error);
  }

  // 4. Close modal
  this.isShiftModalOpen.set(false);
  alert(`Η βάρδια έκλεισε επιτυχώς (€${currentCash.toFixed(2)}). Το ταμείο μηδενίστηκε!`);
}
}