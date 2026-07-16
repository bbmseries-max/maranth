import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; 
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';

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
export class PosComponent implements OnInit {
  public salesService = inject(SalesService);
  public router = inject(Router);

  public searchQuery = signal<string>('');
  public selectedCategoryId = signal<string>('ALL');

  public showWeightedShelf = signal<boolean>(false);
  public showLooseShelf = signal<boolean>(false);
  public isSidebarMobileOpen = signal<boolean>(false); // ⭐ Tracks if mobile menu is open
  public isMobileBasketOpen = signal<boolean>(false); // ⭐ NEW: Tracks if the checkout drawer


  // ⭐ NEW: 3-Hour Profit Snapshot Calculator
  public dailyProfitSnapshots = computed(() => {
    const today = new Date().toDateString();
    
    // Create the 3-hour time buckets
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

    // Crunch the numbers for today's transactions
    this.salesService.transactions().forEach(tx => {
      const txDate = new Date(tx.timestamp);
      
      if (txDate.toDateString() === today) {
        let txProfit = 0;
        
        tx.items.forEach(item => {
          const retail = item.product.price || 0;
          const cost = item.product.purchasePrice || 0;
          const tax = item.product.taxRate || 1.24; // Default to 24% VAT if missing
          
          const grossWholesale = cost * tax;
          const itemProfit = (retail - grossWholesale) * item.quantity;
          
          // Deduct profit if it was a refund!
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

    // Always show the current time bucket, even if it's empty
    if (currentBucketIndex >= 0 && currentBucketIndex < 8) {
        buckets[currentBucketIndex].active = true;
    }

    return {
      buckets: buckets.filter(b => b.active),
      total: totalDayProfit
    };
  });

constructor() {
    // ⭐ NEW: Auto-close the mobile basket drawer if it empties (e.g. after successful payment!)
    effect(() => {
      if (this.salesService.basket().length === 0) {
        this.isMobileBasketOpen.set(false);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit() {}



  public weightedProducts = computed(() => {
    return this.salesService.products().filter(p => (p.isWeighted === true || String(p.isWeighted).toLowerCase() === 'true') && p.isActive !== false);
  });

  public looseProducts = computed(() => {
    return this.salesService.products().filter(p => !p.barcode && p.isActive !== false);
  });

  public filteredCatalogProducts = computed(() => {
    let items = this.salesService.products().filter(p => p.isActive !== false);
    
    if (this.selectedCategoryId() !== 'ALL') {
      items = items.filter(p => p.categoryId === this.selectedCategoryId());
    }

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.id && p.id.toString().toLowerCase().includes(query))
      );
    }

    return items.map((p, index) => {
       const displayCategoryName = this.salesService.getCategoryName(p.categoryId);
       const isFirstOfCategory = index === 0 || items[index - 1].categoryId !== p.categoryId;
       return { ...p, displayCategoryName, isFirstOfCategory };
    });
  });

  public onSearchSubmit(query: string) {
    this.salesService.lookupAndScanBarcode(query);
  }

  // ⭐ BULLETPROOF WEIGHT CHECK: Catches Firebase String or Boolean!
  public handleProductClick(product: Product) {
    const isScaled = product.isWeighted === true || String(product.isWeighted).toLowerCase() === 'true';

    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt',
        title: '⚖️ Scale Weight (kg)',
        message: `Please enter the exact weight for ${product.name}:`,
        value: '1.000',
        onConfirm: (val) => {
          const weight = parseFloat(val);
          if (!isNaN(weight) && weight > 0) {
            this.salesService.addToBasket(product, undefined, weight);
          }
          this.salesService.closeModal();
        }
      });
    } else {
      this.salesService.addToBasket(product);
    }
  }

  public onLogout() {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }
}