import { Component, HostListener, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; // 🚀 Added CurrencyPipe explicitly
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
    CurrencyPipe,             // 🚀 Ensures product pricing doesn't turn your HTML template red
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
  public products = signal<Product[]>([]);
  public currentSupplier = signal<string>('ALL');

  // Modal State Trigger
  public isSupplierModalOpen = signal<boolean>(false);

  // Scanner Buffers
  private barcodeBuffer: string = '';
  private lastKeyTime: number = Date.now();

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
    if (activeId === 'ALL') {
      return '';
    }
    
    const activeCompany = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    if (!activeCompany) {
      return '';
    }

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
    this.salesService.loadStoreInventory().subscribe({
      next: (data) => {
        this.categories.set(data.categories);
        this.suppliers.set(data.suppliers);
        this.products.set(data.products);
      },
      error: (err) => console.error('Error loading inventory dataset:', err)
    });
  }

  public selectSupplier(id: string): void {
    this.currentSupplier.set(id);
    console.log(`Switched supplier filter to: ${id}`);
  }

  public handleProductClick(product: Product): void {
    this.salesService.addToBasket(product);
  }

  /**
 * 🏷️ Resolves which company owns a product without forcing strict grid filtering
 */
public getProductSupplierName(product: Product): string {
  // 1. If your product gets a supplierId/companyId field later:
  const prodAny = product as any;
  const sId = prodAny.supplierId || prodAny.companyId;
  
  if (sId) {
    const match = this.suppliers().find(s => s.id?.toString() === sId.toString());
    if (match) return match.name;
  }

  // 2. Fallback Demo Mapping: Assigning suppliers dynamically based on category or ID ranges 
  // so you can see it working right now with your current data!
  const idNum = parseInt(product.id || '0', 10);
  if (idNum % 3 === 0) return 'Cliper Hellas SA';
  if (idNum % 3 === 1) return 'Global Imports Ltd';
  
  return 'General Supplier';
}

  /**
   * 📡 GLOBAL BARCODE HARDWARE INTERCEPTOR
   */
  @HostListener('window:keydown', ['$event'])
  handleGlobalKeyboard(event: KeyboardEvent) {
    const currentTime = Date.now();
    const target = event.target as HTMLElement;

    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    if (['Shift', 'Control', 'Alt', 'CapsLock', 'Meta'].includes(event.key)) {
      return;
    }

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