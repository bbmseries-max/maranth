import { Component, OnInit, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';
import { doc, setDoc } from 'firebase/firestore';

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
  // ⭐ UNIFIED CASH TRACKER (Reads from shared Firebase cashLogs)
  // ========================================================
  public liveCashInDrawer = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Today's Cash Sales
    let todaysCashSales = 0;
    this.salesService.transactions().forEach(tx => {
      const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
      if (txDate === today && tx.paymentMethod === 'Cash') {
        todaysCashSales += (tx.grandTotal || 0);
      }
    });

    // 2. Today's Manual Adjustments / Cash Drops
    let manualAdjustments = 0;
    this.salesService.cashLogs().forEach(log => {
      const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
      if (logDate === today) {
        if (log.type === 'IN') manualAdjustments += log.amount;
        if (log.type === 'OUT') manualAdjustments -= log.amount;
      }
    });

    const rawTotal = todaysCashSales + manualAdjustments;
    return Math.round(rawTotal * 100) / 100;
  });

  public addManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '💵 Add Cash to Drawer', message: 'Enter the amount of cash added (Starting float or top-up):', value: '',
      onConfirm: (val) => {
        const amount = parseFloat(val) || 0;
        if (amount > 0) {
          const log = {
            id: 'CASH-' + Date.now(),
            type: 'IN',
            amount: Math.round(amount * 100) / 100,
            reason: 'Starting Float / Top-up',
            timestamp: new Date().toISOString()
          };
          this.salesService.cashLogs.update(logs => [...logs, log]);
          if (this.salesService.db) {
            setDoc(doc(this.salesService.db, 'cashLogs', log.id), log);
          }
        }
        this.salesService.closeModal();
      }
    });
  }

  public removeManualCash(): void {
    this.salesService.activeModal.set({
      type: 'prompt', title: '📤 Cash Payout', message: 'Enter payout amount removed from drawer:', value: '',
      onConfirm: (val) => {
        const amount = parseFloat(val) || 0;
        if (amount > 0) {
          const log = {
            id: 'CASH-' + Date.now(),
            type: 'OUT',
            amount: Math.round(amount * 100) / 100,
            reason: 'Supplier Payout / Cash Drop',
            timestamp: new Date().toISOString()
          };
          this.salesService.cashLogs.update(logs => [...logs, log]);
          if (this.salesService.db) {
            setDoc(doc(this.salesService.db, 'cashLogs', log.id), log);
          }
        }
        this.salesService.closeModal();
      }
    });
  }

  public resetDrawer(): void {
    const currentCash = this.liveCashInDrawer();
    this.salesService.activeModal.set({
      type: 'warning', title: '⚠️ Close Shift & Reset Drawer', message: `Reset cash drawer balance from €${currentCash.toFixed(2)} to €0.00?`, value: '',
      onConfirm: () => {
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
        this.salesService.closeModal();
      }
    });
  }

  // ========================================================
  // ⭐ QUICK MISC CHARGE LOGIC
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
  // ⭐ CATALOG & FILTERING COMPUTEDS
  // ========================================================
  public salesTarget = 1000; 
  
  public targetProgress = computed(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayRev = this.salesService.transactions()
      .filter(tx => new Date(tx.timestamp).toISOString().split('T')[0] === today)
      .reduce((sum, tx) => sum + (tx.grandTotal || 0), 0);
    
    const safeRev = todayRev || 0;
    const percent = Math.min(100, (safeRev / this.salesTarget) * 100) || 0;
    
    return { rev: safeRev, percent: percent };
  });

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
        (p.id && p.id.toString().toLowerCase().includes(query)) ||
        (p.altBarcodes && p.altBarcodes.some(alt => alt.toLowerCase().includes(query)))
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
      if (this.salesService.basket().length === 0) {
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

  public handleProductClick(prod: Product): void {
    this.searchQuery.set('');
    if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';

    const isScaled = prod.isWeighted === true || String(prod.isWeighted).toLowerCase() === 'true';
    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt', title: '⚖️ Scale Weight (kg)', message: `Enter the measured weight for ${prod.name}:`, value: '1.000',
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

  public onLogout(): void {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }
}