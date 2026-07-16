import { Component, OnInit, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, ShoppingBasketComponent],
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

  public dailyProfitSnapshots = computed(() => {
    const today = new Date().toDateString();
    const buckets = [
      { label: '00:00 - 03:00', profit: 0, active: false },
      { label: '03:00 - 06:00', profit: 0, active: false },
      { label: '06:00 - 09:00', profit: 0, active: false },
      { label: '09:00 - 12:00', profit: 0, active: false },
      { label: '12:00 - 15:00', profit: 0, active: false },
      { label: '15:00 - 18:00', profit: 0, active: false },
      { label: '18:00 - 21:00', profit: 0, active: false },
      { label: '21:00 - 00:00', profit: 0, active: false }
    ];

    let totalDayProfit = 0;
    const currentHour = new Date().getHours();
    const currentBucketIndex = Math.floor(currentHour / 3);

    this.salesService.transactions().forEach(tx => {
      const txDate = new Date(tx.timestamp);
      if (txDate.toDateString() === today) {
        let txProfit = 0;
        tx.items.forEach(item => {
          const retail = item.product.price || 0;
          const cost = item.product.purchasePrice || 0;
          const tax = item.product.taxRate || 1.24; 
          const grossWholesale = cost * tax;
          const itemProfit = (retail - grossWholesale) * item.quantity;
          txProfit += item.isRefund ? -itemProfit : itemProfit;
        });
        const hour = txDate.getHours();
        const bucketIndex = Math.floor(hour / 3);
        if (bucketIndex >= 0 && bucketIndex < 8) {
           buckets[bucketIndex].profit += txProfit;
           buckets[bucketIndex].active = true;
        }
        totalDayProfit += txProfit;
      }
    });

    if (currentBucketIndex >= 0 && currentBucketIndex < 8) {
        buckets[currentBucketIndex].active = true;
    }

    return {
      buckets: buckets.filter(b => b.active),
      total: totalDayProfit
    };
  });

  public weightedProducts = computed(() => {
    return this.salesService.products().filter(p => p.isActive !== false && (p.isWeighted === true || String(p.isWeighted) === 'true'));
  });

  public looseProducts = computed(() => {
    return this.salesService.products().filter(p => p.isActive !== false && !p.barcode && p.isWeighted !== true && String(p.isWeighted) !== 'true');
  });

  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categoryId = this.selectedCategoryId();
    let products = this.salesService.products().filter(p => p.isActive !== false);

    if (categoryId !== 'ALL') {
      products = products.filter(p => p.categoryId === categoryId);
    }

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
      if (trigger > 0 && !this.salesService.activeModal() && this.searchInput?.nativeElement) {
        setTimeout(() => {
          this.searchInput.nativeElement.focus();
        }, 50);
      }
    });

    effect(() => {
      if (this.salesService.basket().length === 0) {
        this.isMobileBasketOpen.set(false);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() {}

  ngAfterViewInit() {
    setTimeout(() => {
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  public onSearchEnter(query: string): void {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    const wasBarcode = this.salesService.scanBarcodeExact(cleanQuery);
    
    if (wasBarcode) {
      this.searchQuery.set('');
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.value = '';
      }
    } else {
      const isNumericBarcode = /^\d{7,14}$/.test(cleanQuery);
      const isUrl = cleanQuery.toLowerCase().startsWith('http') || cleanQuery.toLowerCase().startsWith('www');
      const isLongQrHash = cleanQuery.length > 15 && !cleanQuery.includes(' ');

      if (isNumericBarcode || isUrl || isLongQrHash) {
        this.searchQuery.set('');
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.value = '';
        }
        
        let msg = `The barcode [ ${cleanQuery} ] is not in your inventory.`;
        if (isUrl || isLongQrHash) {
          msg = "⚠️ QR CODE DETECTED ⚠️\n\nYou accidentally scanned a QR code instead of the product barcode! Please aim the scanner at the striped retail barcode.";
        }

        this.salesService.activeModal.set({
           type: 'warning',
           title: '⚠️ Scan Failed',
           message: msg,
           value: '',
           onConfirm: () => {} // Handled by auto-timeout below
        });

        // ⭐ THE FIX: Self-destruct the modal after 1000ms (1 second) and instantly grab focus!
        setTimeout(() => {
          if (this.salesService.activeModal()?.title === '⚠️ Scan Failed') {
            this.salesService.closeModal();
            setTimeout(() => this.salesService.triggerSearchFocus(), 50);
          }
        }, 1000);
      }
    }
  }

  public onLogout(): void {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }

  public handleProductClick(prod: Product): void {
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