import { Component, HostListener, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; 
import { SalesService } from '../../shared/services/sales'; 
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';

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

  // 📦 UI Filter Layout State Signals
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);      
  public currentSupplier = signal<string>('ALL');
  public isSupplierModalOpen = signal<boolean>(false);

  // Scanner Buffers
  private barcodeBuffer: string = '';
  private lastKeyTime: number = Date.now();

  /**
   * 📊 Filtered Products Matrix (Max 30 items)
   * 🎯 FIXED: Pulls data from the global service instead of a crashed local property
   */
  public filteredProducts = computed(() => {
    const activeCategory = this.salesService.currentCategory();
    let list = this.salesService.products().filter(p => p.isActive !== false);

    if (activeCategory && activeCategory !== 'ALL') {
      list = list.filter(p => p.categoryId === activeCategory);
    }

    return list.slice(0, 30);
  });

  ngOnInit(): void {
    this.salesService.loadStoreInventory().subscribe({
      next: (data) => {
        this.categories.set(data.categories);
        this.suppliers.set(data.suppliers);
        // Note: salesService handles internal hydration of products automatically!
      },
      error: (err) => console.error('Error loading inventory dataset:', err)
    });
  }

  // 🛒 Click Handlers send items directly to salesService
  public handleProductClick(product: Product): void {
    this.salesService.addToBasket(product);
  }

  // 🎭 SUPPLIER INTERACTION LAYERS
  public openSupplierModal(): void { this.isSupplierModalOpen.set(true); }
  public closeSupplierModal(): void { this.isSupplierModalOpen.set(false); }
  public selectSupplier(id: string): void { this.currentSupplier.set(id); }
  
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

  public getActiveSupplierField(fieldName: string): string {
    const activeId = this.currentSupplier();
    if (activeId === 'ALL') return '';
    const activeCompany = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    if (!activeCompany) return '';
    return (activeCompany as any)[fieldName]?.toString() || '';
  }

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

  public saveCompanyChanges(): void {
    const activeId = this.currentSupplier();
    const currentRecord = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    if (currentRecord) {
      alert(`Company changes for "${currentRecord.name}" updated successfully!`);
    }
  }

  public deleteActiveCompany(): void {
    const activeId = this.currentSupplier();
    const match = this.suppliers().find(s => s.id?.toString() === activeId.toString());
    if (match && confirm(`Are you sure you want to permanently erase ${match.name}?`)) {
      this.suppliers.set(this.suppliers().filter(s => s.id?.toString() !== activeId.toString()));
      this.selectSupplier('ALL');
    }
  }

  public getProductSupplierName(product: Product): string {
    const sId = (product as any).supplierId || (product as any).companyId;
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
    const prodSupplierId = (product as any).supplierId || (product as any).companyId;
    if (prodSupplierId) return prodSupplierId.toString() === activeSupplierId.toString();
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

    if (currentTime - this.lastKeyTime > 200) this.barcodeBuffer = '';
    this.lastKeyTime = currentTime;

    if (event.key === 'Enter') {
      const fullCode = this.barcodeBuffer.trim();
      if (fullCode.length > 0) {
        this.salesService.lookupAndScanBarcode(fullCode);
        this.barcodeBuffer = '';
      }
      event.preventDefault();
      return;
    }
    if (event.key.length === 1) this.barcodeBuffer += event.key;
  }
}