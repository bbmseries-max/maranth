import { Injectable, inject, signal, computed } from '@angular/core'; 
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category, SupplierJsonData, ProductJsonData, Supplier, Product } from './pos-data.models';

export interface BasketItem {
  product: Product;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private http = inject(HttpClient);

  private categoriesUrl = 'assets/data/categories.json';
  private suppliersUrl = 'assets/data/companies.json'; 
  private productsUrl = 'assets/data/products.json';

  public basket = signal<BasketItem[]>([]);
  public currentCategory = signal<string>('ALL');

  // 📦 Cache the master list so the barcode lookup can find elements rapidly
  private cachedProducts: Product[] = [];

  public subtotal = computed(() => {
    return this.basket().reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  });

  public totalItems = computed(() => {
    return this.basket().reduce((acc, item) => acc + item.quantity, 0);
  });

  // 2. Grand Total (Sum of all item prices * quantities - what the customer pays)
  public grandTotal = computed(() => {
    return this.basket().reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  });

  // 3. Extract the 24% VAT amount from the grand total
  public taxAmount = computed(() => {
    return this.grandTotal() - (this.grandTotal() / 1.24);
  });

  // 4. Net Price (The baseline price before tax is extracted)
  public netSubtotal = computed(() => {
    return this.grandTotal() - this.taxAmount();
  });

  public selectCategory(id: string): void {
    this.currentCategory.set(id);
    console.log(`Switched category view to ID: ${id}`);
  }

  /**
   * Fetches data assets concurrently and normalizes everything safely into flat lists
   */
  public loadStoreInventory(): Observable<{ categories: Category[], suppliers: Supplier[], products: Product[] }> {
    return forkJoin({
      categoriesData: this.http.get<any>(this.categoriesUrl), 
      suppliersData: this.http.get<any>(this.suppliersUrl),   
      productsData: this.http.get<any>(this.productsUrl)
    }).pipe(
      map(res => {
        const categoryArray = res.categoriesData?.Category 
          ? res.categoriesData.Category 
          : Object.values(res.categoriesData || {});

        const supplierArray = Object.values(res.suppliersData || {});
        const productArray = Object.values(res.productsData || {});

        // 🎯 CRITICAL STORAGE: Keep a copy handy for matching scanned barcode values
        this.cachedProducts = productArray as Product[];

        return {
          categories: categoryArray as Category[],
          suppliers: supplierArray as Supplier[],
          products: productArray as Product[]
        };
      })
    );
  }

  /**
   * 🛒 Add an item to the basket state using signals
   */
public addToBasket(product: Product): void {
  const currentBasket = this.basket();
  // Safely look up matching items using the primary key id field
  const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

  // 🔒 INVENTORY PROTECTION CONTROL
  // Check if the item already exists in the cart and if adding more exceeds shelf availability
  if (existingIndex > -1) {
    const existingItem = currentBasket[existingIndex];
    if (existingItem.quantity >= product.stockQuantity) {
      alert(`⚠️ Cannot add more! Only ${product.stockQuantity} units of "${product.name}" are available in stock.`);
      return; // Stop right here, don't update the basket signal
    }
  }

  // 🛒 PROCEED TO UPDATE BASKET STATE SIGNAL
  if (existingIndex > -1) {
    const updatedBasket = [...currentBasket];
    updatedBasket[existingIndex] = {
      ...updatedBasket[existingIndex],
      quantity: updatedBasket[existingIndex].quantity + 1
    };
    this.basket.set(updatedBasket);
  } else {
    this.basket.set([...currentBasket, { product, quantity: 1 }]);
  }
}

  /**
   * 🔍 Look up code strings from physical barcode readers
   */
  public lookupAndScanBarcode(barcode: string): boolean {
    // Looks up matches across ID strings, barcodes, or custom SKU text patterns
    const matchedProduct = this.cachedProducts.find(p => 
      p.id?.toString() === barcode || 
      (p as any).barcode === barcode || 
      (p as any).sku === barcode
    );

    if (matchedProduct) {
      this.addToBasket(matchedProduct);
      return true;
    }
    return false;
  }

/**
 * 💳 Processes checkout transaction, resetting terminal values
 */
public processPayment(paymentMethod: string): void {
  if (this.basket().length === 0) {
    alert('🛒 Your basket is currently empty.');
    return;
  }

  // Display a quick confirmation modal receipt 
  alert(`✅ Sale Successful via ${paymentMethod}!\nTotal Collected: €${this.grandTotal().toFixed(2)}`);
  
  // Wipe out the basket cleanly for the next customer trace
  this.basket.set([]);
}

  public clearBasket(): void {
    this.basket.set([]);
    console.log('Shopping basket cleared successfully.');
  }
}