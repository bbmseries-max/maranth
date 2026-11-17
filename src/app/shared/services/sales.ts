import { Injectable, signal, inject, computed, effect } from '@angular/core';
import { Product, BasketItem, Category, Supplier, TransactionRecord, POSModal } from './pos-data.models';
import { BarcodeService } from './barcode.service';
import { AuthService, UserRole } from './auth.service';
import { CatalogService } from './catalog.service';
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
  public barcodeService = inject(BarcodeService);
  public authService = inject(AuthService);
  public catalogService = inject(CatalogService);

  // Sales-owned state
  public transactions = signal<TransactionRecord[]>([]);
  public cashLogs = signal<any[]>([]);

  // Read-only signal aliases from AuthService & CatalogService (keeps all existing templates & components working untouched)
  public readonly registeredCashiers = this.authService.registeredCashiers;
  public readonly currentCashier = this.authService.currentCashier;
  public readonly currentRole = this.authService.currentRole;

  public readonly products = this.catalogService.products;
  public readonly categories = this.catalogService.categories;
  public readonly suppliers = this.catalogService.suppliers;
  public readonly spoilageLogs = this.catalogService.spoilageLogs;

  // POS Basket & UI state
  public basket = signal<BasketItem[]>(this.loadLocalData('maranth_basket', []));
  public suspendedBasket = signal<BasketItem[] | null>(this.loadLocalData('maranth_suspended', null));

  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);
  public focusSearchTrigger = signal<number>(0);

  /**
   * 🏆 Computed signal to guarantee transactions are ALWAYS sorted newest-first (descending timestamp)
   */
  public sortedTransactions = computed(() => {
    return [...this.transactions()].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  constructor() {
    if (typeof window !== 'undefined') {
      const app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);

      // Bind Firestore to extracted services
      this.authService.bindFirestore(this.db);
      this.catalogService.bindFirestore(this.db);

      // Sync Sales-owned collections
      this.setupCloudSync('transactions', this.transactions, 'maranth_transactions');
      this.setupCloudSync('cashLogs', this.cashLogs, 'maranth_cashLogs');

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

  // --- AUTH FACADE DELEGATES ---

  public loginWithPin(username: string, pin: string) {
    return this.authService.loginWithPin(username, pin);
  }

  public registerNewCashier(username: string, pin: string, role: UserRole = 'cashier', autoApprove = false) {
    return this.authService.registerNewCashier(username, pin, role, autoApprove);
  }

  public toggleCashierApproval(username: string, isApproved: boolean) {
    return this.authService.toggleCashierApproval(username, isApproved);
  }

  public loginCashier(name: string): void {
    const user = this.authService.registeredCashiers().find(
      u => u.username.toLowerCase() === name.toLowerCase()
    );
    const role = user ? user.role : 'cashier';
    const finalName = user ? user.username : name;
    this.authService.setSession(finalName, role);
  }

  public logoutCashier(): void {
    this.authService.logoutCashier();
  }

  // --- CATALOG FACADE DELEGATES ---

  public getCategoryName(categoryId: string | undefined): string {
    return this.catalogService.getCategoryName(categoryId);
  }

  public isProductWeighted(product?: Product | null): boolean {
    return this.catalogService.isProductWeighted(product);
  }

  public logSpoilage(product: any, quantity: number, reason: string): void {
    this.catalogService.logSpoilage(product, quantity, reason);
  }

  public updateProductExpiry(productId: string, newDate: string): void {
    this.catalogService.updateProductExpiry(productId, newDate);
  }

  public saveProduct(productId: string, payload: Product): void {
    this.catalogService.saveProduct(productId, payload);
  }

  public saveCategory(payload: Category): void {
    this.catalogService.saveCategory(payload);
  }

  public saveSupplier(payload: Supplier): void {
    this.catalogService.saveSupplier(payload);
  }

  public async setupDailyProductCache(): Promise<void> {
    return Promise.resolve();
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
      const data = snapshot.docs.map(d => d.data());

      if (collectionName === 'transactions') {
        data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }

      targetSignal.set(data);
    });
  }

  // --- BASKET & VAT TOTALS ---

  public grandTotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const lineGross = item.product.price * item.quantity;
      return acc + (item.isRefund ? -lineGross : lineGross);
    }, 0);
  });

  private getTaxDivisor(taxRate?: number): number {
    if (taxRate === undefined || taxRate === null || isNaN(taxRate) || taxRate <= 0) {
      return 1.24;
    }
    if (taxRate > 10) {
      return 1 + (taxRate / 100);
    }
    if (taxRate < 1) {
      return 1 + taxRate;
    }
    return taxRate;
  }

  public netSubtotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const p = item.product as any;
      const rawRate = p.taxRate ?? p.vatRate ?? p.FPA ?? p.vat ?? p.fpa ?? p.tax
                   ?? p.vat_rate ?? p.tax_rate ?? p.vatPercent ?? p.taxPercent
                   ?? p.fpa_rate ?? p.fpaRate ?? p.vat_percent
                   ?? p.FPA_RATE ?? p.VAT ?? p.TAX;

      const taxDivisor = this.getTaxDivisor(rawRate);
      const lineGross = item.product.price * item.quantity;
      const lineNet = lineGross / taxDivisor;
      return acc + (item.isRefund ? -lineNet : lineNet);
    }, 0);
  });
  public subtotal = this.netSubtotal;

  public taxAmount = computed(() => this.grandTotal() - this.netSubtotal());
  public vatAmount = this.taxAmount;

  public totalItems = computed(() =>
    this.basket().reduce((acc, item) => acc + (item.product.isWeighted ? 1 : item.quantity), 0)
  );

  // --- BASKET OPERATIONS ---

  public addToBasket(product: Product, forceRefundState?: boolean, customQty?: number): void {
    const isRef = forceRefundState !== undefined ? forceRefundState : this.isRefundMode();

    // ⛔ 1. Hard Guard: Block Expired Products (except on Refunds/Returns)
    if (!isRef && this.catalogService.isProductExpired(product.expire)) {
      this.activeModal.set({
        type: 'warning',
        title: '⛔ ΛΗΓΜΕΝΟ ΠΡΟΪΟΝ (EXPIRED)',
        message: `Το προϊόν "${product.name}" έχει λήξει στις ${product.expire}!\nΑπαγορεύεται η πώληση.`,
        value: '',
        onConfirm: () => {
          this.closeModal();
          this.triggerSearchFocus();
        }
      });
      return;
    }

    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

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

      if (!String(product.id).startsWith('MISC-') && !liveProduct.excludeFromInventoryCount) {
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
    this.triggerSearchFocus();
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

    const activeCashier = this.currentCashier() || 'Admin';

    const receipt: TransactionRecord = {
      id: 'TX-' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      timestamp: new Date().toISOString(),
      items: [...currentBasket],
      subtotal: parseFloat(this.netSubtotal().toFixed(2)),
      taxAmount: parseFloat(this.taxAmount().toFixed(2)),
      grandTotal: parseFloat(this.grandTotal().toFixed(2)),
      paymentMethod: method,
      cashier: activeCashier,
      cashierId: activeCashier
    };

    currentBasket.forEach(item => {
      const productIdStr = String(item.product.id);
      if (!productIdStr.startsWith('MISC-') && !item.product.excludeFromInventoryCount) {
        const change = item.isRefund ? item.quantity : -item.quantity;
        this.catalogService.adjustProductStock(productIdStr, change);
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

  // --- BARCODE DELEGATES ---

  public isQrCodePayload(raw: string): boolean {
    return this.barcodeService.isNonProductQrPayload(raw);
  }

  public scanBarcodeExact(rawInput: string): 'added' | 'qr_blocked' | 'not_found' {
    const result = this.barcodeService.resolveScan(rawInput, this.products());

    if (result.status === 'qr_blocked') return 'qr_blocked';
    if (result.status !== 'matched' || !result.product) return 'not_found';

    if (result.effectiveExpireDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (result.effectiveExpireDate <= todayStr) {
        this.activeModal.set({
          type: 'warning',
          title: '⛔ ΛΗΓΜΕΝΟ ΠΡΟΪΟΝ (EXPIRED)',
          message: `Το προϊόν "${result.product.name}" έχει λήξει στις ${result.effectiveExpireDate}! Απαγορεύεται η πώληση.`,
          value: '',
          onConfirm: () => {
            this.closeModal();
            this.triggerSearchFocus();
          }
        });
        return 'added';
      }
    }

    this.addToBasket(result.product);
    return 'added';
  }

  // --- ANALYTICS & LEDGER ---

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
    const hours = Array.from({ length: 24 }, (_, i) => ({
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