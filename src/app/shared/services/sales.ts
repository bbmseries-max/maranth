import { Injectable, signal, computed, effect } from '@angular/core';
import { Product, BasketItem, Category, Supplier, TransactionRecord, POSModal } from './pos-data.models';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';

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

  public clearTransactions(): void {
    // 1. Empty the live Angular signal
    this.transactions.set([]);
    
    // 2. Wipe it from the browser's local storage memory
    if (typeof window !== 'undefined') {
      // Overwriting the common keys used to store the ledger
      localStorage.setItem('maranth_transactions', '[]');
      localStorage.setItem('pos_transactions', '[]');
      localStorage.removeItem('maranth_transactions');
    }
  }

  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);

  // ==========================================
  // DARK MODE ENGINE
  // ==========================================
  public isDarkMode = signal<boolean>(
    typeof localStorage !== 'undefined' && localStorage.getItem('maranth_theme') === 'dark'
  );

  public toggleTheme(): void {
    const newTheme = this.isDarkMode() ? 'light' : 'dark';
    this.isDarkMode.set(newTheme === 'dark');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('maranth_theme', newTheme);
    }
    this.applyThemeToBody();
  }

  public applyThemeToBody(): void {
    if (typeof document !== 'undefined') {
      if (this.isDarkMode()) {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    }
  }

  public currentCashier = signal<string | null>(localStorage.getItem('maranth_active_cashier') || null);
  public currentRole = signal<'admin' | 'cashier' | null>(localStorage.getItem('maranth_active_role') as any || null);
  public basket = signal<BasketItem[]>(this.loadLocalData('maranth_basket', []));
  public suspendedBasket = signal<BasketItem[] | null>(this.loadLocalData('maranth_suspended', null));
  
  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);

  // ⭐ THE MISSING SEARCH FOCUS TRIGGER
  public focusSearchTrigger = signal<number>(0);

  constructor() {
    this.applyThemeToBody();

    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);

    this.setupCloudSync('cashiers', this.registeredCashiers, 'maranth_cashiers');

    this.setupCloudSync('cashiers', this.registeredCashiers, 'maranth_cashiers');
    
    // ⭐ SWAPPED: Use the once-a-day cache for products to save 50k reads!
    this.setupDailyProductCache(); 
    
    this.setupCloudSync('transactions', this.transactions, 'maranth_transactions');
    this.setupCloudSync('categories', this.categories, 'maranth_categories');
    this.setupCloudSync('suppliers', this.suppliers, 'maranth_suppliers');

    this.setupCloudSync('transactions', this.transactions, 'maranth_transactions');
    this.setupCloudSync('categories', this.categories, 'maranth_categories');
    this.setupCloudSync('suppliers', this.suppliers, 'maranth_suppliers');

    effect(() => localStorage.setItem('maranth_basket', JSON.stringify(this.basket())));
    effect(() => localStorage.setItem('maranth_suspended', JSON.stringify(this.suspendedBasket())));
  }

  // ==========================================
  // LOCAL CACHING ENGINE
  // ==========================================

  public async setupDailyProductCache() {
    const today = new Date().toDateString(); // e.g., "Sun Jul 19 2026"
    const cachedDate = localStorage.getItem('maranth_products_date');
    const cachedProducts = localStorage.getItem('maranth_products');

    // If we already downloaded today, load instantly from browser memory (0 Firebase Reads!)
    if (cachedDate === today && cachedProducts) {
      this.products.set(JSON.parse(cachedProducts));
    } else {
      // Download from Firebase (Costs reads, but only happens ONCE per day per device)
      const snapshot = await getDocs(collection(this.db, 'products'));
      const data = snapshot.docs.map(doc => doc.data() as Product);
      
      this.products.set(data);
      localStorage.setItem('maranth_products', JSON.stringify(data));
      localStorage.setItem('maranth_products_date', today);
    }
  }

  // Forces the local cache to update when you edit a product or make a sale
  public updateLocalProduct(updatedProduct: Product): void {
    this.products.update(prods => {
      const index = prods.findIndex(p => p.id === updatedProduct.id);
      if (index > -1) {
        prods[index] = updatedProduct;
      } else {
        prods.push(updatedProduct);
      }
      
      // Save it back to memory so a page refresh doesn't erase the change
      localStorage.setItem('maranth_products', JSON.stringify(prods));
      return [...prods];
    });
  }

  // ⭐ THE MISSING TRIGGER FUNCTION
  public triggerSearchFocus(): void {
    this.focusSearchTrigger.update(v => v + 1);
  }

  public playScanBeep(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, ctx.currentTime); // 850Hz scanner tone
      gain.gain.setValueAtTime(0.1, ctx.currentTime); // Gentle volume
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1); // 100ms duration
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.log('Audio not supported', e);
    }
  }

  private loadLocalData(key: string, fallback: any): any {
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
    
    // Auto-approve the very first admin
    const isApproved = existingUsers.length === 0 ? true : false;

    this.registeredCashiers.update(users => [...users, { username, pin, role, isApproved }]);
    setDoc(doc(this.db, 'cashiers', username), { username, pin, role, isApproved });
    return true; 
  }

  // ⭐ THE MISSING STAFF APPROVAL TOGGLE
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
    this.playScanBeep();
    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

    const isRef = forceRefundState !== undefined ? forceRefundState : this.isRefundMode();

    if (!isRef) {
      const liveProduct = this.products().find(p => p.id === product.id) || product;
      const currentQtyInBasket = this.basket().find(item => item.product.id === product.id && !item.isRefund)?.quantity || 0;
      
      let intendedQty = 0;
      if (currentQtyInBasket > 0) {
        const incrementStep = customQty !== undefined ? customQty : (product.isWeighted ? 0.100 : 1);
        intendedQty = parseFloat((currentQtyInBasket + incrementStep).toFixed(3));
      } else {
        intendedQty = customQty !== undefined ? customQty : (product.isWeighted ? 0.500 : 1);
      }

      const availableStock = parseFloat(liveProduct.stockQuantity as any) || 0;

      // Allow Misc charges to bypass stock checks
      if (!product.id.startsWith('MISC-')) {
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
      paymentMethod: method,
      cashierId: this.currentCashier() || 'Unknown'
    };

   currentBasket.forEach(item => {
      // Don't deduct stock for MISC open charges
      if (!item.product.id.startsWith('MISC-')) {
        const product = this.products().find(p => p.id === item.product.id);
        if (product) {
          const change = item.isRefund ? item.quantity : -item.quantity;
          const newQuantity = parseFloat((product.stockQuantity + change).toFixed(3));
          
          // ⭐ Create the updated product object and sync it locally & to cloud
          const updatedProduct = { ...product, stockQuantity: newQuantity };
          setDoc(doc(this.db, 'products', product.id.toString()), updatedProduct);
          this.updateLocalProduct(updatedProduct); 
        }
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

  // ⭐ THE MISSING EXACT SCANNER LOGIC
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
          type: 'prompt',
          title: '⚖️ Scale Weight (kg)',
          message: `Enter the measured weight for ${found.name}:`,
          value: '1.000',
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
    this.updateLocalProduct(payload); // ⭐ Keep local cache in sync!
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

// ==========================================
  // ACCESS TO FIREBASE: STRICT FINANCIAL UPDATE
  // ==========================================
  public async importAccessMigrationData(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm(`Ready to update wholesale prices, VAT, and suppliers from ${file.name}?`)) return;

    try {
      const fileText = await file.text();
      const accessData = JSON.parse(fileText); 

      // 1. Get all current Firebase products
      const snapshot = await getDocs(collection(this.db, 'products'));
      const firebaseProducts = new Map();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data['id']) { 
          firebaseProducts.set(String(data['id']), doc.ref);
        }
      });

      let batch = writeBatch(this.db);
      let operationsCount = 0;
      let updatedCount = 0;

      // Helper to handle European commas (e.g., "0,47" -> 0.47)
      const safeNumber = (val: any) => parseFloat(String(val).replace(',', '.').trim()) || 0;

      // 2. Loop through your JSON file
      for (const row of accessData) {
        const accessId = String(row.ProductID).trim();

        if (firebaseProducts.has(accessId)) {
          const docRef = firebaseProducts.get(accessId);
          
          // Math calculations
          const cost = safeNumber(row.Blerje);
          let tax = safeNumber(row.FPA);
          
          // Convert Access format (1.24) to Firebase format (0.24) if needed
          if (tax > 1) {
            tax = tax - 1; 
          }

          const calculatedAfterTax = cost * (1 + tax);

          // STRICT UPDATE: Only touching the 4 requested fields
          batch.update(docRef, {
            costPrice: cost,
            purchasePrice: cost, 
            taxRate: tax,
            afterTaxRate: parseFloat(calculatedAfterTax.toFixed(4)),
            supplierId: String(row.Politis).trim()
          });
          
          operationsCount++;
          updatedCount++;

          // Firebase batch limit is 500
          if (operationsCount === 500) {
            await batch.commit();
            batch = writeBatch(this.db);
            operationsCount = 0;
          }
        }
      }

      if (operationsCount > 0) {
        await batch.commit();
      }

      // 3. Cleanup and refresh
      event.target.value = ''; 
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('maranth_products');
        localStorage.removeItem('maranth_products_date');
      }
      
      // If you have a function to reload your products list, call it here:
      if (this.setupDailyProductCache) {
         await this.setupDailyProductCache(); 
      }

      alert(`✅ Migration Complete! Updated financials and vendors for ${updatedCount} products.`);

    } catch (error) {
      console.error("Import failed:", error);
      alert("Something went wrong. Check console for details.");
    }
  }

}