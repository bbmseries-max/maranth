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

// 📦 MODAL SYSTEM INTERFACE STRUCT
export interface PosModalConfig {
  type: 'warning' | 'prompt' | 'success';
  title: string;
  message: string;
  value: string;
  onConfirm: (value: string) => void;
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

  // Save the folder connection token in memory
  private directoryHandle: any = null;
  public isSyncing = signal<boolean>(false);
  
  // 👓 SHIFT-FRIENDLY DIALOG ENGINE SIGNAL
  public activeModal = signal<PosModalConfig | null>(null);

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

    // 1️⃣ Out of Stock Verification
    if (liveProduct.stockQuantity <= 0) {
      this.activeModal.set({
        type: 'warning',
        title: '⚠️ Stock Exhausted',
        message: `${liveProduct.name} is completely out of stock!`,
        value: '',
        onConfirm: () => this.activeModal.set(null)
      });
      return;
    }

    const isProductWeighted = liveProduct.isWeighted === true || (liveProduct.isWeighted as any) === 'true';

    // 2️⃣ Weighted Scales Intercept Mode
    if (isProductWeighted) {
      this.activeModal.set({
        type: 'prompt',
        title: '⚖️ Weigh Item',
        message: `Enter weight in KG for "${liveProduct.name}":`,
        value: '0.500',
        onConfirm: (userInput) => {
          const weightInput = parseFloat(userInput);

          if (isNaN(weightInput) || weightInput <= 0) {
            this.activeModal.set({
              type: 'warning',
              title: '⚠️ Invalid Weight',
              message: 'Please use a weight number greater than 0.',
              value: '',
              onConfirm: () => this.activeModal.set(null)
            });
            return;
          }

          if (weightInput > liveProduct.stockQuantity) {
            this.activeModal.set({
              type: 'warning',
              title: '⚠️ Stock Deficit',
              message: `Not enough stock! You entered ${weightInput} kg, but only ${liveProduct.stockQuantity} kg is available.`,
              value: '',
              onConfirm: () => this.activeModal.set(null)
            });
            return;
          }

          this.executeBasketAddition(liveProduct, weightInput, existingIndex, currentBasket);
          this.activeModal.set(null); // Safely collapse window panel frame
        }
      });
    } else {
      // 3️⃣ Standard Discrete Item Mode
      this.executeBasketAddition(liveProduct, 1, existingIndex, currentBasket);
    }
  }

  // Helper utility to safely increment inventory array states 
  private executeBasketAddition(liveProduct: Product, amount: number, existingIndex: number, currentBasket: BasketItem[]): void {
    if (existingIndex > -1) {
      const updatedBasket = [...currentBasket];
      updatedBasket[existingIndex] = {
        ...updatedBasket[existingIndex],
        quantity: updatedBasket[existingIndex].quantity + amount
      };
      this.basket.set(updatedBasket);
    } else {
      this.basket.set([...currentBasket, { product: liveProduct, quantity: amount }]);
    }

    this.products.update(allProducts => 
      allProducts.map(prod => prod.id === liveProduct.id 
        ? { ...prod, stockQuantity: parseFloat((prod.stockQuantity - amount).toFixed(3)) } 
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

  public suspendOrder(): void {
    const currentItems = this.basket();
    if (currentItems.length === 0) return;

    this.suspendedBasket.set(currentItems);
    this.basket.set([]); 
    this.saveBasketToStorage();
  }

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
    
    // 💳 ERGONOMIC PAYMENT COMPLETED DIALOG OVERLAY
    this.activeModal.set({
      type: 'success',
      title: '✅ Sale Successful',
      message: `Transaction verified via ${paymentMethod}.\nTotal Collected: €${this.grandTotal().toFixed(2)}`,
      value: '',
      onConfirm: () => this.activeModal.set(null)
    });
    
    this.basket.set([]); 
    this.saveBasketToStorage();

    // 🔄 BACKGROUND EXPORT AT TRANSACTION COMPLETION
  // This automatically updates the file in your Google Drive folder on every checkout!
  if (this.directoryHandle) {
    this.exportDailyLogToFolder();
  }
  }

/**
   * 🗺️ STEP 1: Link the App to your Google Drive Desktop Folder
   * Run this once (e.g., click a "Link Sync Folder" button in your settings layout)
   */
  public async linkCloudFolder(): Promise<boolean> {
    try {
      // Opens a native folder-picker window
      this.directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });
      
      this.activeModal.set({
        type: 'success',
        title: '🔗 Folder Linked!',
        message: 'Connected perfectly to your local cloud sync folder.',
        value: '',
        onConfirm: () => this.activeModal.set(null)
      });
      return true;
    } catch (err) {
      console.error('Folder selection cancelled or rejected:', err);
      return false;
    }
  }

  /**
   * 💾 STEP 2: Generate & Save the Daily File Directly to the Cloud Sync Folder
   */
  public async exportDailyLogToFolder(): Promise<void> {
    // If they haven't linked the folder yet this session, prompt them to choose it
    if (!this.directoryHandle) {
      this.activeModal.set({
        type: 'warning',
        title: '📂 Link Folder Required',
        message: 'Please select your local Google Drive folder destination first.',
        value: '',
        onConfirm: async () => {
          this.activeModal.set(null);
          await this.linkCloudFolder();
        }
      });
      return;
    }

    this.isSyncing.set(true);

    try {
      const todayString = new Date().toISOString().split('T')[0]; // "2026-07-10"
      const fileName = `sales_report_${todayString}.json`;

      // 1. Filter out today's transactions
      const todayLabel = new Date().toDateString();
      const todaysSales = this.transactions().filter(
        t => new Date(t.timestamp).toDateString() === todayLabel
      );

      // 2. Generate file payload content
      const fileContent = JSON.stringify(todaysSales, null, 2);

      // 3. Create or replace the file in your Google Drive folder layout stream
      const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
      const writableStream = await fileHandle.createWritable();
      
      await writableStream.write(fileContent);
      await writableStream.close(); // Saves it to the disk path

      this.activeModal.set({
        type: 'success',
        title: '☁️ Report Saved',
        message: `File "${fileName}" written to local storage. Google Drive will sync it immediately!`,
        value: '',
        onConfirm: () => this.activeModal.set(null)
      });

    } catch (error) {
      console.error('Failed to write to folder:', error);
      this.activeModal.set({
        type: 'warning',
        title: '❌ Write Error',
        message: 'Could not save file. Make sure the folder is available and not open in another app.',
        value: '',
        onConfirm: () => this.activeModal.set(null)
      });
    } finally {
      this.isSyncing.set(false);
    }
  }


}