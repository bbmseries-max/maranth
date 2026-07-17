import { Component, OnInit, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, DatePipe, ShoppingBasketComponent],
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
  // ⭐ NEW 1: LIVE CASH TRACKER LOGIC
  // ========================================================
  public startingFloat = signal<number>(Number(localStorage.getItem('maranth_float') || 0));
  public supplierPayouts = signal<number>(Number(localStorage.getItem('maranth_payouts') || 0));
  
  public liveCashInDrawer = computed(() => {
    // Expected Cash = Starting Float + Today's Cash Sales - Payouts
    const today = new Date().toDateString();
    let todaysCashSales = 0;
    
    this.salesService.transactions().forEach(tx => {
      const txDate = new Date(tx.timestamp);
      if (txDate.toDateString() === today && tx.paymentMethod === 'Cash') {
        todaysCashSales += tx.grandTotal;
      }
    });

    return this.startingFloat() + todaysCashSales - this.supplierPayouts();
  });

  public setFloatAmount(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '💵 Declare Starting Cash', message: 'Enter the morning cash float amount:', value: this.startingFloat().toString(),
      onConfirm: (val) => {
        const amount = parseFloat(val) || 0;
        this.startingFloat.set(amount);
        localStorage.setItem('maranth_float', amount.toString());
        this.salesService.closeModal();
      }
    });
  }

  public paySupplier(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '🚚 Pay Supplier (Cash)', message: 'Enter the cash amount removed from drawer to pay a supplier:', value: '',
      onConfirm: (val) => {
        const amount = parseFloat(val) || 0;
        const newTotal = this.supplierPayouts() + amount;
        this.supplierPayouts.set(newTotal);
        localStorage.setItem('maranth_payouts', newTotal.toString());
        this.salesService.closeModal();
      }
    });
  }

  public resetDrawer(): void {
    this.salesService.activeModal.set({
      type: 'warning', title: '⚠️ Close Shift / Reset Drawer', message: 'Are you sure you want to reset the Cash Float and Supplier Payouts back to zero?', value: '',
      onConfirm: () => {
        this.startingFloat.set(0);
        this.supplierPayouts.set(0);
        localStorage.setItem('maranth_float', '0');
        localStorage.setItem('maranth_payouts', '0');
        this.salesService.closeModal();
      }
    });
  }

  // ========================================================
  // ⭐ NEW 2: QUICK MISC CHARGE LOGIC
  // ========================================================
  public miscAmount = signal<string>('');

  public addMiscCharge(): void {
    const val = parseFloat(this.miscAmount());
    if (isNaN(val) || val <= 0) return;

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
  // ⭐ NEW 3 & 4: SALES TARGET & SYSTEM ALERTS
  // ========================================================
  public salesTarget = 1000; // Example daily goal: €1000
  
  public targetProgress = computed(() => {
    const today = new Date().toDateString();
    const todayRev = this.salesService.transactions()
      .filter(tx => new Date(tx.timestamp).toDateString() === today)
      .reduce((sum, tx) => sum + tx.grandTotal, 0);
    return { rev: todayRev, percent: Math.min(100, (todayRev / this.salesTarget) * 100) };
  });

  public systemAlerts = computed(() => {
    const alerts: { type: string, msg: string }[] = [];
    this.salesService.products().forEach(p => {
      if (p.stockQuantity <= (p.minStockWarning || 5)) alerts.push({ type: 'warning', msg: `Low Stock: ${p.name} (${p.stockQuantity} left)` });
      if (this.getExpireStatus(p.expire) === 'danger') alerts.push({ type: 'danger', msg: `🔴 EXPIRED: ${p.name}!` });
    });
    return alerts;
  });
  // ========================================================

  public weightedProducts = computed(() => this.salesService.products().filter(p => p.isActive !== false && (p.isWeighted === true || String(p.isWeighted) === 'true')));
  public looseProducts = computed(() => this.salesService.products().filter(p => p.isActive !== false && !p.barcode && p.isWeighted !== true && String(p.isWeighted) !== 'true'));

  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categoryId = this.selectedCategoryId();
    let products = this.salesService.products().filter(p => p.isActive !== false);

    if (categoryId !== 'ALL') products = products.filter(p => p.categoryId === categoryId);

    if (query) {
      products = products.filter(p => 
        p.name.toLowerCase().includes(query) || 
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
      if (this.salesService.basket().length === 0) this.isMobileBasketOpen.set(false);
    }, { allowSignalWrites: true });
  }

  ngOnInit() {}

  ngAfterViewInit() {
    setTimeout(() => { if (this.searchInput?.nativeElement) this.searchInput.nativeElement.focus(); }, 100);
  }

  public getExpireStatus(expire?: string): 'safe' | 'warning' | 'danger' | 'none' {
    if (!expire) return 'none';
    const expDate = new Date(expire + 'T00:00:00');
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
        type: 'prompt',
        title: '⚖️ Scale Weight (kg)',
        message: `Enter the measured weight for ${prod.name}:`,
        value: '1.000',
        onConfirm: (val) => {
          const weight = parseFloat(val);
          if (!isNaN(weight) && weight > 0) this.salesService.addToBasket(prod, undefined, weight);
          this.salesService.closeModal();
          setTimeout(() => this.salesService.triggerSearchFocus(), 100);
        }
      });
    } else {
      this.salesService.addToBasket(prod);
    }
  }
}