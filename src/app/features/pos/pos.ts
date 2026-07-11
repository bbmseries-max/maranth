import { Component, inject, OnInit, computed, signal } from '@angular/core'; // 🚀 Added signal
import { CommonModule, CurrencyPipe } from '@angular/common'; 
import { SalesService } from '../../shared/services/sales'; 
import { Product } from '../../shared/services/pos-data.models';
import { FormsModule } from '@angular/forms';
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
    ShoppingBasketComponent,
    FormsModule
  ],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements OnInit {
  public salesService = inject(SalesService);

  // 🚀 Track typed search queries or fallback scans
  public searchQuery = signal<string>('');

  public showModal = signal<boolean>(false);
  public modalType = signal<'warning' | 'prompt'>('warning');
  public modalTitle = signal<string>('');
  public modalMessage = signal<string>('');
  public modalInputValue = signal<string>('');

  // Storage for the action to execute when "Confirm" is clicked
  private modalConfirmCallback: ((value?: string) => void) | null = null;

  // 1. Existing flat list catalog grouping logic (unchanged structural behavior)
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

      if (!categoryName) {
        switch (cleanId) {
          case '5605': categoryName = 'Shkolla - Lojra'; break;
          case '5619': categoryName = 'Xartika kouzinas - Banjo'; break;
          case '5614': categoryName = 'Freska Fruta'; break;
          case '5613': categoryName = 'Freska laxanika'; break;
          case '5636': categoryName = 'Karta ananeosis'; break;
          case '5606': categoryName = 'Caj zesto - Rofimata'; break;
          case '5609': categoryName = 'Cikles - Karameles'; break;
          case '5622': categoryName = 'Idi kapnistou -Pipes - Anaptires'; break;
          case '5627': categoryName = 'Zootrofes - Axesuar katikidion'; break;
          case '5635': categoryName = 'Veze'; break;
          default: categoryName = cleanId ? `Category ${cleanId}` : 'General Items'; break;
        }
      }
      
      return {
        ...product,
        id: product.id,
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        categoryId: product.categoryId,
        isWeighted: product.isWeighted,
        get stockQuantity() { return product.stockQuantity; },
        displayCategoryName: categoryName,
        isFirstOfCategory: false
      } as OrderableProduct;
    });

    items.sort((a, b) => a.displayCategoryName.localeCompare(b.displayCategoryName));
    return items;
  });

  // 🚀 Updated: Filters against ALL products when searching by name, or falls back to loose items catalog
  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    let baseItems: OrderableProduct[] = [];

    if (query !== '') {
      // 🔍 1. If searching, look through EVERY product in the store database!
      const matchedSourceProducts = this.salesService.products().filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.id.toString().includes(query) ||
        p.barcode?.toString().includes(query)
      );

      baseItems = matchedSourceProducts.map(product => {
        const prodCatId = product.categoryId || (product as any).category_id;
        const cleanId = prodCatId?.toString().trim();
        
        // Lookup category name for dynamic group line headers
        const matchedCat = this.salesService.categories().find(c => 
          (c.id || (c as any).category_id)?.toString().trim() === cleanId
        );
        let categoryName = matchedCat ? matchedCat.name : '';
        if (!categoryName) {
          switch (cleanId) {
            case '5605': categoryName = 'Shkolla - Lojra'; break;
            case '5619': categoryName = 'Xartika kouzinas - Banjo'; break;
            case '5614': categoryName = 'Freska Fruta'; break;
            case '5613': categoryName = 'Freska laxanika'; break;
            case '5636': categoryName = 'Karta ananeosis'; break;
            case '5606': categoryName = 'Caj zesto - Rofimata'; break;
            case '5609': categoryName = 'Cikles - Karameles'; break;
            case '5622': categoryName = 'Idi kapnistou -Pipes - Anaptires'; break;
            case '5627': categoryName = 'Zootrofes - Axesuar katikidion'; break;
            case '5635': categoryName = 'Veze'; break;
            default: categoryName = cleanId ? `Category ${cleanId}` : 'Search Matches'; break;
          }
        }

        return {
          ...product,
          displayCategoryName: categoryName,
          isFirstOfCategory: false,
          get stockQuantity() { return product.stockQuantity; }
        } as OrderableProduct;
      });

    } else {
      // 📁 2. If search input is blank, show the standard loose products catalog as usual
      baseItems = this.sequentialCatalogProducts();
    }

    // Sort alphabetically by the category grouping lines
    baseItems.sort((a, b) => a.displayCategoryName.localeCompare(b.displayCategoryName));

    // Recalculate dynamic divider split lines cleanly
    let currentCategorySeen = '';
    const finalItems = baseItems.map(item => ({ ...item, isFirstOfCategory: false }));
    
    finalItems.forEach(item => {
      if (item.displayCategoryName !== currentCategorySeen) {
        item.isFirstOfCategory = true;
        currentCategorySeen = item.displayCategoryName;
      }
    });

    return finalItems;
  });

  ngOnInit(): void {
    if (this.salesService.products().length === 0) {
      this.salesService.loadStoreInventory().subscribe(res => {
        this.salesService.products.set(res.products);
        this.salesService.categories.set(res.categories);
        this.salesService.suppliers.set(res.suppliers);
      });
    }
  }

  public handleProductClick(product: Product): void {
    this.salesService.addToBasket(product);
  }

  // 🚀 3. Handle barcode scanner vs text lookups
  public onSearchSubmit(value: string): void {
    const cleanValue = value.trim();
    if (!cleanValue) return;

    // Is it a barcode scan or ID direct match? Try looking it up first
    const wasScanned = this.salesService.lookupAndScanBarcode(cleanValue);

    if (wasScanned) {
      this.searchQuery.set(''); // Clear search grid filter if item successfully flies into basket
    } else {
      // If it's not a direct barcode match, filter the grid view for the text input phrase instead
      this.searchQuery.set(cleanValue);
    }
  }
// Custom controller to open our sleek modal instead of native popups
  public openPosModal(
    type: 'warning' | 'prompt', 
    title: string, 
    message: string, 
    defaultValue = '',
    onConfirm?: (value?: string) => void
  ) {
    this.modalType.set(type);
    this.modalTitle.set(title);
    this.modalMessage.set(message);
    this.modalInputValue.set(defaultValue);
    this.modalConfirmCallback = onConfirm || null;
    
    // Open modal with a tiny delay to allow the CSS transition animation trigger
    this.showModal.set(true);
  }

  public handleModalConfirm() {
    if (this.modalConfirmCallback) {
      if (this.modalType() === 'prompt') {
        this.modalConfirmCallback(this.modalInputValue());
      } else {
        this.modalConfirmCallback();
      }
    }
    this.closePosModal();
  }

  public closePosModal() {
    this.showModal.set(false);
    this.modalConfirmCallback = null;
  }


}