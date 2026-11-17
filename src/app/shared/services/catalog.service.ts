import { Injectable, signal } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Product, Category, Supplier } from './pos-data.models';

export interface SpoilageLog {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  private _products = signal<Product[]>([]);
  private _categories = signal<Category[]>([]);
  private _suppliers = signal<Supplier[]>([]);
  private _spoilageLogs = signal<SpoilageLog[]>([]);

  // Public read-only signals for POS, Inventory, and Reports
  public readonly products = this._products.asReadonly();
  public readonly categories = this._categories.asReadonly();
  public readonly suppliers = this._suppliers.asReadonly();
  public readonly spoilageLogs = this._spoilageLogs.asReadonly();

  private db: Firestore | null = null;
  private unsubscribers: (() => void)[] = [];

  /**
   * Attaches the Firestore instance from SalesService and starts real-time catalog sync.
   */
  public bindFirestore(db: Firestore): void {
    this.db = db;
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    this.syncCollection('products', this._products, 'maranth_products', (docs) =>
      docs.map((p: any) => ({
        ...p,
        isWeighted: p.isWeighted === true || String(p.isWeighted).trim().toLowerCase() === 'true'
      }))
    );

    this.syncCollection('categories', this._categories, 'maranth_categories');
    this.syncCollection('suppliers', this._suppliers, 'maranth_suppliers');
    this.syncCollection('spoilageLogs', this._spoilageLogs, 'maranth_spoilageLogs');
  }

  private syncCollection<T>(
    collectionName: string,
    targetSignal: { set: (val: T[]) => void },
    storageKey: string,
    transform?: (raw: any[]) => T[]
  ): void {
    if (!this.db) return;

    const unsub = onSnapshot(collection(this.db, collectionName), (snapshot) => {
      if (snapshot.empty && typeof localStorage !== 'undefined') {
        const localData = localStorage.getItem(storageKey);
        if (localData) {
          try {
            const parsed = JSON.parse(localData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              parsed.forEach((item: any) => {
                const docId = String(item.id || item.username);
                setDoc(doc(this.db!, collectionName, docId), item);
              });
              return;
            }
          } catch {
            // Ignore malformed legacy localStorage cache
          }
        }
      }

      const rawDocs = snapshot.docs.map(d => d.data());
      targetSignal.set(transform ? transform(rawDocs) : (rawDocs as T[]));
    });

    this.unsubscribers.push(unsub);
  }

  // --- LOOKUP HELPERS ---

  public getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return 'Unassigned';
    const cleanId = categoryId.toString().trim();
    const match = this._categories().find(c => c.id.toString() === cleanId);
    return match && match.name ? match.name : `Category ${cleanId}`;
  }

  public isProductWeighted(product?: Product | null): boolean {
    if (!product) return false;
    const raw: unknown = product.isWeighted;
    return raw === true || String(raw).trim().toLowerCase() === 'true';
  }

  public isProductExpired(expireDate?: string): boolean {
    if (!expireDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expireDate);
    exp.setHours(0, 0, 0, 0);
    return !isNaN(exp.getTime()) && exp.getTime() <= today.getTime();
  }

  // --- PRODUCT, CATEGORY, SUPPLIER & SPOILAGE CRUD ---

  public saveProduct(productId: string, payload: Product): void {
    const idStr = productId.toString();
    this._products.update(list => {
      const idx = list.findIndex(p => String(p.id) === idStr);
      if (idx > -1) {
        const next = [...list];
        next[idx] = payload;
        return next;
      }
      return [...list, payload];
    });

    if (this.db) {
      setDoc(doc(this.db, 'products', idStr), payload);
    }
  }

  public deleteProduct(productId: string): void {
    const idStr = productId.toString();
    this._products.update(list => list.filter(p => String(p.id) !== idStr));
    if (this.db) {
      deleteDoc(doc(this.db, 'products', idStr));
    }
  }

  public adjustProductStock(productId: string, delta: number): void {
    const idStr = productId.toString();
    const product = this._products().find(p => String(p.id) === idStr);
    if (!product) return;

    const currentStock = parseFloat(product.stockQuantity as any) || 0;
    const newQuantity = parseFloat((currentStock + delta).toFixed(3));
    this.saveProduct(idStr, { ...product, stockQuantity: newQuantity });
  }

  public updateProductExpiry(productId: string, newDate: string): void {
    const idStr = productId.toString();
    const product = this._products().find(p => String(p.id) === idStr);
    if (product) {
      this.saveProduct(idStr, { ...product, expire: newDate });
    }
  }

  public saveCategory(payload: Category): void {
    const idStr = payload.id.toString();
    this._categories.update(list => {
      const idx = list.findIndex(c => String(c.id) === idStr);
      if (idx > -1) {
        const next = [...list];
        next[idx] = payload;
        return next;
      }
      return [...list, payload];
    });

    if (this.db) {
      setDoc(doc(this.db, 'categories', idStr), payload);
    }
  }

  public saveSupplier(payload: Supplier): void {
    const idStr = payload.id.toString();
    this._suppliers.update(list => {
      const idx = list.findIndex(s => String(s.id) === idStr);
      if (idx > -1) {
        const next = [...list];
        next[idx] = payload;
        return next;
      }
      return [...list, payload];
    });

    if (this.db) {
      setDoc(doc(this.db, 'suppliers', idStr), payload);
    }
  }

  public logSpoilage(product: Partial<Product> | null, quantity: number, reason: string): void {
    const log: SpoilageLog = {
      id: 'SPOIL-' + Date.now(),
      productId: String(product?.id || ''),
      productName: product?.name || 'Unknown',
      quantity,
      reason,
      timestamp: new Date().toISOString()
    };

    this._spoilageLogs.update(logs => [...logs, log]);
    if (this.db) {
      setDoc(doc(this.db, 'spoilageLogs', log.id), log);
    }
  }
}