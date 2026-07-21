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

  public getPinnedProducts(): Product[] {
  // Grab the array from your Signal
  const allProducts = this.salesService.products();
  if (!allProducts || allProducts.length === 0) return [];
  
  return allProducts
    .filter(p => p.isPinned === true && p.isActive !== false) // Only active, pinned items
    .slice(0, 14); // 👈 Forces it to never show more than 14
}

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
      // Read the signal so the effect knows to track it
      const triggerTick = this.salesService.focusSearchTrigger();
      
      if (triggerTick > 0) {
        // We use a tiny 50ms timeout to ensure Angular has finished updating 
        // the DOM (like opening a modal or clearing the basket) before we steal focus.
        setTimeout(() => {
          if (this.searchInput && this.searchInput.nativeElement) {
            this.searchInput.nativeElement.focus();
            
            // Optional but recommended for barcode scanners: 
            // Highlight the text so the next scan instantly overwrites it
            this.searchInput.nativeElement.select(); 
          }
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

public onSearchEnter(event?: Event): void {
    // 🛡️ Safety net: Stops the "Enter" key from accidentally causing a browser reload
    if (event) event.preventDefault();

    const cleanQuery = this.searchQuery().trim();
    if (!cleanQuery) return;

    // This handles adding the exact barcode to the basket if it finds it
    const wasBarcode = this.salesService.scanBarcodeExact(cleanQuery);
    
    if (wasBarcode) {
      // ✅ SUCCESSFUL SCAN: 
      // Clear the search box instantly so the scanner is ready for the next physical scan!
      this.searchQuery.set('');
    } else {
      // ❌ NOT FOUND:
      // Only fire the error popup if it WAS NOT a recognized barcode, 
      // AND it looks like a barcode (just numbers)
      const isNumericBarcode = /^\d{4,20}$/.test(cleanQuery);
      
      if (isNumericBarcode) {
        this.salesService.activeModal.set({ 
          type: 'warning', 
          title: '⚠️ Not Found', 
          message: `The barcode [ ${cleanQuery} ] is not registered in your inventory.`, 
          value: '', 
          onConfirm: () => {
             this.salesService.closeModal();
             // Clear the bad barcode so they don't get stuck
             this.searchQuery.set('');
             this.salesService.triggerSearchFocus();
          } 
        });
      }
      // If it wasn't a barcode (e.g., they typed "Lays" and hit Enter),
      // we do NOTHING. The text stays in the box, and the list stays open!
    }
  }

  public onLogout(): void {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }

public handleProductClick(prod: Product): void {
    // 🚫 REMOVED: this.searchQuery.set(''); 
    // Now your search list will stay exactly where it is!

    const isScaled = prod.isWeighted === true || String(prod.isWeighted).toLowerCase() === 'true';
    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt', 
        title: '⚖️ Scale Weight (kg)', 
        message: `Enter the measured weight for ${prod.name}:`, 
        value: '1.000',
        onConfirm: (val) => {
          // ⭐ FIX 1: Safely swap Greek commas to dots so math doesn't fail
          const safeVal = String(val).replace(',', '.');
          const weight = parseFloat(safeVal);
          
          if (!isNaN(weight) && weight > 0) {
            // ⭐ FIX 2: Put 'undefined' back in the 2nd slot to satisfy TypeScript
            this.salesService.addToBasket(prod, undefined, weight); 
          }
          
          this.salesService.closeModal();
          setTimeout(() => this.salesService.triggerSearchFocus(), 100);
        }
      });
    } else {
      this.salesService.addToBasket(prod);
      
      // ⭐ Keeps the cursor in the search box after you click, so you can keep typing or scanning!
      this.salesService.triggerSearchFocus(); 
    }
  }
}