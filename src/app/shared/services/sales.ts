import { Injectable, signal, computed, effect } from '@angular/core';
import { Product, BasketItem, Category, Supplier, TransactionRecord, POSModal } from './pos-data.models';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDVlkxyVZIPEgXSukJxPEWK3WLnjoujsjU",
  authDomain: "maranth-pos.firebaseapp.com",
  projectId: "maranth-pos",
  storageBucket: "maranth-pos.firebasestorage.app",
  messagingSenderId: "71739745426",
  appId: "1:71739745426:web:cf0dbdcfbdf29fe10ef24b"
};

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  public db: any;

  public registeredCashiers = signal<{username: string, pin: string, role: 'admin' | 'cashier', isApproved?: boolean}[]>([]);
  public transactions = signal<TransactionRecord[]>([]);
  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);
  public cashLogs = signal<any[]>([]);
  public spoilageLogs = signal<any[]>([]);

  public currentCashier = signal<string | null>(typeof window !== 'undefined' ? localStorage.getItem('maranth_active_cashier') : null);
  public currentRole = signal<'admin' | 'cashier' | null>(typeof window !== 'undefined' ? localStorage.getItem('maranth_active_role') as any : null);
  
  public basket = signal<BasketItem[]>(this.loadLocalData('maranth_basket', []));
  public suspendedBasket = signal<BasketItem[] | null>(this.loadLocalData('maranth_suspended', null));
  
  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);
  public focusSearchTrigger = signal<number>(0);

  constructor() {
    if (typeof window !== 'undefined') {
      const app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);

      this.setupCloudSync('cashiers', this.registeredCashiers, 'maranth_cashiers');
      this.setupCloudSync('products', this.products, 'maranth_products');
      this.setupCloudSync('transactions', this.transactions, 'maranth_transactions');
      this.setupCloudSync('categories', this.categories, 'maranth_categories');
      this.setupCloudSync('suppliers', this.suppliers, 'maranth_suppliers');
      this.setupCloudSync('cashLogs', this.cashLogs, 'maranth_cashLogs');
      this.setupCloudSync('spoilageLogs', this.spoilageLogs, 'maranth_spoilageLogs');

      effect(() => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('maranth_basket', JSON.stringify(this.basket()));
        }
      });
      
      effect(() => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('maranth_suspended', JSON.stringify(this.suspendedBasket()));
        }
      });
    }
  }

  public async setupDailyProductCache(): Promise<void> {
    return Promise.resolve();
  }

  public logSpoilage(product: any, quantity: number, reason: string): void {
    const log = {
      id: 'SPOIL-' + Date.now(),
      productId: product?.id || '',
      productName: product?.name || 'Unknown',
      quantity,
      reason,
      timestamp: new Date().toISOString()
    };
    this.spoilageLogs.update(logs => [...logs, log]);
    if (this.db) {
      setDoc(doc(this.db, 'spoilageLogs', log.id), log);
    }
  }

  public triggerSearchFocus(): void {
    this.focusSearchTrigger.update(v => v + 1);
  }

  private loadLocalData(key: string, fallback: any): any {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return fallback;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  }

  private setupCloudSync(collectionName: string, targetSignal: any, storageKey: string, fallbackData: any[] = []) {
    onSnapshot(collection(this.db, collectionName), (snapshot) => {
      if (snapshot.empty) {
        const localData = localStorage.getItem(storageKey);
        if (localData) {
          const parsed = JSON.parse(localData);
          if (parsed && parsed.length > 0) {
            parsed.forEach((item: any) => {
              const docId = (item.id || item.username).toString();
              setDoc(doc(this.db, collectionName, docId), item);
            });
            return; 
          }
        }
        if (fallbackData.length > 0) {
          fallbackData.forEach((item: any) => {
            const docId = (item.id || item.username).toString();
            setDoc(doc(this.db, collectionName, docId), item);
          });
          return;
        }
      }
      const data = snapshot.docs.map(doc => doc.data());
      targetSignal.set(data);
    });
  }

  public registerNewCashier(username: string, pin: string, role: 'admin' | 'cashier' = 'cashier'): boolean {
    const existingUsers = this.registeredCashiers();
    if (existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) return false; 
    const isApproved = existingUsers.length === 0 ? true : false;
    this.registeredCashiers.update(users => [...users, { username, pin, role, isApproved }]);
    setDoc(doc(this.db, 'cashiers', username), { username, pin, role, isApproved });
    return true; 
  }

  public toggleCashierApproval(username: string, isApproved: boolean): void {
    const users = this.registeredCashiers();
    const targetUser = users.find(u => u.username === username);
    if (targetUser) {
      const updatedUser = { ...targetUser, isApproved };
      setDoc(doc(this.db, 'cashiers', username), updatedUser);
    }
  }

  public loginCashier(name: string): void {
    const user = this.registeredCashiers().find(u => u.username.toLowerCase() === name.toLowerCase());
    const role = user ? user.role : 'cashier';
    const finalName = user ? user.username : name;

    this.currentCashier.set(finalName);
    this.currentRole.set(role);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('maranth_active_cashier', finalName);
      localStorage.setItem('maranth_active_role', role);
    }
  }

  public logoutCashier(): void {
    this.currentCashier.set(null);
    this.currentRole.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('maranth_active_cashier');
      localStorage.removeItem('maranth_active_role');
    }
  }

  public getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return 'Unassigned';
    const cleanId = categoryId.toString().trim();
    const match = this.categories().find(c => c.id.toString() === cleanId);
    return match && match.name ? match.name : `Category ${cleanId}`;
  }

  public grandTotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const lineGross = item.product.price * item.quantity;
      return acc + (item.isRefund ? -lineGross : lineGross);
    }, 0);
  });

  /**
   * Normalizes any input tax rate format (e.g. 0.24, 1.24, or 24) to the standard divisor (e.g. 1.24)
   */
  private getTaxDivisor(taxRate?: number): number {
    if (taxRate === undefined || taxRate === null || isNaN(taxRate) || taxRate <= 0) {
      return 1.24; // Default 24% Greek VAT
    }
    if (taxRate > 10) { // e.g. 24 or 13
      return 1 + (taxRate / 100);
    }
    if (taxRate < 1) { // e.g. 0.24 or 0.13
      return 1 + taxRate;
    }
    return taxRate; // Already in 1.24 or 1.13 format
  }

  public netSubtotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const taxDivisor = this.getTaxDivisor(item.product.taxRate); 
      const lineGross = item.product.price * item.quantity;
      const lineNet = lineGross / taxDivisor;
      return acc + (item.isRefund ? -lineNet : lineNet);
    }, 0);
  });
  public subtotal = this.netSubtotal;

  public taxAmount = computed(() => this.grandTotal() - this.netSubtotal());
  public vatAmount = this.taxAmount;

  public totalItems = computed(() => this.basket().reduce((acc, item) => acc + (item.product.isWeighted ? 1 : item.quantity), 0));

  public addToBasket(product: Product, forceRefundState?: boolean, customQty?: number): void {
    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

    const isRef = forceRefundState !== undefined ? forceRefundState : this.isRefundMode();

    if (!isRef) {
      const liveProduct = this.products().find(p => String(p.id) === String(product.id)) || product;
      const currentQtyInBasket = this.basket().find(item => String(item.product.id) === String(product.id) && !item.isRefund)?.quantity || 0;
      
      let intendedQty = 0;
      if (currentQtyInBasket > 0) {
        const incrementStep = customQty !== undefined ? customQty : (product.isWeighted ? 0.100 : 1);
        intendedQty = parseFloat((currentQtyInBasket + incrementStep).toFixed(3));
      } else {
        intendedQty = customQty !== undefined ? customQty : (product.isWeighted ? 0.500 : 1);
      }

      const availableStock = parseFloat(liveProduct.stockQuantity as any) || 0;

      if (!String(product.id).startsWith('MISC-')) {
        if (availableStock <= 0 || intendedQty > availableStock) {
          this.activeModal.set({
            type: 'warning',
            title: '⚠️ Insufficient Stock',
            message: `Cannot add ${liveProduct.name} to the basket.\n\nAvailable in Store: ${availableStock}\nRequested Amount: ${intendedQty}`,
            value: '',
            onConfirm: () => {
              this.closeModal();
              this.triggerSearchFocus();
            }
          });
          return; 
        }
      }
    }

    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => String(item.product.id) === String(product.id) && !!item.isRefund === !!isRef);
      const incrementStep = customQty !== undefined ? customQty : (product.isWeighted ? 0.100 : 1);

      if (existingIndex > -1) {
        const updatedBasket = [...currentBasket];
        const existingItem = updatedBasket[existingIndex];
        updatedBasket[existingIndex] = { ...existingItem, quantity: parseFloat((existingItem.quantity + incrementStep).toFixed(3)) };
        return updatedBasket;
      } else {
        const initialQuantity = customQty !== undefined ? customQty : (product.isWeighted ? 0.500 : 1);
        return [...currentBasket, { product, quantity: initialQuantity, isRefund: isRef }];
      }
    });
  }

  public removeFromBasket(product: Product, isRefund: boolean = false): void {
    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => String(item.product.id) === String(product.id) && !!item.isRefund === !!isRefund);
      if (existingIndex === -1) return currentBasket;

      const updatedBasket = [...currentBasket];
      const existingItem = updatedBasket[existingIndex];
      const decrementStep = product.isWeighted ? 0.100 : 1;
      const newQuantity = parseFloat((existingItem.quantity - decrementStep).toFixed(3));

      if (newQuantity <= 0 || (product.isWeighted && newQuantity < 0.100)) {
        return updatedBasket.filter((_, idx) => idx !== existingIndex);
      } else {
        updatedBasket[existingIndex] = { ...existingItem, quantity: newQuantity };
        return updatedBasket;
      }
    });
    this.triggerSearchFocus();
  }

  public clearBasket(): void {
    this.basket.set([]);
    this.triggerSearchFocus();
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

    currentBasket.forEach(item => {
      const productIdStr = String(item.product.id);
      if (!productIdStr.startsWith('MISC-')) {
        const product = this.products().find(p => String(p.id) === productIdStr);
        if (product && this.db) {
          const currentStock = parseFloat(product.stockQuantity as any) || 0;
          const change = item.isRefund ? item.quantity : -item.quantity;
          const newQuantity = parseFloat((currentStock + change).toFixed(3));
          
          setDoc(doc(this.db, 'products', productIdStr), { 
            ...product, 
            stockQuantity: newQuantity 
          });
        }
      }
    });

    if (this.db) setDoc(doc(this.db, 'transactions', receipt.id), receipt);

    this.clearBasket();
    this.isRefundMode.set(false);
    
    this.activeModal.set({
      type: 'success', 
      title: '✅ Transaction Processed', 
      message: `Ticket ${receipt.id} processed €${receipt.grandTotal.toFixed(2)} via ${method}.`, 
      value: '', 
      onConfirm: () => {
        this.closeModal();
        this.triggerSearchFocus();
      }
    });

    setTimeout(() => {
      if (this.activeModal()?.title === '✅ Transaction Processed') {
        this.closeModal();
        this.triggerSearchFocus();
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

  public scanBarcodeExact(query: string): boolean {
    const queryLower = query.toLowerCase().trim();
    const found = this.products().find(p => 
      (p.barcode && p.barcode.toLowerCase() === queryLower) || 
      (p.id && p.id.toString().toLowerCase() === queryLower)
    );

    if (found) {
      const isScaled = found.isWeighted === true || String(found.isWeighted).toLowerCase() === 'true';
      if (isScaled) {
        this.activeModal.set({
          type: 'prompt', title: '⚖️ Scale Weight (kg)', message: `Enter the measured weight for ${found.name}:`, value: '1.000',
          onConfirm: (val) => {
            const weight = parseFloat(val);
            if (!isNaN(weight) && weight > 0) this.addToBasket(found, undefined, weight);
            this.closeModal();
            this.triggerSearchFocus();
          }
        });
      } else {
        this.addToBasket(found);
      }
      return true;
    }
    return false;
  }

  public topSellingProducts = computed(() => {
    const itemsMap = new Map<string, { id: string, name: string, unitsSold: number, totalRevenue: number, stockQuantity: number }>();
    this.transactions().forEach(tx => {
      tx.items.forEach(item => {
        const pIdStr = String(item.product.id);
        if (!itemsMap.has(pIdStr)) {
          itemsMap.set(pIdStr, { id: pIdStr, name: item.product.name, unitsSold: 0, totalRevenue: 0, stockQuantity: item.product.stockQuantity || 0 });
        }
        const stats = itemsMap.get(pIdStr)!;
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
    this.activeModal.set({ type: 'success', title: '✅ Live Cloud Sync Active', message: 'The system is successfully linked to Google Firebase!', value: '', onConfirm: () => this.closeModal() });
  }

  public updateProductExpiry(productId: string, newDate: string): void {
    const product = this.products().find(p => String(p.id) === String(productId));
    if (product && this.db) setDoc(doc(this.db, 'products', productId.toString()), { ...product, expire: newDate });
  }

  public saveProduct(productId: string, payload: Product): void {
    if (this.db) setDoc(doc(this.db, 'products', productId.toString()), payload);
  }

  public saveCategory(payload: Category): void {
    if (this.db) setDoc(doc(this.db, 'categories', payload.id.toString()), payload);
  }

  public saveSupplier(payload: Supplier): void {
    if (this.db) setDoc(doc(this.db, 'suppliers', payload.id.toString()), payload);
  }

  public clearLedger(): void {
    if (this.db) this.transactions().forEach(tx => deleteDoc(doc(this.db, 'transactions', tx.id)));
  }

  public clearTransactions(): void {
    this.clearLedger();
  }

  public closeModal(): void {
    this.activeModal.set(null);
    setTimeout(() => this.activeModal.set(null), 10);
  }
}