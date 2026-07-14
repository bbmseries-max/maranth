import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe, DatePipe],
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

    const catMap = new Map<string, string>();
    this.salesService.products().forEach(p => {
      const id = (p.categoryId || (p as any).category_id)?.toString().trim();
      if (!id) return;
      if (!catMap.has(id)) {
        let name = `Category ${id}`;
        switch (id) {
          case '5605': name = 'Shkolla - Lojra'; break;
          case '5619': name = 'Xartika kouzinas - Banjo'; break;
          case '5614': name = 'Freska Fruta'; break;
          case '5613': name = 'Freska laxanika'; break;
          case '5636': name = 'Karta ananeosis'; break;
          case '5606': name = 'Caj zesto - Rofimata'; break;
          case '5609': name = 'Cikles - Karameles'; break;
          case '5622': name = 'Idi kapnistou -Pipes - Anaptires'; break;
          case '5627': name = 'Zootrofes - Axesuar katikidion'; break;
          case '5635': name = 'Veze'; break;
        }
        catMap.set(id, name);
      }
    });

    const deduced = Array.from(catMap, ([id, name]) => ({ id, name }));
    deduced.sort((a, b) => a.name.localeCompare(b.name));
    return [{id: 'ALL', name: '🌐 All Categories'}, ...deduced];
  });

  // 🚚 Dynamic Supplier Extractor
  public suppliersList = computed(() => {
    const explicitSuppliers = this.salesService.suppliers();
    if (explicitSuppliers && explicitSuppliers.length > 0) {
       return [{id: 'ALL', name: '🚚 All Suppliers'}, ...explicitSuppliers];
    }

    const supMap = new Map<string, string>();
    this.salesService.products().forEach(p => {
      const id = (p as any).supplierId?.toString().trim();
      if (!id) return;
      if (!supMap.has(id)) {
         supMap.set(id, `Supplier ${id}`);
      }
    });
    
    const deduced = Array.from(supMap, ([id, name]) => ({ id, name }));
    deduced.sort((a, b) => a.name.localeCompare(b.name));
    return [{id: 'ALL', name: '🚚 All Suppliers'}, ...deduced];
  });

  // --- 💶 REVENUE METRICS ---
  public totalRevenue = computed(() => {
    return this.salesService.transactions().reduce((sum, tx) => sum + tx.grandTotal, 0);
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

  // --- 🏆 PRODUCT LEADERBOARD ---
  public filteredTopSellingProducts = computed(() => {
    let topProducts = this.salesService.topSellingProducts();
    const allProducts = this.salesService.products();
    
    // Filter by Category
    if (this.selectedCategoryId() !== 'ALL') {
      topProducts = topProducts.filter(tp => {
         const prod = allProducts.find(p => p.id === tp.id);
         return prod && prod.categoryId === this.selectedCategoryId();
      });
    }
    
    // Filter by Supplier
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
    // Triggers the browser's native print dialog
    window.print();
  }

  public clearAllLedgerData() {
    this.salesService.activeModal.set({
      type: 'warning',
      title: '⚠️ Clear Ledger',
      message: 'Are you sure you want to permanently erase today\'s local sales history? (Make sure your folder sync is up to date first!)',
      value: '',
      onConfirm: () => {
         this.salesService.transactions.set([]);
         this.selectedTxnId.set(null);
         this.salesService.activeModal.set(null);
      }
    });
  }
}