import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent {
  public salesService = inject(SalesService);
  public todayDate = new Date();

  // --- ⭐ NEW: TABS & TIME FILTERS ---
  public activeTab = signal<'ANALYTICS' | 'Z_REPORT'>('ANALYTICS');
  public dateRange = signal<'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL_TIME'>('TODAY');

  public selectedCategoryId = signal<string>('ALL');
  public selectedSupplierId = signal<string>('ALL');
  
  public categoriesList = computed(() => {
    const explicitCategories = this.salesService.categories();
    if (explicitCategories && explicitCategories.length > 0) {
      return [{id: 'ALL', name: '🌐 All Categories'}, ...explicitCategories];
    }
    return [{id: 'ALL', name: '🌐 All Categories'}];
  });

  public suppliersList = computed(() => {
    const explicitSuppliers = this.salesService.suppliers();
    if (explicitSuppliers && explicitSuppliers.length > 0) {
       return [{id: 'ALL', name: '🚚 All Suppliers'}, ...explicitSuppliers];
    }
    return [{id: 'ALL', name: '🚚 All Suppliers'}];
  });

  // --- ⭐ NEW: MASTER TRANSACTION FILTER ---
  // This calculates exactly which receipts belong in the selected time period!
  public filteredTransactions = computed(() => {
    const allTx = this.salesService.transactions();
    const tab = this.activeTab();
    
    // Z-Report is ALWAYS locked to Today!
    const range = tab === 'Z_REPORT' ? 'TODAY' : this.dateRange();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let start = new Date(0); // Beginning of time
    let end = new Date(3000, 0, 1); // End of time

    if (range === 'TODAY') {
      start = today;
      end = tomorrow;
    } else if (range === 'YESTERDAY') {
      start = new Date(today);
      start.setDate(start.getDate() - 1);
      end = today;
    } else if (range === 'THIS_WEEK') {
      start = new Date(today);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      start.setDate(diff);
      end = tomorrow;
    } else if (range === 'THIS_MONTH') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = tomorrow;
    }

    return allTx.filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate >= start && txDate < end;
    });
  });

  // --- 💶 DYNAMIC REVENUE METRICS ---
  // These now listen to `filteredTransactions` instead of `allTransactions`!
  public totalRevenue = computed(() => {
    return this.filteredTransactions().reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalTax = computed(() => {
    return this.filteredTransactions().reduce((sum, tx) => sum + (tx.taxAmount || 0), 0);
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

  public totalSalesCount = computed(() => {
    return this.filteredTransactions().length;
  });

  // --- 📦 INVENTORY VALUATION METRICS (Always live snapshot) ---
  public totalInventoryCost = computed(() => {
    return this.salesService.products()
      .filter(p => p.stockQuantity > 0)
      .reduce((sum, p) => sum + (p.stockQuantity * (p.purchasePrice || 0)), 0);
  });

  public totalInventoryRetail = computed(() => {
    return this.salesService.products()
      .filter(p => p.stockQuantity > 0)
      .reduce((sum, p) => sum + (p.stockQuantity * (p.price || 0)), 0);
  });

  public totalStockItems = computed(() => {
    return this.salesService.products()
      .filter(p => p.stockQuantity > 0)
      .reduce((sum, p) => sum + p.stockQuantity, 0);
  });

  // --- 🏆 PRODUCT LEADERBOARD ---
  public filteredTopSellingProducts = computed(() => {
    const itemsMap = new Map<string, { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number }>();
    
    this.filteredTransactions().forEach(tx => {
      tx.items.forEach(item => {
        if (!itemsMap.has(item.product.id)) {
          itemsMap.set(item.product.id, { id: item.product.id, name: item.product.name, unitsSold: 0, totalRevenue: 0, stockQuantity: item.product.stockQuantity || 0 });
        }
        const stats = itemsMap.get(item.product.id)!;
        const effectiveQuantity = item.isRefund ? -item.quantity : item.quantity;
        stats.unitsSold += effectiveQuantity;
        stats.totalRevenue += (item.product.price * effectiveQuantity);
      });
    });
    
    let topProducts = Array.from(itemsMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
    const allProducts = this.salesService.products();
    
    if (this.selectedCategoryId() !== 'ALL') {
      topProducts = topProducts.filter(tp => {
         const prod = allProducts.find(p => p.id === tp.id);
         return prod && prod.categoryId === this.selectedCategoryId();
      });
    }
    
    if (this.selectedSupplierId() !== 'ALL') {
      topProducts = topProducts.filter(tp => {
         const prod = allProducts.find(p => p.id === tp.id);
         return prod && (prod as any).supplierId === this.selectedSupplierId();
      });
    }

    return topProducts;
  });

  // --- 🧾 LEDGER AUDITOR ---
  public selectedTxnId = signal<string | null>(null);

  public selectTxn(id: string) {
    this.selectedTxnId.set(id);
  }

  public selectedTxnDetails = computed(() => {
    const id = this.selectedTxnId();
    if (!id) return null;
    return this.filteredTransactions().find(tx => tx.id === id) || null;
  });

  // --- 🌡️ HEATMAP HELPER ---
  public getHourlyHeatmap = computed(() => {
    const hours = Array.from({length: 24}, (_, i) => ({
      hour: i, hourLabel: `${i.toString().padStart(2, '0')}:00`, revenue: 0, ticketCount: 0, intensityPercentage: 0
    }));

    this.filteredTransactions().forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      hours[hour].revenue += tx.grandTotal;
      hours[hour].ticketCount += 1;
    });

    const maxRev = Math.max(...hours.map(h => h.revenue));
    if (maxRev > 0) hours.forEach(h => { h.intensityPercentage = Math.round((h.revenue / maxRev) * 100); });
    return hours;
  });

  public getHeatmapBg(intensityPercentage: number): string {
    if (intensityPercentage === 0) return '#f1f5f9';
    if (intensityPercentage <= 25) return '#dbeafe';
    if (intensityPercentage <= 50) return '#93c5fd';
    if (intensityPercentage <= 75) return '#3b82f6';
    return '#1e40af';
  }

  // --- ⚡ ACTIONS ---
  public printZReport() {
    window.print();
  }

  public clearAllLedgerData() {
    this.salesService.activeModal.set({
      type: 'warning',
      title: '⚠️ Clear Ledger',
      message: 'Are you sure you want to permanently erase all sales history?',
      value: '',
      onConfirm: () => {
         this.salesService.clearLedger();
         this.selectedTxnId.set(null);
         this.salesService.closeModal();
      }
    });
  }
}