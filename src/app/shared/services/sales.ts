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

export interface HourlyMetric {
  hour: number;
  hourLabel: string;
  revenue: number;
  ticketCount: number;
  averageTicketSize: number;
  intensityPercentage: number; // Used to calculate heatmap color depth (0-100)
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

  // 1. Add this signal to track global blocking alerts across your tabs
  public activeExpiryAlert = signal<{ name: string; date: string } | null>(null);

  // 🎯 UNIFIED ADD TO BASKET METHOD (CLEANED FROM DUPLICATES)
  public addToBasket(product: Product): void {
    const liveProduct = this.products().find(p => p.id === product.id) || product;
    const currentBasket = this.basket();
    const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);

    // 🔴 1️⃣ EXPIRATION INTERCEPT PROMPT (ONLY THIS TYPE PROMPTS FOR A DATE)
    if (liveProduct.expire) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiryDate = new Date(liveProduct.expire);
      expiryDate.setHours(0, 0, 0, 0);

      if (expiryDate < today) {
        this.activeModal.set({
          type: 'prompt', 
          title: '🗓️ Update Expiration Date',
          message: `"${liveProduct.name}" is marked expired. Enter a new expiration date to update inventory and proceed:`,
          value: liveProduct.expire, 
          onConfirm: (newDateString) => {
            const trimmedDate = newDateString?.trim();
            
            if (!trimmedDate || isNaN(new Date(trimmedDate).getTime())) {
              return; 
            }

            // Update master state inventory list array
            this.products.update(allProducts =>
              allProducts.map(p => p.id === liveProduct.id ? { ...p, expire: trimmedDate } : p)
            );

            // Close the modal state tracking window instantly
            this.activeModal.set(null);

            // ✅ CRITICAL FIX: Bypass the recursive loop entirely. 
            // Forward the updated product model straight into processing.
            const freshlyUpdatedProduct = { ...liveProduct, expire: trimmedDate };
            const isProductWeighted = freshlyUpdatedProduct.isWeighted === true || (freshlyUpdatedProduct.isWeighted as any) === 'true';

            if (isProductWeighted) {
              this.executeBasketAddition(freshlyUpdatedProduct, 0.500, existingIndex, currentBasket);
            } else {
              this.executeBasketAddition(freshlyUpdatedProduct, 1, existingIndex, currentBasket);
            }
          }
        });
        return; 
      }
    }

    // 🟡 2️⃣ STANDARD WARNING (NO INPUT ELEMENT DISPLAYED HERE)
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

    // ⚖️ 3️⃣ WEIGHTSCALE PROMPT MODAL
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
          this.activeModal.set(null); 
        }
      });
    } else {
      this.executeBasketAddition(liveProduct, 1, existingIndex, currentBasket);
    }
  }

  // Alias linking older components pointing to addProductToBasket cleanly to our primary function
  public addProductToBasket(product: Product): void {
    this.addToBasket(product);
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
    
    this.activeModal.set({
      type: 'success',
      title: '✅ Sale Successful',
      message: `Transaction verified via ${paymentMethod}.\nTotal Collected: €${this.grandTotal().toFixed(2)}`,
      value: '',
      onConfirm: () => this.activeModal.set(null)
    });
    
    this.basket.set([]); 
    this.saveBasketToStorage();

    if (this.directoryHandle) {
      this.exportDailyLogToFolder();
    }
  }

  public hourlyHeatmapMetrics = computed<HourlyMetric[]>(() => {
  const allTxns = this.transactions();
  
  // 1️⃣ Initialize an empty 24-hour bracket array
  const hourlyMap = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    hourLabel: `${i.toString().padStart(2, '0')}:00`,
    revenue: 0,
    ticketCount: 0,
    averageTicketSize: 0,
    intensityPercentage: 0
  }));

  // 2️⃣ Bucket transactions into their respective hours
  let maxRevenueInAnyHour = 0;
  
  allTxns.forEach(tx => {
    const txDate = new Date(tx.timestamp);
    const hour = txDate.getHours(); // Returns 0-23
    
    if (hour >= 0 && hour < 24) {
      hourlyMap[hour].revenue += tx.grandTotal;
      hourlyMap[hour].ticketCount += 1;
    }
  });

  // 3️⃣ Calculate Averages and Peak Intensities
  hourlyMap.forEach(slot => {
    if (slot.ticketCount > 0) {
      slot.averageTicketSize = slot.revenue / slot.ticketCount;
      if (slot.revenue > maxRevenueInAnyHour) {
        maxRevenueInAnyHour = slot.revenue;
      }
    }
  });

  // 4️⃣ Assign a percentage relative to your peak hour for the CSS heatmap color engine
  return hourlyMap.map(slot => ({
    ...slot,
    intensityPercentage: maxRevenueInAnyHour > 0 
      ? Math.round((slot.revenue / maxRevenueInAnyHour) * 100) 
      : 0
  }));
});

  public async linkCloudFolder(): Promise<boolean> {
    try {
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

  public async exportDailyLogToFolder(): Promise<void> {
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
      const todayString = new Date().toISOString().split('T')[0];
      const fileName = `sales_report_${todayString}.json`;
      const todayLabel = new Date().toDateString();
      const todaysSales = this.transactions().filter(
        t => new Date(t.timestamp).toDateString() === todayLabel
      );

      const fileContent = JSON.stringify(todaysSales, null, 2);
      const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
      const writableStream = await fileHandle.createWritable();
      
      await writableStream.write(fileContent);
      await writableStream.close();

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

 topSellingProducts() {
  const productMap: { [key: string]: { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number } } = {};

  this.transactions().forEach(tx => {
    tx.items.forEach(lineItem => {
      const prod = lineItem.product;
      if (!productMap[prod.id]) {
        productMap[prod.id] = {
          id: prod.id,
          name: prod.name,
          unitsSold: 0,
          totalRevenue: 0,
          stockQuantity: prod.stockQuantity ?? 0 // Using your exact property name here!
        };
      }
      productMap[prod.id].unitsSold += lineItem.quantity;
      productMap[prod.id].totalRevenue += (prod.price * lineItem.quantity);
    });
  });

  return Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

}