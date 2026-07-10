import { Injectable, inject, signal, computed, effect } from '@angular/core'; 
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category, Supplier, Product } from './pos-data.models';

export interface BasketItem {
  product: Product;
  quantity: number;
}

export interface TransactionRecord {
  id: string;
  timestamp: Date;
  items: BasketItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'Card' | 'Debit';
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private http = inject(HttpClient);

  private categoriesUrl = 'assets/data/categories.json';
  private suppliersUrl = 'assets/data/companies.json'; 
  private productsUrl = 'assets/data/products.json';
  
  // 📜 SYSTEM STATE SIGNALS
  public basket = signal<BasketItem[]>([]);
  public currentCategory = signal<string>('ALL');
  public products = signal<Product[]>(this.loadInitialProducts());
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);
  public transactions = signal<TransactionRecord[]>(this.loadInitialTransactions()); 
  public selectedPaymentMethod: 'Cash' | 'Card' | 'Debit' = 'Cash';
  
  // 🚀 SUSPEND ORDER MEMORY TRACE
  public suspendedBasket = signal<BasketItem[] | null>(null);

  private loadInitialTransactions(): TransactionRecord[] {
    const saved = localStorage.getItem('maranth_sales_history');
    if (saved) {
      try {
        return JSON.parse(saved).map((t: any) => ({ ...t, timestamp: new Date(t.timestamp) }));
      } catch (e) {
        console.error('Failed to parse sales history logs:', e);
      }
    }
    return [];
  }

  private loadInitialProducts(): Product[] {
    const savedData = localStorage.getItem('maranth_inventory');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error('Failed to parse local inventory state:', e);
      }
    }
    return []; 
  }

  // 🛠️ AUTOMATED DISK STORAGE SYNCERS
  constructor() {
    effect(() => {
      const currentList = this.products();
      if (currentList && currentList.length > 0) {
        localStorage.setItem('maranth_inventory', JSON.stringify(currentList));
      }
    });

    effect(() => {
      localStorage.setItem('maranth_sales_history', JSON.stringify(this.transactions()));
    });
  }

  // 📈 FINANCIAL COMPUTED METRICS
  public subtotal = computed(() => {
    return this.basket().reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  });

  public totalItems = computed(() => {
    return this.basket().reduce((acc, item) => acc + item.quantity, 0);
  });

  public grandTotal = computed(() => {
    return this.basket().reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  });

  public taxAmount = computed(() => {
    return this.grandTotal() - (this.grandTotal() / 1.24);
  });

  public netSubtotal = computed(() => {
    return this.grandTotal() - this.taxAmount();
  });

  public selectCategory(id: string): void {
    this.currentCategory.set(id);
  }

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

        if (!localStorage.getItem('maranth_inventory')) {
          this.products.set(productArray as Product[]);
        }

        return {
          categories: categoryArray as Category[],
          suppliers: supplierArray as Supplier[],
          products: productArray as Product[]
        };
      })
    );
  }

  public addToBasket(product: Product): void {
    const currentBasket = this.basket();
    const liveProduct = this.products().find(p => p.id === product.id) || product;
    const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

    if (liveProduct.stockQuantity <= 0) {
      alert(`⚠️ ${liveProduct.name} is completely out of stock!`);
      return;
    }

    const isProductWeighted = liveProduct.isWeighted === true || (liveProduct.isWeighted as any) === 'true';
    let weightInput = 1; 

    if (isProductWeighted) {
      const userInput = prompt(`⚖️ Enter weight in KG for "${liveProduct.name}":`, '0.500');
      if (userInput === null) return; 
      
      weightInput = parseFloat(userInput);

      if (isNaN(weightInput) || weightInput <= 0) {
        alert('⚠️ Invalid weight entered. Please use a number greater than 0.');
        return;
      }

      if (weightInput > liveProduct.stockQuantity) {
        alert(`⚠️ Not enough stock! You entered ${weightInput} kg, but only ${liveProduct.stockQuantity} kg is available.`);
        return;
      }
    }

    if (existingIndex > -1) {
      const updatedBasket = [...currentBasket];
      const incrementAmount = isProductWeighted ? weightInput : 1;
      
      updatedBasket[existingIndex] = {
        ...updatedBasket[existingIndex],
        quantity: updatedBasket[existingIndex].quantity + incrementAmount
      };
      this.basket.set(updatedBasket);
    } else {
      this.basket.set([...currentBasket, { product: liveProduct, quantity: weightInput }]);
    }

    const deduction = isProductWeighted ? weightInput : 1;
    this.products.update(allProducts => 
      allProducts.map(prod => prod.id === product.id 
        ? { ...prod, stockQuantity: parseFloat((prod.stockQuantity - deduction).toFixed(3)) } 
        : prod
      )
    );
    this.saveBasketToStorage();
  }

  public removeFromBasket(product: Product): void {
    const currentBasket = this.basket();
    const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

    if (existingIndex > -1) {
      const updatedBasket = [...currentBasket];
      const item = updatedBasket[existingIndex];

      const liveProduct = this.products().find(p => p.id === product.id) || product;
      const isProductWeighted = liveProduct.isWeighted === true || (liveProduct.isWeighted as any) === 'true';
      const stepBackAmount = isProductWeighted ? item.quantity : 1;

      if (!isProductWeighted && item.quantity > 1) {
        updatedBasket[existingIndex] = { ...item, quantity: item.quantity - 1 };
      } else {
        updatedBasket.splice(existingIndex, 1);
      }
      this.basket.set(updatedBasket);

      this.products.update(allProducts =>
        allProducts.map(prod => prod.id === product.id 
          ? { ...prod, stockQuantity: parseFloat((prod.stockQuantity + stepBackAmount).toFixed(3)) } 
          : prod
        )
      );
      this.saveBasketToStorage();
    }
  }

  // ==========================================================================
  // ⚡ SYSTEM ACTIONS SIDEBAR SERVICES
  // ==========================================================================

  /**
   * 🗑️ Action 1: Clear Current Sale
   * Flushes checkout basket and returns quantities safely back to inventory.
   */
  public clearBasket(): void {
    const activeBasket = this.basket();
    
    this.products.update(allProducts => {
      return allProducts.map(prod => {
        const basketItem = activeBasket.find(item => item.product.id === prod.id);
        return basketItem 
          ? { ...prod, stockQuantity: parseFloat((prod.stockQuantity + basketItem.quantity).toFixed(3)) } 
          : prod;
      });
    });

    this.basket.set([]);
    this.saveBasketToStorage();
  }

  /**
   * ⏸️ Action 2: Suspend (Hold) Order
   * Park active transaction items. Does NOT return stock to inventory.
   */
  public suspendOrder(): void {
    const currentItems = this.basket();
    if (currentItems.length === 0) return;

    this.suspendedBasket.set(currentItems);
    this.basket.set([]); 
    this.saveBasketToStorage();
  }

  /**
   * ▶️ Action 3: Recall Order
   * Restores items parked back onto layout panel frame.
   */
  public recallOrder(): void {
    const savedItems = this.suspendedBasket();
    if (!savedItems) return;

    this.basket.set([...this.basket(), ...savedItems]);
    this.suspendedBasket.set(null); 
    this.saveBasketToStorage();
  }

  private saveBasketToStorage(): void {
    localStorage.setItem('maranth_active_basket', JSON.stringify(this.basket()));
  }

  public lookupAndScanBarcode(barcode: string): boolean {
    const cleanBarcode = barcode?.toString().trim();
    if (!cleanBarcode) return false;

    const matchedProduct = this.products().find(p => 
      p.barcode?.toString().trim() === cleanBarcode || 
      p.id?.toString().trim() === cleanBarcode || 
      (p as any).sku?.toString().trim() === cleanBarcode
    );

    if (matchedProduct) {
      this.addToBasket(matchedProduct);
      return true;
    }
    return false;
  }

  /**
   * 💳 Processes checkout transaction cleanly
   */
  public processPayment(paymentMethod: 'Cash' | 'Card' | 'Debit'): void {
    const activeBasket = this.basket();
    if (activeBasket.length === 0) return;

    const newReceipt: TransactionRecord = {
      id: 'TXN-' + Math.floor(100000 + Math.random() * 900000), 
      timestamp: new Date(),
      items: [...activeBasket],
      subtotal: this.subtotal(),
      taxAmount: this.taxAmount(),
      grandTotal: this.grandTotal(),
      paymentMethod: paymentMethod
    };

    this.transactions.update(history => [newReceipt, ...history]);
    alert(`✅ Sale Successful via ${paymentMethod}!\nTotal Collected: €${this.grandTotal().toFixed(2)}`);
    
    this.basket.set([]); 
    this.saveBasketToStorage();
  }
}