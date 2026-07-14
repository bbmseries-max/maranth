import { Component, OnInit, inject, signal, computed } from '@angular/core';
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

  ngOnInit() {}

  // ⭐ QUICK ACCESS SHELF 1: Scaled/Weighted items
  public weightedProducts = computed(() => {
    return this.salesService.products().filter(p => p.isWeighted && p.isActive !== false);
  });

  // ⭐ QUICK ACCESS SHELF 2: Loose items (No barcode)
  public looseProducts = computed(() => {
    return this.salesService.products().filter(p => !p.barcode && !p.isWeighted && p.isActive !== false);
  });

  // 📦 Main Catalog Filter logic
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

    // Map the display category name and inject dividers
    return items.map((p, index) => {
       const displayCategoryName = this.salesService.getCategoryName(p.categoryId);
       const isFirstOfCategory = index === 0 || items[index - 1].categoryId !== p.categoryId;
       return { ...p, displayCategoryName, isFirstOfCategory };
    });
  });

  public onSearchSubmit(query: string) {
    this.salesService.lookupAndScanBarcode(query);
  }

  public handleProductClick(product: Product) {
    this.salesService.addToBasket(product);
  }

  public onLogout() {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }
}