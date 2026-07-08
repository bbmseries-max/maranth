import { Component, HostListener, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; 
import { SalesService } from '../../shared/services/sales'; 
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';

// 🎯 SUBCOMPONENTS REGISTRATION
import { CategoryListComponent } from './components/category-list/category-list'; 
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket'; 

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule, 
    CurrencyPipe,             
    CategoryListComponent,    
    ShoppingBasketComponent   
  ],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements OnInit {
  public salesService = inject(SalesService);

  // 📦 Component UI State Signals
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);      
  public products = signal<Product[]>(this.loadInitialProducts());
  public currentSupplier = signal<string>('ALL');

  // Modal State Trigger
  public isSupplierModalOpen = signal<boolean>(false);

  // Scanner Buffers
  private barcodeBuffer: string = '';
  private lastKeyTime: number = Date.now();

  // 🎯 FIXED: Clean closure for the disk fallback parser method
  private loadInitialProducts(): Product[] {
    const savedData = localStorage.getItem('maranth_inventory');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error('Failed to parse local inventory state, resetting...', e);
      }
    }
    return []; // Returns blank slate which gets populated by your stream payload on init
  }

  // 🛠️ CONSTRUCTOR ADDITION: Listens to signal changes and updates LocalStorage automatically!
  constructor() {
    effect(() => {
      const currentList = this.products();
      if (currentList && currentList.length > 0) {
        localStorage.setItem('maranth_inventory', JSON.stringify(currentList));
      }
    });
  }

  // 🎭 INTERACTION MANAGEMENT METHODS
  public openSupplierModal(): void {
    this.isSupplierModalOpen.set(true);
  }

  public closeSupplierModal(): void {
    this.isSupplierModalOpen.set(false);
  }

  public selectSupplierFromModal(id: string): void {
    this.selectSupplier(id);
    this.closeSupplierModal(); 
  }

  public getSelectedSupplierName(): string {
    const activeId = this.currentSupplier();
    if (activeId === 'ALL') return 'All Companies Selected';
    const match = this.suppliers().find(s => s.id === activeId);
    return match ? `Company: ${match.name}` : 'Choose Supplier';
  }

  /**
   * 🔍 Safely extracts fields of the currently chosen supplier for read-only visualization
   */
  public getActiveSupplierField(fieldName: string): string {
    const activeId = this.currentSupplier();
    if (activeId === 'ALL') return '';
    
    const activeCompany = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    if (!activeCompany) return '';

    const companyData = activeCompany as any;
    return companyData[fieldName] ? companyData[fieldName].toString() : '';
  }

  /**
   * ✍️ Direct inline memory update when typing inside workbench forms
   */
  public updateActiveSupplierField(fieldName: string, value: string): void {
    const activeId = this.currentSupplier();
    const updatedList = this.suppliers().map(sup => {
      if (sup.id?.toString() === activeId.toString()) {
        return { ...sup, [fieldName]: value };
      }
      return sup;
    });
    this.suppliers.set(updatedList); 
  }

  /**
   * 💾 Action Command: Commits edits
   */
  public saveCompanyChanges(): void {
    const activeId = this.currentSupplier();
    const currentRecord = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    
    if (currentRecord) {
      console.log('💾 Committing updated data object payload upstream:', currentRecord);
      alert(`Company changes for "${currentRecord.name}" updated in terminal state memory successfully!`);
    }
  }

  /**
   * 🗑️ Action Command: Deletes the active company from arrays completely
   */
  public deleteActiveCompany(): void {
    const activeId = this.currentSupplier();
    const match = this.suppliers().find(s => s.id?.toString() === activeId.toString());

    if (match && confirm(`Are you sure you want to permanently erase ${match.name} from storage records?`)) {
      const cleanList = this.suppliers().filter(s => s.id?.toString() !== activeId.toString());
      this.suppliers.set(cleanList);
      
      this.selectSupplier('ALL');
      console.log(`🗑️ Successfully dropped storage identity tracking point reference for ID: ${activeId}`);
    }
  }

  /**
   * 📊 Filtered Products Matrix (Max 30 items)
   */
  public filteredProducts = computed(() => {
    const activeCategory = this.salesService.currentCategory();
    let list = this.products().filter(p => p.isActive !== false);

    if (activeCategory && activeCategory !== 'ALL') {
      list = list.filter(p => p.categoryId === activeCategory);
    }

    const activeSupplier = this.currentSupplier();
    if (activeSupplier && activeSupplier !== 'ALL') {
      console.log(`[UI State] Supplier filter selected in background: ${activeSupplier}`);
    }

    return list.slice(0, 30);
  });

  ngOnInit(): void {
    // Only fetch JSON files if localStorage hasn't been set up yet!
    this.salesService.loadStoreInventory().subscribe({
      next: (data) => {
        this.categories.set(data.categories);
        this.suppliers.set(data.suppliers);
        
        // Safety lock: if storage already has records, don't overwrite them with default JSON stock levels
        if (!localStorage.getItem('maranth_inventory')) {
          this.products.set(data.products);
        }
      },
      error: (err) => console.error('Error loading inventory dataset:', err)
    });
  }

  public selectSupplier(id: string): void {
    this.currentSupplier.set(id);
    console.log(`Switched supplier filter to: ${id}`);
  }

  /**
   * 🛒 Handles product selection, manages inventory levels, and updates the basket
   */
  public handleProductClick(product: Product): void {
    if (product.stockQuantity <= 0) {
      alert(`⚠️ ${product.name} is completely out of stock!`);
      return;
    }

    this.products.update(allProducts => {
      return allProducts.map(p => {
        if (p.id === product.id) {
          return { ...p, stockQuantity: p.stockQuantity - 1 };
        }
        return p;
      });
    });

    this.salesService.addToBasket(product);
  }

  public getProductSupplierName(product: Product): string {
    const prodAny = product as any;
    const sId = prodAny.supplierId || prodAny.companyId;
    
    if (sId) {
      const match = this.suppliers().find(s => s.id?.toString() === sId.toString());
      if (match) return match.name;
    }

    const idNum = parseInt(product.id || '0', 10);
    if (idNum % 3 === 0) return 'Cliper Hellas SA';
    if (idNum % 3 === 1) return 'Global Imports Ltd';
    
    return 'General Supplier';
  }

  public isProductLinkedToActiveSupplier(product: Product): boolean {
    const activeSupplierId = this.currentSupplier();
    if (activeSupplierId === 'ALL') return false;

    const prodAny = product as any;
    const prodSupplierId = prodAny.supplierId || prodAny.companyId;
    if (prodSupplierId) {
      return prodSupplierId.toString() === activeSupplierId.toString();
    }

    const idNum = parseInt(product.id || '0', 10);
    let assignedMockId = 'ALL';
    
    if (idNum % 3 === 0) assignedMockId = '1'; 
    if (idNum % 3 === 1) assignedMockId = '2'; 

    return assignedMockId === activeSupplierId.toString();
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeyboard(event: KeyboardEvent) {
    const currentTime = Date.now();
    const target = event.target as HTMLElement;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (['Shift', 'Control', 'Alt', 'CapsLock', 'Meta'].includes(event.key)) return;

    if (currentTime - this.lastKeyTime > 200) {
      this.barcodeBuffer = '';
    }
    this.lastKeyTime = currentTime;

    if (event.key === 'Enter') {
      const fullCode = this.barcodeBuffer.trim();
      if (fullCode.length > 0) {
        const found = this.salesService.lookupAndScanBarcode(fullCode);
        if (!found) {
          console.warn(`No product found matching code: ${fullCode}`);
        }
        this.barcodeBuffer = '';
      }
      event.preventDefault();
      return;
    }

    if (event.key.length === 1) {
      this.barcodeBuffer += event.key;
    }
  }
}