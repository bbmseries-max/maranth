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

const DEFAULT_CATEGORIES: Category[] = [
  { id: "5605", name: "Shkolla - Lojra", isActive: true },
  { id: "5606", name: "Caj zesto - Rofimata", isActive: true },
  { id: "5607", name: "Caj I ftohte - Cold Ice Tea", isActive: true },
  { id: "5608", name: "XARTAKIA - Filtrakia", isActive: true },
  { id: "5609", name: "Cikles - Karameles", isActive: true },
  { id: "5610", name: "Keik kulurakia - Τυποποιημένα γλυκά", isActive: true },
  { id: "5611", name: "Djath - Τυροκομικά", isActive: true },
  { id: "5612", name: "Farmaci - Farmakeytika", isActive: true },
  { id: "5613", name: "Φρέσκα λαχανικά - laxanika", isActive: true },
  { id: "5614", name: "Φρέσκα φρούτα - Fruta", isActive: true },
  { id: "5615", name: "Φρέσκες σαλάτες - Salates", isActive: true },
  { id: "5616", name: "Fresko psomi", isActive: true },
  { id: "5617", name: "Fisikos ximos - Froutopoto", isActive: true },
  { id: "5618", name: "Xalvades - Taxinia", isActive: true },
  { id: "5619", name: "Xartika kouzinas - Banjo", isActive: true },
  { id: "5620", name: "Psomi tost - Tortilla", isActive: true },
  { id: "5621", name: "Champagnes", isActive: true },
  { id: "5622", name: "Idi kapnistou -Pipes - Anaptires", isActive: true },
  { id: "5623", name: "Kurasan", isActive: true },
  { id: "5624", name: "Sandwiches - Kria  - Ilios", isActive: true },
  { id: "5625", name: "Rum - Tequila - Cognac - Liqueur - Aperitivo", isActive: true },
  { id: "5626", name: "Whiskey - Vodka - Gin", isActive: true },
  { id: "5627", name: "Zootrofes - Axesuar katikidion", isActive: true },
  { id: "5628", name: "Alevri - Maja - Simigdhali", isActive: true },
  { id: "5629", name: "Almira biskota - Rizogofretes", isActive: true },
  { id: "5630", name: "Tzatziki - Salces Psigiu", isActive: true },
  { id: "5631", name: "Anapsiktika", isActive: true },
  { id: "5632", name: "Antivaktiridiaka Sanitary", isActive: true },
  { id: "5633", name: "Aporipantika - Malaktika", isActive: true },
  { id: "5635", name: "Veze - gjalp", isActive: true },
  { id: "5636", name: "Karta - Typos", isActive: true },
  { id: "5637", name: "Vafes - Jialistika papoutsion - Pati", isActive: true },
  { id: "5638", name: "Vrefika proionta", isActive: true },
  { id: "5639", name: "Galaktokomika", isActive: true },
  { id: "5640", name: "Galaktokomika", isActive: true },
  { id: "5641", name: "Glika Biskota", isActive: true },
  { id: "5642", name: "Glikismata", isActive: true },
  { id: "5643", name: "Dimitriaka - Mpares dimitriakon", isActive: true },
  { id: "5644", name: "Idi zaxaroplastikis", isActive: true },
  { id: "5645", name: "Eidi kathariotitas somatos - malion", isActive: true },
  { id: "5646", name: "Idi kapnou - Poura - Nargile", isActive: true },
  { id: "5647", name: "Eidi kapnou - Tsigara", isActive: true },
  { id: "5648", name: "Idi kouzinas", isActive: true },
  { id: "5649", name: "Idi Party", isActive: true },
  { id: "5650", name: "Idi peripiisis malion", isActive: true },
  { id: "5651", name: "Idi peripiisis somatos", isActive: true },
  { id: "5652", name: "Idi prosopikis igiinis", isActive: true },
  { id: "5653", name: "Idi prosopikis frontidas", isActive: true },
  { id: "5654", name: "Idi raptikis", isActive: true },
  { id: "5655", name: "Idi stomatikis igiinis", isActive: true },
  { id: "5656", name: "Zahari - Glikantikes usies", isActive: true },
  { id: "5657", name: "Zaxarodi", isActive: true },
  { id: "5658", name: "Zimarika - Makaronia", isActive: true },
  { id: "5659", name: "Isotonika - Energiaka pota", isActive: true },
  { id: "5660", name: "Katharistika kuzinas", isActive: true },
  { id: "5661", name: "Katharistika spitiu", isActive: true },
  { id: "5662", name: "Kalson", isActive: true },
  { id: "5663", name: "Kaseria", isActive: true },
  { id: "5664", name: "Katepsigmena thalasina - laxanika", isActive: true },
  { id: "5665", name: "Katepsigmena fagita - Proionta zimis", isActive: true },
  { id: "5666", name: "Kafedes", isActive: true },
  { id: "5667", name: "Kolonies - Eidi kalintikon", isActive: true },
  { id: "5668", name: "Konserves", isActive: true },
  { id: "5669", name: "Krasia", isActive: true },
  { id: "5670", name: "Kremes galaktos", isActive: true },
  { id: "5671", name: "Kritsinia - Friganies - Paximadia", isActive: true },
  { id: "5672", name: "Ladi - Lemoni - Ksidi", isActive: true },
  { id: "5673", name: "Bataries - Lampes - Ilektrologika", isActive: true },
  { id: "5674", name: "Baharika - Alati", isActive: true },
  { id: "5675", name: "Bires birra", isActive: true },
  { id: "5676", name: "Nero", isActive: true },
  { id: "5677", name: "Ksiri karpi - Apoksiramena fruta", isActive: true },
  { id: "5678", name: "Oikiakos exoplismos", isActive: true },
  { id: "5680", name: "Uza - Tsipoura", isActive: true },
  { id: "5681", name: "Pagos - Karvouna - Pellet - Fiali ygraeriou", isActive: true },
  { id: "5682", name: "Paidika giaourtia - Galata", isActive: true },
  { id: "5683", name: "Pediki peripiisi", isActive: true },
  { id: "5684", name: "Panes enilikon", isActive: true },
  { id: "5685", name: "Panes morou", isActive: true },
  { id: "5686", name: "Patatakia - Garidakia - Pop corn", isActive: true },
  { id: "5687", name: "Pralina - Meli - Marmelada- Komposta", isActive: true },
  { id: "5688", name: "Profilaktika - Durex", isActive: true },
  { id: "5689", name: "Proteinouxa proionta", isActive: true },
  { id: "5690", name: "Retsines", isActive: true },
  { id: "5691", name: "Rizi - Ospria - Trahanas", isActive: true },
  { id: "5692", name: "Saltses - Proionta magirikis", isActive: true },
  { id: "5693", name: "Skoni kakao - Rofimata sokolatas", isActive: true },
  { id: "5694", name: "Sokolatoeidi Cokollata", isActive: true },
  { id: "5696", name: "Ekklisiastika", isActive: true },
  { id: "5697", name: "Entomoapothitika", isActive: true },
  { id: "5698", name: "Ergalia", isActive: true },
  { id: "5699", name: "Alantika", isActive: true },
  { id: "5700", name: "PAGOTA", isActive: true }
];

const DEFAULT_SUPPLIERS: Supplier[] = [
  { id: "1", name: "Arvaniti", contact: "fanky", phone: "6973334012", notes: "6948686731", isActive: true },
  { id: "2", name: "Nutria", contact: "Andreas", phone: "6945223013", notes: "Olive Oil", isActive: true },
  { id: "3", name: "Tasty", contact: "Kostas", phone: "6936172563", notes: "Snacks", isActive: true }
];

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private db: any;

  // ⭐ Cloud Synced State (Starts empty, fills from Firebase instantly)
  public registeredCashiers = signal<{username: string, pin: string, role: 'admin' | 'cashier'}[]>([]);
  public transactions = signal<TransactionRecord[]>([]);
  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);

  // ⭐ Local Terminal State (Active Cart)
  public currentCashier = signal<string | null>(localStorage.getItem('maranth_active_cashier') || null);
  public currentRole = signal<'admin' | 'cashier' | null>(localStorage.getItem('maranth_active_role') as any || null);
  public basket = signal<BasketItem[]>(this.loadLocalData('maranth_basket', []));
  public suspendedBasket = signal<BasketItem[] | null>(this.loadLocalData('maranth_suspended', null));
  
  public isRefundMode = signal<boolean>(false);
  public highlightedItemId = signal<string | null>(null);
  public activeModal = signal<POSModal | null>(null);

  constructor() {
    // 1. Initialize Firebase App
    const app = initializeApp(firebaseConfig);
    this.db = getFirestore(app);

    // 2. Establish Real-Time Sync Connections
    this.setupCloudSync('cashiers', this.registeredCashiers, 'maranth_cashiers');
    this.setupCloudSync('products', this.products, 'maranth_products');
    this.setupCloudSync('transactions', this.transactions, 'maranth_transactions');
    this.setupCloudSync('categories', this.categories, 'maranth_categories', DEFAULT_CATEGORIES);
    this.setupCloudSync('suppliers', this.suppliers, 'maranth_suppliers', DEFAULT_SUPPLIERS);

    // 3. Save Active Basket to local memory only
    effect(() => localStorage.setItem('maranth_basket', JSON.stringify(this.basket())));
    effect(() => localStorage.setItem('maranth_suspended', JSON.stringify(this.suspendedBasket())));
  }

  private loadLocalData(key: string, fallback: any): any {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  }

  private setupCloudSync(collectionName: string, targetSignal: any, storageKey: string, fallbackData: any[] = []) {
    onSnapshot(collection(this.db, collectionName), (snapshot) => {
      
      if (snapshot.empty) {
        // 🚀 SCENARIO A: Firebase is empty! Let's check LocalStorage and MIGRATE the data up!
        const localData = localStorage.getItem(storageKey);
        if (localData) {
          const parsed = JSON.parse(localData);
          if (parsed && parsed.length > 0) {
            console.log(`⬆️ Migrating ${collectionName} from LocalStorage to Firebase Cloud...`);
            parsed.forEach((item: any) => {
              const docId = (item.id || item.username).toString();
              setDoc(doc(this.db, collectionName, docId), item);
            });
            return; // Exit early. The database will catch the changes and fire this snapshot again.
          }
        }

        // 🌱 SCENARIO B: Brand new system. Plant the seeds!
        if (fallbackData.length > 0) {
          console.log(`🌱 Seeding default ${collectionName}...`);
          fallbackData.forEach((item: any) => {
            const docId = (item.id || item.username).toString();
            setDoc(doc(this.db, collectionName, docId), item);
          });
          return;
        }
      }

      // 🔄 SCENARIO C: Normal Operation. Read live cloud data into the Angular Signal.
      const data = snapshot.docs.map(doc => doc.data());
      targetSignal.set(data);
    });
  }

  public registerNewCashier(username: string, pin: string, role: 'admin' | 'cashier' = 'cashier'): boolean {
    const existingUsers = this.registeredCashiers();
    if (existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) return false; 
    
    // ⭐ THE FIX: Tell local memory about the new user immediately so the login doesn't fail!
    this.registeredCashiers.update(users => [...users, { username, pin, role }]);

    // 🔥 Write directly to Cloud!
    setDoc(doc(this.db, 'cashiers', username), { username, pin, role });
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
    return match && match.name ? match.name : `Category ${cleanId}`;
  }

  public netSubtotal = computed(() => {
    return this.basket().reduce((acc, item) => {
      const lineTotal = item.product.price * item.quantity;
      return acc + (item.isRefund ? -lineTotal : lineTotal);
    }, 0);
  });
  public subtotal = this.netSubtotal;

  public taxAmount = computed(() => this.netSubtotal() * 0.24);
  public vatAmount = this.taxAmount;
  public grandTotal = computed(() => this.netSubtotal() + this.taxAmount());
  public totalItems = computed(() => this.basket().reduce((acc, item) => acc + (item.product.isWeighted ? 1 : item.quantity), 0));

  // ⭐ ADDED customQty?: number here so it expects the exact weight from the modal
  public addToBasket(product: Product, forceRefundState?: boolean, customQty?: number): void {
    this.highlightedItemId.set(product.id);
    setTimeout(() => this.highlightedItemId.set(null), 500);

    const isRef = forceRefundState !== undefined ? forceRefundState : this.isRefundMode();

    this.basket.update((currentBasket) => {
      const existingIndex = currentBasket.findIndex(item => item.product.id === product.id && !!item.isRefund === !!isRef);
      
      // ⭐ Use the exact custom weight if provided, otherwise default to adding 0.100kg or 1 unit
      const incrementStep = customQty !== undefined ? customQty : (product.isWeighted ? 0.100 : 1);

      if (existingIndex > -1) {
        const updatedBasket = [...currentBasket];
        const existingItem = updatedBasket[existingIndex];
        updatedBasket[existingIndex] = { ...existingItem, quantity: parseFloat((existingItem.quantity + incrementStep).toFixed(3)) };
        return updatedBasket;
      } else {
        // ⭐ If it's the first time adding, default to 0.500kg if no exact weight was typed
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

    // 🔥 1. Sync Live Inventory Levels to Cloud
    currentBasket.forEach(item => {
      const product = this.products().find(p => p.id === item.product.id);
      if (product) {
        const change = item.isRefund ? item.quantity : -item.quantity;
        const newQuantity = parseFloat((product.stockQuantity + change).toFixed(3));
        
        // Push the update to Firebase
        setDoc(doc(this.db, 'products', product.id.toString()), { ...product, stockQuantity: newQuantity });
      }
    });

    // 🔥 2. Push Receipt to Cloud Ledger
    setDoc(doc(this.db, 'transactions', receipt.id), receipt);

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
    
    // 1. Try exact Barcode or ID
    let found = this.products().find(p => 
      (p.barcode && p.barcode.toLowerCase() === queryLower) || 
      (p.id && p.id.toString().toLowerCase() === queryLower)
    );

    // 2. Try Exact Name
    if (!found) {
      found = this.products().find(p => p.name && p.name.toLowerCase() === queryLower);
    }

    // 3. Try Partial Name (e.g. typing "feta" finds "Feta Cheese")
    if (!found) {
      found = this.products().find(p => p.name && p.name.toLowerCase().includes(queryLower));
    }

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
            if (!isNaN(weight) && weight > 0) this.addToBasket(found!, undefined, weight);
            this.closeModal();
          }
        });
      } else {
        this.addToBasket(found);
      }
    } else {
      this.activeModal.set({ type: 'warning', title: '⚠️ Item Not Found', message: `No product matching: ${query}`, value: '', onConfirm: () => this.closeModal() });
    }
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

  // 🔥 Firebase Database Modifiers
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
    // 🔥 Deletes the entire ledger from the Cloud!
    this.transactions().forEach(tx => deleteDoc(doc(this.db, 'transactions', tx.id)));
  }

  public closeModal(): void {
    this.activeModal.set(null);
    setTimeout(() => this.activeModal.set(null), 10);
  }
}