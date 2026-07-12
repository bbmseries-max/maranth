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

  // Active Filter States (set to 'All' by default)
  selectedCategory = signal<string>('All');
  selectedSupplier = signal<string>('All');

 // Filter state tracking variables (Using 'All' as the string bypass)
  selectedCategoryId = signal<string>('All');
  selectedSupplierId = signal<string>('All');
  
  public salesService = inject(SalesService);
  public selectedTxnId = signal<string | null>(null);

  protected readonly Math = Math;
  

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

  getHeatmapBg(intensity: number): string {
  if (intensity === 0) return '#f1f5f9'; // Zero sales (Light Slate)
  if (intensity > 75)   return '#ef4444'; // Red-hot peak velocity
  if (intensity > 45)   return '#f97316'; // Orange steady mid-day flow
  return '#3b82f6';                       // Standard active blue traffic
 }

 // 🏆 Updated Leaderboard Method with Category & Supplier filter checking
// 🏆 1. Filtered Leaderboard View
filteredTopSellingProducts = computed(() => {
  const targetCatId = this.selectedCategoryId();
  const targetSupId = this.selectedSupplierId();
  
  return this.salesService.topSellingProducts().filter((item: any) => {
    const matchCat = targetCatId === 'All' || item.categoryId === targetCatId;
    // If your product stores a supplier id link (e.g. item.supplierId), evaluate it here:
    const matchSup = targetSupId === 'All' || item.supplierId === targetSupId;
    
    return matchCat && matchSup;
  });
});

// 🏷️ Dynamically populate Categories from your master Category array
categoriesList = computed(() => {
  // Replace 'this.salesService.categories()' with your actual category source name
  const rawCats = this.salesService.categories() || [];
  return [{ id: 'All', name: 'All Categories' }, ...rawCats];
});

// 🏢 Dynamically populate Suppliers from your key-indexed dictionary object
suppliersList = computed(() => {
  // Replace 'this.salesService.suppliers()' with your actual supplier dictionary source name
  const rawSups = this.salesService.suppliers() || {};
  const list = Object.values(rawSups).map((s: any) => ({ id: s.id, name: s.name }));
  return [{ id: 'All', name: 'All Suppliers' }, ...list];
});

// Helper to transform dictionary to array if your products source is an object map
productsArray = computed(() => {
  const rawProducts = this.salesService.products() || {};
  return Object.values(rawProducts);
});

// ⚠️ Safe Filtered Low Stock Alerts
filteredLowStockAlerts = computed(() => {
  const targetCatId = this.selectedCategoryId();
  const targetSupId = this.selectedSupplierId();
  
  return this.productsArray().filter((prod: any) => {
    // 1. Check Category match
    const matchCat = targetCatId === 'All' || prod.categoryId === targetCatId;
    
    // 2. Safe Supplier Check: If 'All', true. Otherwise, check explicit link
    const matchSup = targetSupId === 'All' || (prod.supplierId && prod.supplierId === targetSupId);
    
    // 3. Check stock balance threshold
    const isLow = prod.stockQuantity <= 5;
    
    return matchCat && matchSup && isLow;
  }).sort((a: any, b: any) => a.stockQuantity - b.stockQuantity);
});

/**
 * 🖨️ Generates a print viewport context or PDF layout for the inventory listings
 */
public printZReport(): void {
  // If you are using native browser print, you can trigger it directly:
  window.print();
  
  // Or log/handle custom reporting exports here:
  console.log('Generating current inventory matrix print report...');
}

}