import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; 
import { SalesService } from '../../shared/services/sales'; 
import { Product } from '../../shared/services/pos-data.models';
import { RouterLink } from '@angular/router';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket'; 

interface OrderableProduct extends Product {
  displayCategoryName: string;
  isFirstOfCategory: boolean;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule, 
    CurrencyPipe,              
    RouterLink,
    ShoppingBasketComponent   
  ],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements OnInit {
  public salesService = inject(SalesService);

  // 🚀 1. Builds the flat, category-sequenced list of loose items
  public sequentialCatalogProducts = computed(() => {
    const looseItems = this.salesService.products().filter(p => {
      return !p.barcode || p.barcode.toString().trim() === '';
    });

    const items: OrderableProduct[] = looseItems.map(product => {
      const prodCatId = product.categoryId || (product as any).category_id;
      const cleanId = prodCatId?.toString().trim();

      const matchedCat = this.salesService.categories().find(c => {
        const catId = c.id || (c as any).category_id;
        return catId?.toString().trim() === cleanId;
      });
      let categoryName = matchedCat ? matchedCat.name : '';

      // 📝 2. MANUAL DICTIONARY OVERRIDES (Hides the raw IDs and replaces them perfectly!)
      if (!categoryName) {
        switch (cleanId) {
          case '5605':
            categoryName = 'Shkolla - Lojra';
            break;
          case '5619':
            categoryName = 'Xartika kouzinas - Banjo';
            break;
          case '5614':
            categoryName = 'Freska Fruta';
            break;
          case '5613':
            categoryName = 'Freska laxanika';
            break;
          case '5636':
            categoryName = 'Karta ananeosis';
            break;
          case '5606':
            categoryName = 'Caj zesto - Rofimata';
            break;
          case '5609':
            categoryName = 'Cikles - Karameles';
            break;
            case '5622':
            categoryName = 'Idi kapnistou -Pipes - Anaptires';
            break;
          case '5627':
            categoryName = 'Zootrofes - Axesuar katikidion';
            break;
          case '5635':
            categoryName = 'Veze';
            break;
          default:
            categoryName = cleanId ? `Category ${cleanId}` : 'General Items';
            break;
        }
      }
      
      // Change this inside your items.map block:
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        categoryId: product.categoryId,
        // Bind the active, changing properties through a direct getter property!
        get stockQuantity() { return product.stockQuantity; },
        displayCategoryName: categoryName,
        isFirstOfCategory: false
      } as OrderableProduct;
    });

    items.sort((a, b) => a.displayCategoryName.localeCompare(b.displayCategoryName));

    let currentCategorySeen = '';
    items.forEach(item => {
      if (item.displayCategoryName !== currentCategorySeen) {
        item.isFirstOfCategory = true;
        currentCategorySeen = item.displayCategoryName;
      }
    });

    return items;
  });

  // 🚀 2. OnInit lifecycle hook
  ngOnInit(): void {
    if (this.salesService.products().length === 0) {
      this.salesService.loadStoreInventory().subscribe(res => {
        this.salesService.products.set(res.products);
        this.salesService.categories.set(res.categories);
        this.salesService.suppliers.set(res.suppliers);
      });
    }
  }

  // 🚀 3. Click handler (This resolves the ngtsc(2339) error!)
  public handleProductClick(product: Product): void {
    this.salesService.addToBasket(product);
  }
}