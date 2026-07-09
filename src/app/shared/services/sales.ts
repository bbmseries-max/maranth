import { Injectable, inject, signal, computed, effect } from '@angular/core'; 
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Category, SupplierJsonData, ProductJsonData, Supplier, Product } from './pos-data.models';

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
  paymentMethod: string;
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private http = inject(HttpClient);

  private categoriesUrl = 'assets/data/categories.json';
  private suppliersUrl = 'assets/data/companies.json'; 
  private productsUrl = 'assets/data/products.json';
  
  // 📜 JOURNAL SIGNALS
  public transactions = signal<TransactionRecord[]>(this.loadInitialTransactions());
  public basket = signal<BasketItem[]>([]);
  public currentCategory = signal<string>('ALL');
  public products = signal<Product[]>(this.loadInitialProducts());
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);
  


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

  // 🛠️ CONSTRUCTOR (Keeps local storage synced perfectly)
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
  } // 🚀 Bracket alignment fixed!

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

  /**
   * 🛒 Add an item to the basket state using signals
   */
  public addToBasket(product: Product): void {
    const currentBasket = this.basket();
    
    const liveProduct = this.products().find(p => p.id === product.id) || product;
    const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

    if (existingIndex > -1) {
      const existingItem = currentBasket[existingIndex];
      if (existingItem.quantity >= liveProduct.stockQuantity) {
        alert(`⚠️ Cannot add more! Only ${liveProduct.stockQuantity} units of "${liveProduct.name}" are available in stock.`);
        return; 
      }
    } else {
      if (liveProduct.stockQuantity <= 0) {
        alert(`⚠️ ${liveProduct.name} is completely out of stock!`);
        return;
      }
    }

    if (existingIndex > -1) {
      const updatedBasket = [...currentBasket];
      updatedBasket[existingIndex] = {
        ...updatedBasket[existingIndex],
        quantity: updatedBasket[existingIndex].quantity + 1
      };
      this.basket.set(updatedBasket);
    } else {
      this.basket.set([...currentBasket, { product: liveProduct, quantity: 1 }]);
    }
  }

  /**
   * 🗑️ Removes an item or drops its quantity count out of the basket state completely
   */
  public removeFromBasket(product: Product): void {
    const currentBasket = this.basket();
    const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

    if (existingIndex > -1) {
      const updatedBasket = [...currentBasket];
      const item = updatedBasket[existingIndex];

      if (item.quantity > 1) {
        // Drop the item quantity by one unit
        updatedBasket[existingIndex] = {
          ...item,
          quantity: item.quantity - 1
        };
      } else {
        // If only 1 unit remains, cut the whole line out of the active index array
        updatedBasket.splice(existingIndex, 1);
      }

      this.basket.set(updatedBasket);
      console.log(`Removed a unit of "${product.name}" from checkout basket.`);
    }
  }

  /**
   * 🔍 Look up code strings from physical barcode readers
   */
  public lookupAndScanBarcode(barcode: string): boolean {
    const matchedProduct = this.products().find(p => 
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
   * 💳 Processes checkout transaction, deducting final stock numbers safely
   */
  public processPayment(paymentMethod: string): void {
    const activeBasket = this.basket();
    if (activeBasket.length === 0) {
      alert('🛒 Your basket is currently empty.');
      return;
    }

    // 📦 1. Create a detailed permanent historical receipt record
    const newReceipt: TransactionRecord = {
      id: 'TXN-' + Math.floor(100000 + Math.random() * 900000), 
      timestamp: new Date(),
      items: [...activeBasket],
      subtotal: this.subtotal(),
      taxAmount: this.taxAmount(),
      grandTotal: this.grandTotal(),
      paymentMethod: paymentMethod
    };

    // Append new receipt to history logs
    this.transactions.update(history => [newReceipt, ...history]);

    // 📉 2. Drop real inventory values down permanently
    this.products.update(allProducts => {
      return allProducts.map(prod => {
        const basketItem = activeBasket.find(item => item.product.id === prod.id);
        if (basketItem) {
          return {
            ...prod,
            stockQuantity: Math.max(0, prod.stockQuantity - basketItem.quantity)
          };
        }
        return prod;
      });
    });

    alert(`✅ Sale Successful via ${paymentMethod}!\nTotal Collected: €${this.grandTotal().toFixed(2)}`);
    this.basket.set([]);
  }

  public clearBasket(): void {
    this.basket.set([]);
    console.log('Shopping basket cleared successfully.');
  }
}