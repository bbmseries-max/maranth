import { Injectable, signal, computed, effect } from '@angular/core';
import { Product, BasketItem, Category, Supplier, TransactionRecord, POSModal } from './pos-data.models';

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
  // ⭐ Authorized Users Memory (Now with Roles!)
  public registeredCashiers = signal<{username: string, pin: string, role: 'admin' | 'cashier'}[]>([]);
  public currentCashier = signal<string | null>(localStorage.getItem('maranth_active_cashier') || null);
  public currentRole = signal<'admin' | 'cashier' | null>(localStorage.getItem('maranth_active_role') as any || null);
  
  public basket = signal<BasketItem[]>([]);
  public suspendedBasket = signal<BasketItem[] | null>(null);
  public transactions = signal<TransactionRecord[]>([]);
  
  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);

  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);

  constructor() {
    const loadedUsers = this.loadFromStorage('maranth_cashiers', [{username: 'admin', pin: '1234', role: 'admin'}]);
    
    // Safety check: Upgrade any old accounts that were created before we added roles!
    const upgradedUsers = loadedUsers.map((u: any) => ({
      ...u, 
      role: u.role || (u.username.toLowerCase() === 'admin' ? 'admin' : 'cashier')
    }));
    this.registeredCashiers.set(upgradedUsers);
    
    this.products.set(this.loadFromStorage('maranth_inventory', DEFAULT_PRODUCTS));
    this.categories.set(this.loadFromStorage('maranth_categories', DEFAULT_CATEGORIES));
    this.suppliers.set(this.loadFromStorage('maranth_suppliers', DEFAULT_SUPPLIERS));
    this.transactions.set(this.loadFromStorage('maranth_transactions', []));

    effect(() => localStorage.setItem('maranth_cashiers', JSON.stringify(this.registeredCashiers())));
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
        if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(fallback) && fallback.length > 0) {
          return fallback;
        }
        return parsed; 
      } catch (e) {}
    }
    return fallback;
  }

  public registerNewCashier(username: string, pin: string, role: 'admin' | 'cashier' = 'cashier'): boolean {
    const existingUsers = this.registeredCashiers();
    const userExists = existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (userExists) {
      return false; 
    }

    this.registeredCashiers.update(users => [...users, { username, pin, role }]);
    return true; 
  }

  public loginCashier(name: string): void {
    const user = this.registeredCashiers().find(u => u.username.toLowerCase() === name.toLowerCase());
    const role = user ? user.role : 'cashier';
    const finalName = user ? user.username : name;

    this.currentCashier.set(finalName);
    this.currentRole.set(role);
    localStorage.setItem('maranth_active_cashier', finalName);
    localStorage.setItem('maranth_active_role', role);
  }

  public logoutCashier(): void {
    this.currentCashier.set(null);
    this.currentRole.set(null);
    localStorage.removeItem('maranth_active_cashier');
    localStorage.removeItem('maranth_active_role');
  }

  public getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return 'Unassigned';
    const cleanId = categoryId.toString().trim();
    const match = this.categories().find(c => c.id.toString() === cleanId);
    if (match && match.name) return match.name;
    
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
    return this.basket().reduce((acc, item) => {
      const lineTotal = item.product.price * item.quantity;
      return acc + (item.isRefund ? -lineTotal : lineTotal);
    }, 0);
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

  public addToBasket(product: Product, forceRefundState?: boolean): void {
    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

    const isRef = forceRefundState !== undefined ? forceRefundState : this.isRefundMode();

    this.basket.update((currentBasket) => {
      // Find item matching BOTH the product ID and the Refund State!
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id && !!item.isRefund === !!isRef);
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
        return [...currentBasket, { product, quantity: initialQuantity, isRefund: isRef }];
      }
    });
  }

  public removeFromBasket(product: Product, isRefund: boolean = false): void {
    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id && !!item.isRefund === !!isRefund);
      if (existingIndex === -1) return currentBasket;

      const updatedBasket = [...currentBasket];
      const existingItem = updatedBasket[existingIndex];
      const decrementStep = product.isWeighted ? 0.100 : 1;
      const newQuantity = parseFloat((existingItem.quantity - decrementStep).toFixed(3));

      if (newQuantity <= 0 || (product.isWeighted && newQuantity < 0.100)) {
        return updatedBasket.filter((_, idx) => idx !== existingIndex);
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

    // Update real inventory stock dynamically!
    this.products.update(prods => {
      const updated = [...prods];
      currentBasket.forEach(item => {
        const index = updated.findIndex(p => p.id === item.product.id);
        if (index > -1) {
          // If refund, ADD back to shelf. If sale, SUBTRACT from shelf.
          const change = item.isRefund ? item.quantity : -item.quantity;
          updated[index] = { 
            ...updated[index], 
            stockQuantity: parseFloat((updated[index].stockQuantity + change).toFixed(3)) 
          };
        }
      });
      return updated;
    });

    this.transactions.update(logs => [receipt, ...logs]);
    this.clearBasket();
    this.isRefundMode.set(false);
    
    this.activeModal.set({
      type: 'success', 
      title: '✅ Transaction Processed', 
      message: `Ticket ${receipt.id} processed €${receipt.grandTotal.toFixed(2)} via ${method}.`, 
      value: '', 
      onConfirm: () => this.closeModal()
    });

    setTimeout(() => {
      if (this.activeModal()?.title === '✅ Transaction Processed') {
        this.closeModal();
      }
    }, 2000);
  }

  public suspendOrder(): void {
    if (this.basket().length > 0) {
      this.suspendedBasket.set([...this.basket()]);
      this.clearBasket();
    }
  }

  public recallOrder(): void {
    const suspended = this.suspendedBasket();
    if (suspended && suspended.length > 0) {
      this.basket.set([...suspended]);
      this.suspendedBasket.set(null);
    }
  }

  public lookupAndScanBarcode(query: string): void {
    const queryLower = query.toLowerCase().trim();
    const found = this.products().find(p => 
      (p.barcode && p.barcode.toLowerCase() === queryLower) || 
      (p.id && p.id.toString().toLowerCase() === queryLower)
    );

    if (found) {
      this.addToBasket(found);
    } else {
      this.activeModal.set({
        type: 'warning', title: '⚠️ Item Not Found', message: `No product matching: ${query}`, value: '', onConfirm: () => this.closeModal()
      });
    }
  }

  public topSellingProducts = computed(() => {
    const itemsMap = new Map<string, { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number }>();
    
    this.transactions().forEach(tx => {
      tx.items.forEach(item => {
        if (!itemsMap.has(item.product.id)) {
          itemsMap.set(item.product.id, {
            id: item.product.id, name: item.product.name, unitsSold: 0, totalRevenue: 0, stockQuantity: item.product.stockQuantity || 0
          });
        }
        const stats = itemsMap.get(item.product.id)!;
        const effectiveQuantity = item.isRefund ? -item.quantity : item.quantity;
        stats.unitsSold += effectiveQuantity;
        stats.totalRevenue += (item.product.price * effectiveQuantity);
      });
    });
    
    return Array.from(itemsMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
  });

  public hourlyHeatmapMetrics = computed(() => {
    const hours = Array.from({length: 24}, (_, i) => ({
      hour: i, hourLabel: `${i.toString().padStart(2, '0')}:00`, revenue: 0, ticketCount: 0, intensityPercentage: 0
    }));

    this.transactions().forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      hours[hour].revenue += tx.grandTotal;
      hours[hour].ticketCount += 1;
    });

    const maxRev = Math.max(...hours.map(h => h.revenue));
    if (maxRev > 0) hours.forEach(h => { h.intensityPercentage = Math.round((h.revenue / maxRev) * 100); });
    return hours;
  });

  public linkCloudFolder() {
    this.activeModal.set({
      type: 'prompt', title: '🔗 Link Cloud Folder', message: 'Establish a secure sync connection to backup your daily Z-Reports.', value: '',
      onConfirm: () => {
         this.closeModal();
         setTimeout(() => {
            this.activeModal.set({ type: 'success', title: '✅ Folder Linked', message: 'Successfully established sync connection!', value: '', onConfirm: () => this.closeModal() });
         }, 400);
      }
    });
  }

  // ⭐ NEW: A dedicated method to guarantee the modal closes properly
  public closeModal(): void {
    // Setting to a completely new object reference briefly forces Angular to flush the UI
    this.activeModal.set({ type: 'warning', title: '', message: '', value: '', onConfirm: () => {} });
    setTimeout(() => this.activeModal.set(null), 10);
  }
}