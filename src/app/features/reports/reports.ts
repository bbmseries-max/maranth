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

  // --- 🎛️ FILTERS ---
  public selectedCategoryId = signal<string>('ALL');
  public selectedSupplierId = signal<string>('ALL');
  
  // 📁 Dynamic Category Extractor
  public categoriesList = computed(() => {
    const explicitCategories = this.salesService.categories();
    if (explicitCategories && explicitCategories.length > 0) {
      return [{id: 'ALL', name: '🌐 All Categories'}, ...explicitCategories];
    }
    return [{id: 'ALL', name: '🌐 All Categories'}];
  });

  // 🚚 Dynamic Supplier Extractor
  public suppliersList = computed(() => {
    const explicitSuppliers = this.salesService.suppliers();
    if (explicitSuppliers && explicitSuppliers.length > 0) {
       return [{id: 'ALL', name: '🚚 All Suppliers'}, ...explicitSuppliers];
    }
    return [{id: 'ALL', name: '🚚 All Suppliers'}];
  });

  // --- 💶 REVENUE METRICS ---
  public totalRevenue = computed(() => {
    return this.salesService.transactions().reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalTax = computed(() => {
    return this.salesService.transactions().reduce((sum, tx) => sum + (tx.taxAmount || 0), 0);
  });

  public cashRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'Cash')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public cardRevenue = computed(() => {
    return this.salesService.transactions()
      .filter(tx => tx.paymentMethod === 'Card' || tx.paymentMethod === 'Debit')
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
  });

  public totalSalesCount = computed(() => {
    return this.salesService.transactions().length;
  });

  // --- 📦 INVENTORY VALUATION METRICS ---
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
    let topProducts = this.salesService.topSellingProducts();
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
    return this.salesService.transactions().find(tx => tx.id === id) || null;
  });

  // --- 🌡️ HEATMAP HELPER ---
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