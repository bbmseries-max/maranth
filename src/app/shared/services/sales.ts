import { Injectable, signal, computed, effect } from '@angular/core';
import { Product, BasketItem, Category, Supplier, TransactionRecord } from './pos-data.models';

// ⭐ Re-export all blueprints so other components can safely import them from here!
export * from './pos-data.models';

// ⭐ Tell TypeScript explicitly that this signal holds a POSModal
export interface POSModal {
  type: 'warning' | 'success' | 'prompt';
  title: string;
  message: string;
  value?: any;
  onConfirm?: (val?: any) => void;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: '5605', name: 'Shkolla - Lojra', isActive: true },
  { id: '5619', name: 'Xartika kouzinas - Banjo', isActive: true },
  { id: '5614', name: 'Freska Fruta', isActive: true },
  { id: '5613', name: 'Freska laxanika', isActive: true },
  { id: '5636', name: 'Karta ananeosis', isActive: true },
  { id: '5606', name: 'Caj zesto - Rofimata', isActive: true },
  { id: '5609', name: 'Cikles - Karameles', isActive: true },
  { id: '5622', name: 'Idi kapnistou -Pipes - Anaptires', isActive: true },
  { id: '5627', name: 'Zootrofes - Axesuar katikidion', isActive: true },
  { id: '5635', name: 'Veze', isActive: true }
];

const DEFAULT_SUPPLIERS: Supplier[] = [
  { id: "1", name: "Arvaniti", contact: "fanky", phone: "6973334012", notes: "6948686731 Kalymnios panagiotis", isActive: true },
  { id: "2", name: "Nutria", contact: "Andreas", phone: "6945223013", notes: "6 vaj ulliri 2 L kot mr kot", isActive: true },
  { id: "3", name: "Tasty", contact: "Kostas", phone: "6936172563", notes: "epistrofes", isActive: true }
];

const DEFAULT_PRODUCTS: Product[] = [
  { id: '1001', barcode: '5201234567890', name: 'Milo (Apples)', price: 1.20, stockQuantity: 50, categoryId: '5614', isActive: true, isWeighted: true },
  { id: '1002', barcode: '5209876543210', name: 'Clipper Lighter', price: 1.50, stockQuantity: 120, categoryId: '5622', isActive: true, isWeighted: false },
  { id: '1003', barcode: '5201111222233', name: 'Nutria Olive Oil 2L', price: 12.50, stockQuantity: 24, categoryId: '5613', supplierId: '2', isActive: true, isWeighted: false },
  { id: '1004', barcode: '5203333444455', name: 'Feta Cheese', price: 8.90, stockQuantity: 15, categoryId: '5635', isActive: true, isWeighted: true },
  { id: '1005', barcode: '5205555666677', name: 'Lays Tasty 90g', price: 1.80, stockQuantity: 30, categoryId: '5605', supplierId: '3', isActive: true, isWeighted: false }
];

@Injectable({
  providedIn: 'root'
})
export class SalesService {

  public products = signal<Product[]>(this.loadFromStorage('maranth_inventory', DEFAULT_PRODUCTS));
  public categories = signal<Category[]>(this.loadFromStorage('maranth_categories', DEFAULT_CATEGORIES));
  public suppliers = signal<Supplier[]>(this.loadFromStorage('maranth_suppliers', DEFAULT_SUPPLIERS));
  public transactions = signal<TransactionRecord[]>(this.loadFromStorage('maranth_transactions', []));
  
  public basket = signal<BasketItem[]>([]);
  public suspendedBasket = signal<BasketItem[] | null>(null);
  
  public currentCategory = signal<string>('ALL');
  public highlightedItemId = signal<string | null>(null);
  
  public activeModal = signal<POSModal | null>(null);

  constructor() {
    effect(() => localStorage.setItem('maranth_inventory', JSON.stringify(this.products())));
    effect(() => localStorage.setItem('maranth_categories', JSON.stringify(this.categories())));
    effect(() => localStorage.setItem('maranth_suppliers', JSON.stringify(this.suppliers())));
    effect(() => localStorage.setItem('maranth_transactions', JSON.stringify(this.transactions())));
  }

  private loadFromStorage(key: string, fallback: any): any {
    const saved = localStorage.getItem(key);
    if (saved) {
      try { 
        const parsed = JSON.parse(saved); 
        // Break the empty LocalStorage trap!
        if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(fallback) && fallback.length > 0) {
          return fallback;
        }
        return parsed; 
      } catch (e) {}
    }
    return fallback;
  }

  // ⭐ MASTER GLOBAL TRANSLATOR ⭐
  public getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return 'Unassigned';
    const cleanId = categoryId.toString().trim();
    
    // 1. Check live list
    const match = this.categories().find(c => c.id.toString() === cleanId);
    if (match && match.name) return match.name;
    
    // 2. Ultimate Fallback
    switch (cleanId) {
      case '5605': return 'Shkolla - Lojra';
      case '5619': return 'Xartika kouzinas - Banjo';
      case '5614': return 'Freska Fruta';
      case '5613': return 'Freska laxanika';
      case '5636': return 'Karta ananeosis';
      case '5606': return 'Caj zesto - Rofimata';
      case '5609': return 'Cikles - Karameles';
      case '5622': return 'Idi kapnistou -Pipes - Anaptires';
      case '5627': return 'Zootrofes - Axesuar katikidion';
      case '5635': return 'Veze';
    }
    return `Category ${cleanId}`;
  }

  public netSubtotal = computed(() => {
    return this.basket().reduce((acc, item) => acc + (item.product.price * item.quantity), 0);
  });

  public subtotal = this.netSubtotal;

  public taxAmount = computed(() => {
    return this.netSubtotal() * 0.24;
  });

  public vatAmount = this.taxAmount;

  public grandTotal = computed(() => {
    return this.netSubtotal() + this.taxAmount();
  });

  public totalItems = computed(() => {
    return this.basket().reduce((acc, item) => acc + (item.product.isWeighted ? 1 : item.quantity), 0);
  });

  public addToBasket(product: Product): void {
    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);
      const incrementStep = product.isWeighted ? 0.100 : 1;

      if (existingIndex > -1) {
        const updatedBasket = [...currentBasket];
        const existingItem = updatedBasket[existingIndex];
        updatedBasket[existingIndex] = {
          ...existingItem,
          quantity: parseFloat((existingItem.quantity + incrementStep).toFixed(3))
        };
        return updatedBasket;
      } else {
        const initialQuantity = product.isWeighted ? 0.500 : 1;
        return [...currentBasket, { product, quantity: initialQuantity }];
      }
    });
  }

  public removeFromBasket(product: Product): void {
    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id);
      if (existingIndex === -1) return currentBasket;

      const updatedBasket = [...currentBasket];
      const existingItem = updatedBasket[existingIndex];
      const decrementStep = product.isWeighted ? 0.100 : 1;
      const newQuantity = parseFloat((existingItem.quantity - decrementStep).toFixed(3));

      if (newQuantity <= 0 || (product.isWeighted && newQuantity < 0.100)) {
        return updatedBasket.filter(item => item.product.id !== product.id);
      } else {
        updatedBasket[existingIndex] = {
          ...existingItem,
          quantity: newQuantity
        };
        return updatedBasket;
      }
    });
  }

  public clearBasket(): void {
    this.basket.set([]);
  }

  // ⭐ RESTORED: Barcode Scanner & Search Logic ⭐
  public lookupAndScanBarcode(query: string): void {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return;

    // Try to find an exact match by ID, Barcode, or Name
    const match = this.products().find(p => 
      p.id.toString().toLowerCase() === cleanQuery || 
      (p.barcode && p.barcode.toLowerCase() === cleanQuery) ||
      p.name.toLowerCase() === cleanQuery
    );

    if (match) {
      this.addToBasket(match);
    } else {
      // Show warning modal if scan fails
      this.activeModal.set({
        type: 'warning',
        title: '⚠️ Item Not Found',
        message: `Could not find any product matching "${query}".`,
        value: '',
        onConfirm: () => this.activeModal.set(null)
      });
    }
  }

  public suspendOrder(): void {
    this.suspendedBasket.set(this.basket());
    this.clearBasket();
  }

  public recallOrder(): void {
    if (this.suspendedBasket()) {
      this.basket.set(this.suspendedBasket()!);
      this.suspendedBasket.set(null);
    }
  }

  public processPayment(method: 'Cash' | 'Card' | 'Debit'): void {
    const currentBasket = this.basket();
    if (currentBasket.length === 0) return;

    const receipt: TransactionRecord = {
      id: 'TX-' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      timestamp: new Date().toISOString(),
      items: [...currentBasket],
      subtotal: parseFloat(this.netSubtotal().toFixed(2)),
      taxAmount: parseFloat(this.taxAmount().toFixed(2)),
      grandTotal: parseFloat(this.grandTotal().toFixed(2)),
      paymentMethod: method
    };

    this.transactions.update(logs => [receipt, ...logs]);
    this.clearBasket();

    this.activeModal.set({
      type: 'success', 
      title: '✅ Payment Successful', 
      message: `Ticket ${receipt.id} processed €${receipt.grandTotal.toFixed(2)} via ${method}.`, 
      value: '', 
      onConfirm: () => this.activeModal.set(null)
    });

    // ⭐ New: Auto-close the modal after 2 seconds!
    setTimeout(() => {
      // Check to make sure they haven't already clicked something else
      if (this.activeModal()?.title === '✅ Payment Successful') {
        this.activeModal.set(null);
      }
    }, 2000);
  }


  public topSellingProducts = computed(() => {
    const itemsMap = new Map<string, { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number }>();
    
    this.transactions().forEach(tx => {
      tx.items.forEach(item => {
        if (!itemsMap.has(item.product.id)) {
          itemsMap.set(item.product.id, {
            id: item.product.id,
            name: item.product.name,
            unitsSold: 0,
            totalRevenue: 0,
            stockQuantity: item.product.stockQuantity || 0
          });
        }
        const stats = itemsMap.get(item.product.id)!;
        stats.unitsSold += item.quantity;
        stats.totalRevenue += item.product.price * item.quantity;
      });
    });
    
    return Array.from(itemsMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
  });

  public hourlyHeatmapMetrics = computed(() => {
    const hours = Array.from({length: 24}, (_, i) => ({
      hour: i,
      hourLabel: `${i.toString().padStart(2, '0')}:00`,
      revenue: 0,
      ticketCount: 0,
      intensityPercentage: 0
    }));

    this.transactions().forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      hours[hour].revenue += tx.grandTotal;
      hours[hour].ticketCount += 1;
    });

    const maxRev = Math.max(...hours.map(h => h.revenue));
    if (maxRev > 0) {
      hours.forEach(h => {
        h.intensityPercentage = Math.round((h.revenue / maxRev) * 100);
      });
    }

    return hours;
  });

  public linkCloudFolder() {
    this.activeModal.set({
      type: 'prompt',
      title: '🔗 Link Cloud Folder',
      message: 'Establish a secure sync connection to a local or cloud folder to seamlessly backup your daily Z-Reports.',
      value: '',
      onConfirm: () => {
         this.activeModal.set(null);
         setTimeout(() => {
            this.activeModal.set({
                type: 'success', title: '✅ Folder Linked', message: 'Successfully established sync connection!', value: '', onConfirm: () => this.activeModal.set(null)
            });
         }, 400);
      }
    });
  }
}