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

  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    if (isNaN(parsed)) return '€0.00';
    return '€' + parsed.toFixed(2);
  }

  // Quick Misc Charge kept here as it's needed for the register
  public miscAmount = signal<string>('');
  public addMiscCharge(): void {
    const val = Number(this.miscAmount());
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

  public onSearchEnter(): void {
    const cleanQuery = this.searchQuery().trim();
    if (!cleanQuery) return;

    const wasBarcode = this.salesService.scanBarcodeExact(cleanQuery);
    
    if (wasBarcode) {
      this.searchQuery.set('');
    } else {
      const isNumericBarcode = /^\d{4,20}$/.test(cleanQuery);
      if (isNumericBarcode) {
        this.searchQuery.set('');
        this.salesService.activeModal.set({ 
          type: 'warning', 
          title: '⚠️ Not Found', 
          message: `The barcode [ ${cleanQuery} ] is not registered in your inventory.`, 
          value: '', 
          onConfirm: () => this.salesService.closeModal() 
        });
        setTimeout(() => {
          if (this.salesService.activeModal()?.title === '⚠️ Not Found') {
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

    const isScaled = prod.isWeighted === true || String(prod.isWeighted).toLowerCase() === 'true';
    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt', title: '⚖️ Scale Weight (kg)', message: `Enter the measured weight for ${prod.name}:`, value: '1.000',
        onConfirm: (val) => {
          const weight = Number(val);
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