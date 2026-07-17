import { Component, OnInit, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ShoppingBasketComponent],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements OnInit, AfterViewInit {
  public salesService = inject(SalesService);
  public router = inject(Router);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  public searchQuery = signal<string>('');
  public selectedCategoryId = signal<string>('ALL');

  public showWeightedShelf = signal<boolean>(false);
  public showLooseShelf = signal<boolean>(false);
  public isSidebarMobileOpen = signal<boolean>(false); 
  public isMobileBasketOpen = signal<boolean>(false);

  public editingProduct = signal<Product | null>(null);
  public editForm: Partial<Product> = {};

  // ========================================================
  // ⭐ THE ULTIMATE FIX: CUSTOM MONEY FORMATTER
  // ========================================================
  // We completely bypass Angular's CurrencyPipe to prevent NG02100 crashes
  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    if (isNaN(parsed)) return '€0.00';
    return '€' + parsed.toFixed(2);
  }

  private parseSafe(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  // ========================================================
  // ⭐ LIVE CASH TRACKER LOGIC
  // ========================================================
  public startingFloat = signal<number>(this.parseSafe(typeof window !== 'undefined' ? localStorage.getItem('maranth_float') : 0));
  public supplierPayouts = signal<number>(this.parseSafe(typeof window !== 'undefined' ? localStorage.getItem('maranth_payouts') : 0));
  
  public liveCashInDrawer = computed(() => {
    const today = new Date().toDateString();
    let todaysCashSales = 0;
    
    const txs = this.salesService.transactions() || [];
    
    txs.forEach(tx => {
      if (tx && tx.timestamp) {
        const txDate = new Date(tx.timestamp);
        if (txDate.toDateString() === today && tx.paymentMethod === 'Cash') {
          todaysCashSales += this.parseSafe(tx.grandTotal);
        }
      }
    });

    const currentFloat = this.parseSafe(this.startingFloat());
    const currentPayouts = this.parseSafe(this.supplierPayouts());
    const finalTotal = currentFloat + todaysCashSales - currentPayouts;
    
    return isNaN(finalTotal) ? 0 : finalTotal;
  });

  public addManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '💵 Add Cash to Drawer', message: 'Enter the amount of cash added (Starting float or top-up):', value: '',
      onConfirm: (val) => {
        const amount = this.parseSafe(val);
        const newTotal = this.parseSafe(this.startingFloat()) + amount;
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
        const amount = this.parseSafe(val);
        const newTotal = this.parseSafe(this.supplierPayouts()) + amount;
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

  // ========================================================
  // ⭐ QUICK MISC CHARGE LOGIC
  // ========================================================
  public miscAmount = signal<string>('');

  public addMiscCharge(): void {
    const val = this.parseSafe(this.miscAmount());
    if (val <= 0) return;

    const miscProduct: Product = {
      id: 'MISC-' + Date.now(),
      name: '🏷️ Misc. Open Charge',
      price: val,
      stockQuantity: 999,
      categoryId: 'ALL',
      isActive: true,
      taxRate: 1.24,
      isWeighted: false
    };

    this.salesService.addToBasket(miscProduct);
    this.miscAmount.set('');
    this.salesService.triggerSearchFocus();
  }

  // ========================================================
  // ⭐ SALES TARGET & SYSTEM ALERTS
  // ========================================================
  public salesTarget = 1000; 
  
  public targetProgress = computed(() => {
    const today = new Date().toDateString();
    const txs = this.salesService.transactions() || [];
    
    let todayRev = 0;
    txs.forEach(tx => {
      if (tx && tx.timestamp) {
        if (new Date(tx.timestamp).toDateString() === today) {
          todayRev += this.parseSafe(tx.grandTotal);
        }
      }
    });
    
    const safeRev = isNaN(todayRev) ? 0 : todayRev;
    let rawPercent = (safeRev / this.salesTarget) * 100;
    
    if (isNaN(rawPercent) || !isFinite(rawPercent)) rawPercent = 0;
    
    const safePercent = Math.min(100, rawPercent);
    
    return { rev: safeRev, percent: safePercent };
  });

  public systemAlerts = computed(() => {
    const alerts: { type: string, msg: string }[] = [];
    const prods = this.salesService.products() || [];
    
    prods.forEach(p => {
      if (!p) return;
      const stock = this.parseSafe(p.stockQuantity);
      if (stock <= this.parseSafe(p.minStockWarning || 5)) alerts.push({ type: 'warning', msg: `Low Stock: ${p.name} (${stock} left)` });
      if (this.getExpireStatus(p.expire) === 'danger') alerts.push({ type: 'danger', msg: `🔴 EXPIRED: ${p.name}!` });
    });
    return alerts;
  });

  public weightedProducts = computed(() => {
    const prods = this.salesService.products() || [];
    return prods.filter(p => p && p.isActive !== false && (p.isWeighted === true || String(p.isWeighted) === 'true'));
  });
  
  public looseProducts = computed(() => {
    const prods = this.salesService.products() || [];
    return prods.filter(p => p && p.isActive !== false && !p.barcode && p.isWeighted !== true && String(p.isWeighted) !== 'true');
  });

  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categoryId = this.selectedCategoryId();
    const allProds = this.salesService.products() || [];
    let products = allProds.filter(p => p && p.isActive !== false);

    if (categoryId !== 'ALL') products = products.filter(p => p.categoryId === categoryId);

    if (query) {
      products = products.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.id && p.id.toString().toLowerCase().includes(query))
      );
    }

    let currentCat = '';
    return products.map(p => {
      const mapped = { ...p, isFirstOfCategory: false, displayCategoryName: '' };
      const pCat = p.categoryId || 'Unassigned';
      if (pCat !== currentCat) {
        mapped.isFirstOfCategory = true;
        mapped.displayCategoryName = this.salesService.getCategoryName(pCat);
        currentCat = pCat;
      }
      return mapped;
    });
  });

  constructor() {
    effect(() => {
      const trigger = this.salesService.focusSearchTrigger();
      if (trigger > 0 && !this.salesService.activeModal() && !this.editingProduct() && this.searchInput?.nativeElement) {
        setTimeout(() => {
          this.searchQuery.set('');
          this.searchInput.nativeElement.value = '';
          this.searchInput.nativeElement.focus();
        }, 50);
      }
    });

    effect(() => {
      const bsk = this.salesService.basket() || [];
      if (bsk.length === 0) {
        this.isMobileBasketOpen.set(false);
        setTimeout(() => {
          this.searchQuery.set('');
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.value = '';
            this.searchInput.nativeElement.focus();
          }
        }, 50);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() {}

  ngAfterViewInit() {
    setTimeout(() => { if (this.searchInput?.nativeElement) this.searchInput.nativeElement.focus(); }, 100);
  }

  public getExpireStatus(expire?: string): 'safe' | 'warning' | 'danger' | 'none' {
    if (!expire) return 'none';
    const expDate = new Date(expire + 'T00:00:00');
    if (isNaN(expDate.getTime())) return 'none'; 
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'danger'; 
    if (diffDays <= 14) return 'warning'; 
    return 'safe'; 
  }

  public openQuickEdit(prod: Product, event: Event): void {
    event.stopPropagation();
    if (this.salesService.currentRole() !== 'admin') {
      this.salesService.activeModal.set({ type: 'warning', title: '⛔ Access Denied', message: 'Only Store Admins can edit product details from the register.', value: '', onConfirm: () => this.salesService.closeModal() });
      return;
    }
    this.editingProduct.set(prod);
    this.editForm = { ...prod };
  }

  public closeQuickEdit(): void {
    this.editingProduct.set(null);
    this.salesService.triggerSearchFocus();
  }

  public saveQuickEdit(): void {
    if (!this.editForm.name || !this.editForm.price || !this.editForm.id) return;
    this.salesService.saveProduct(this.editForm.id, this.editForm as Product);
    this.closeQuickEdit();
  }

  public onSearchEnter(query: string): void {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    const wasBarcode = this.salesService.scanBarcodeExact(cleanQuery);
    
    if (wasBarcode) {
      this.searchQuery.set('');
      if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';
    } else {
      const isNumericBarcode = /^\d{7,14}$/.test(cleanQuery);
      const isUrl = cleanQuery.toLowerCase().startsWith('http') || cleanQuery.toLowerCase().startsWith('www');
      const isLongQrHash = cleanQuery.length > 15 && !cleanQuery.includes(' ');

      if (isNumericBarcode || isUrl || isLongQrHash) {
        this.searchQuery.set('');
        if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';
        
        let msg = `The barcode [ ${cleanQuery} ] is not in your inventory.`;
        if (isUrl || isLongQrHash) msg = "⚠️ QR CODE DETECTED ⚠️\n\nYou accidentally scanned a QR code instead of the product barcode! Please aim the scanner at the striped retail barcode.";

        this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Scan Failed', message: msg, value: '', onConfirm: () => {} });
        setTimeout(() => {
          if (this.salesService.activeModal()?.title === '⚠️ Scan Failed') {
            this.salesService.closeModal();
            setTimeout(() => this.salesService.triggerSearchFocus(), 50);
          }
        }, 2000);
      }
    }
  }

  public onLogout(): void {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }

  public handleProductClick(prod: Product): void {
    this.searchQuery.set('');
    if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';

    const isScaled = prod.isWeighted === true || String(prod.isWeighted).toLowerCase() === 'true';
    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt', title: '⚖️ Scale Weight (kg)', message: `Enter the measured weight for ${prod.name}:`, value: '1.000',
        onConfirm: (val) => {
          const weight = this.parseSafe(val);
          if (weight > 0) this.salesService.addToBasket(prod, undefined, weight);
          this.salesService.closeModal();
          setTimeout(() => this.salesService.triggerSearchFocus(), 100);
        }
      });
    } else {
      this.salesService.addToBasket(prod);
    }
  }
}