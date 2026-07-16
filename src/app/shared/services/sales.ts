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
  private db: any;

  public registeredCashiers = signal<{username: string, pin: string, role: 'admin' | 'cashier', isApproved?: boolean}[]>([]);
  public transactions = signal<TransactionRecord[]>([]);
  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);

  public currentCashier = signal<string | null>(localStorage.getItem('maranth_active_cashier') || null);
  public currentRole = signal<'admin' | 'cashier' | null>(localStorage.getItem('maranth_active_role') as any || null);
  public basket = signal<BasketItem[]>(this.loadLocalData('maranth_basket', []));
  public suspendedBasket = signal<BasketItem[] | null>(this.loadLocalData('maranth_suspended', null));
  
  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);

  public focusSearchTrigger = signal<number>(0);

  constructor() {
    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);

    this.setupCloudSync('cashiers', this.registeredCashiers);
    this.setupCloudSync('products', this.products);
    this.setupCloudSync('transactions', this.transactions);
    this.setupCloudSync('categories', this.categories);
    this.setupCloudSync('suppliers', this.suppliers);

    effect(() => localStorage.setItem('maranth_basket', JSON.stringify(this.basket())));
    effect(() => localStorage.setItem('maranth_suspended', JSON.stringify(this.suspendedBasket())));
  }

  private loadLocalData(key: string, fallback: any): any {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  }

  private setupCloudSync(collectionName: string, targetSignal: any) {
    onSnapshot(collection(this.db, collectionName), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      targetSignal.set(data);
    });
  }

  public triggerSearchFocus(): void {
    this.focusSearchTrigger.set(Date.now());
  }

  public registerNewCashier(username: string, pin: string, role: 'admin' | 'cashier' = 'cashier', forceApproval: boolean = false): boolean {
    const existingUsers = this.registeredCashiers();
    if (existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) return false; 
    
    const isApproved = forceApproval || existingUsers.length === 0;

    this.registeredCashiers.update(users => [...users, { username, pin, role, isApproved }]);
    setDoc(doc(this.db, 'cashiers', username), { username, pin, role, isApproved });
    return true; 
  }

  public toggleCashierApproval(username: string, isApproved: boolean): void {
    const users = this.registeredCashiers();
    const user = users.find(u => u.username === username);
    if (user) {
       this.registeredCashiers.update(all => all.map(u => u.username === username ? { ...u, isApproved } : u));
       setDoc(doc(this.db, 'cashiers', username), { ...user, isApproved });
    }
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
    return match && match.name ? match.name : `Category ${cleanId}`;
  }

  public grandTotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const lineGross = item.product.price * item.quantity;
      return acc + (item.isRefund ? -lineGross : lineGross);
    }, 0);
  });

  public netSubtotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const taxRate = item.product.taxRate || 1.24;
      const lineGross = item.product.price * item.quantity;
      const lineNet = lineGross / taxRate;
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
      const liveProduct = this.products().find(p => p.id === product.id) || product;
      
      if (liveProduct.expire) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        
        const expDate = new Date(liveProduct.expire + 'T00:00:00');
        expDate.setHours(0, 0, 0, 0); 

        if (expDate < today) {
          this.activeModal.set({
            type: 'warning',
            title: '☠️ PRODUCT EXPIRED',
            message: `DO NOT SELL THIS ITEM!\n\n${liveProduct.name} expired on ${liveProduct.expire}.\n\nPlease remove this item from the customer's basket immediately and pull it from the shelf.`,
            value: '',
            onConfirm: () => this.closeModal()
          });
          return; 
        }
      }

      const currentQtyInBasket = this.basket().find(item => item.product.id === product.id && !item.isRefund)?.quantity || 0;
      let intendedQty = 0;
      
      if (currentQtyInBasket > 0) {
        const incrementStep = customQty !== undefined ? customQty : (product.isWeighted ? 0.100 : 1);
        intendedQty = parseFloat((currentQtyInBasket + incrementStep).toFixed(3));
      } else {
        intendedQty = customQty !== undefined ? customQty : (product.isWeighted ? 0.500 : 1);
      }

      const availableStock = parseFloat(liveProduct.stockQuantity as any) || 0;

      if (availableStock <= 0 || intendedQty > availableStock) {
        this.activeModal.set({
          type: 'warning',
          title: '⚠️ Insufficient Stock',
          message: `Cannot add ${liveProduct.name} to the basket.\n\nAvailable in Store: ${availableStock}\nRequested Amount: ${intendedQty}`,
          value: '',
          onConfirm: () => this.closeModal()
        });
        return; 
      }
    }

    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id && !!item.isRefund === !!isRef);
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

    this.triggerSearchFocus();
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
      const product = this.products().find(p => p.id === item.product.id);
      if (product) {
        const change = item.isRefund ? item.quantity : -item.quantity;
        const newQuantity = parseFloat((product.stockQuantity + change).toFixed(3));
        setDoc(doc(this.db, 'products', product.id.toString()), { ...product, stockQuantity: newQuantity });
      }
    });

    setDoc(doc(this.db, 'transactions', receipt.id), receipt);

    this.clearBasket();
    this.isRefundMode.set(false);
    
    this.activeModal.set({
      type: 'success', 
      title: '✅ Transaction Processed', 
      message: `Ticket ${receipt.id} processed €${receipt.grandTotal.toFixed(2)} via ${method}.`, 
      value: '', 
      onConfirm: () => {
        this.closeModal();
        setTimeout(() => this.triggerSearchFocus(), 50);
      }
    });

    setTimeout(() => {
      if (this.activeModal()?.title === '✅ Transaction Processed') {
        this.closeModal();
        // ⭐ THE FIX: Give the DOM 50ms to wipe the modal, then trigger auto-focus!
        setTimeout(() => this.triggerSearchFocus(), 50);
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
      this.triggerSearchFocus();
    }
  }

  public scanBarcodeExact(query: string): boolean {
    const queryLower = query.toLowerCase().trim();
    if (!queryLower) return false;
    
    const found = this.products().find(p => 
      (p.barcode && p.barcode.toLowerCase() === queryLower) || 
      (p.id && p.id.toString().toLowerCase() === queryLower)
    );

    if (found) {
      const isScaled = found.isWeighted === true || String(found.isWeighted).toLowerCase() === 'true';
      if (isScaled) {
        this.activeModal.set({
          type: 'prompt',
          title: '⚖️ Scale Weight (kg)',
          message: `Enter the measured weight for ${found.name}:`,
          value: '1.000',
          onConfirm: (val) => {
            const weight = parseFloat(val);
            if (!isNaN(weight) && weight > 0) this.addToBasket(found, undefined, weight);
            this.closeModal();
            setTimeout(() => this.triggerSearchFocus(), 100);
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
        if (!itemsMap.has(item.product.id)) {
          itemsMap.set(item.product.id, { id: item.product.id, name: item.product.name, unitsSold: 0, totalRevenue: 0, stockQuantity: item.product.stockQuantity || 0 });
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
      type: 'success', title: '✅ Live Cloud Sync Active', message: 'The system is successfully linked to Google Firebase!', value: '', onConfirm: () => this.closeModal()
    });
  }

  public updateProductExpiry(productId: string, newDate: string): void {
    const product = this.products().find(p => p.id?.toString() === productId.toString());
    if (product) {
      setDoc(doc(this.db, 'products', productId.toString()), { ...product, expire: newDate });
    }
  }

  public saveProduct(productId: string, payload: Product): void {
    setDoc(doc(this.db, 'products', productId.toString()), payload);
  }

  public saveCategory(payload: Category): void {
    setDoc(doc(this.db, 'categories', payload.id.toString()), payload);
  }

  public saveSupplier(payload: Supplier): void {
    setDoc(doc(this.db, 'suppliers', payload.id.toString()), payload);
  }

  public clearLedger(): void {
    this.transactions().forEach(tx => deleteDoc(doc(this.db, 'transactions', tx.id)));
  }

  public closeModal(): void {
    this.activeModal.set(null);
    setTimeout(() => this.activeModal.set(null), 10);
  }
}