import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesService } from '../../shared/services/sales';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent implements OnInit {
  // ⚡ Global State Services
  public salesService = inject(SalesService);

  // In your component.ts
  readonly suppliersList = computed(() => Object.values(this.salesService.suppliers()));

  // 🔍 Add this at the top with your other UI Workbench states
  public activeTab = signal<'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'>('PRODUCTS');
  public showExpirationGrid = signal<boolean>(false);

// 📝 Workbench form state models for the reference tables
  public formCategory = { id: '', name: '', isActive: true };
  public formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };

  // 📂 Dataset Collections
  public products = signal<Product[]>([]);
  public categories = signal<Category[]>([]);
  public editingCategory = signal<Category | null>(null);
  public suppliers = signal<Supplier[]>([]);
  public selectedSupplier = signal<Supplier | null>(null); // 🟢 FIX: Add this missing signal!
  public isCreatingNew = signal<boolean>(false);

  // 🔍 UI Workbench Filters State
  public searchQuery = signal<string>('');
  public selectedCategory = signal<string>('ALL');
  public showInactive = signal<boolean>(true);
  
  // 🎯 Active Selection States
  public selectedProduct = signal<Product | null>(null);

  // 📅 Expiration Forecast Control Window Parameters
  public showForecastOverlay = signal<boolean>(false);
  public startDate = signal<string>('');
  public endDate = signal<string>('');

  // 📝 Complete Fleshed-Out Retail Form Model
  public formProduct = {
    id: '',
    barcode: '',
    name: '',
    price: 0,
    purchasePrice: 0,
    taxRate: 1.24,       // Default Greece Standard VAT Multiplier (e.g., 1.24)
    categoryId: '5622',  // Default numeric database category ID relation
    supplierId: '1',
    stockQuantity: 0,
    minStockWarning: 5,  // Threshold for low stock warning
    isActive: true,
    expire: '',
    notes: '',
    isWeighted: false    // ⚖️ Explicit model field tracks scaled weighments directly
  };

  ngOnInit(): void {
    // Clear out your retail form fields completely on boot
    this.clearFormLayout();

    // Just load your product collection array from your json/service:
    this.loadInventoryCatalog();
    this.loadInventoryMetadata();
  }

  // Stub function to match your original lifecycle call hook
  private loadInventoryCatalog(): void {
    console.log('Loading primary inventory product stream...');
  }

  public clearFormLayout(): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(null);
    this.formProduct = {
      id: '',
      barcode: '',
      name: '',
      price: 0,
      purchasePrice: 0,
      taxRate: 1.24,
      categoryId: '5622',
      supplierId: '1',
      stockQuantity: 0,
      minStockWarning: 5,
      isActive: true,
      expire: '',
      notes: '',
      isWeighted: false
    };
  }

  // 🔄 Tab switching handler
public switchTab(tab: 'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'): void {
  this.activeTab.set(tab);
  this.clearAllWorkbenches();  
}

// 🧼 Master form cleaner
public clearAllWorkbenches(): void {
  this.isCreatingNew.set(false);
  this.selectedProduct.set(null);
  
  // Clear Products Form
  this.formProduct = {
    id: '', barcode: '', name: '', price: 0, purchasePrice: 0, taxRate: 1.24,
    categoryId: '5622', supplierId: '1', stockQuantity: 0, minStockWarning: 5,
    isActive: true, expire: '', notes: '', isWeighted: false
  };

  // Clear Categories Form
  this.formCategory = { id: '', name: '', isActive: true };

  // Clear Suppliers Form
  this.formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };
}

// ========================================================
// 📂 CATEGORY CRUD MANAGEMENT METHODS
// ========================================================
public selectCategoryToEdit(cat: Category): void {
  this.isCreatingNew.set(false);
  this.editingCategory.set(cat); // 🏢 Keep track of selection
  this.formCategory = { ...cat, isActive: cat.isActive !== false };
}



public prepareNewCategory(): void {
  this.isCreatingNew.set(true);
  this.formCategory = { id: '', name: '', isActive: true };
}

public saveCategoryChanges(): void {
  if (!this.formCategory.name) {
    alert('⚠️ Category Name string is mandatory!');
    return;
  }

  // Generate an ID if it's new (or let your backend handle it)
  if (this.isCreatingNew()) {
    this.formCategory.id = this.formCategory.id || Math.floor(1000 + Math.random() * 9000).toString();
    if (this.categories().some(c => c.id === this.formCategory.id)) {
      alert('⚠️ ID collision detected. Please save again to retry.');
      return;
    }
  }

  const updatedPayload: Category = { ...this.formCategory };

  this.categories.update(all => {
    if (this.isCreatingNew()) return [...all, updatedPayload];
    return all.map(c => c.id === updatedPayload.id ? updatedPayload : c);
  });

  this.clearAllWorkbenches();
  alert('📋 Category registry updated successfully!');
}

// ========================================================
// 🚚 SUPPLIER CRUD MANAGEMENT METHODS
// ========================================================
public selectSupplierToEdit(sup: Supplier): void {
  this.isCreatingNew.set(false);
  this.selectedSupplier.set(sup); // 🚚 Keep track of selection
  this.formSupplier = { 
    id: sup.id, 
    name: sup.name, 
    contact: sup.contact || '', 
    phone: sup.phone || '', 
    notes: sup.notes || '', 
    isActive: sup.isActive !== false
  };
}

/**
 * 🔍 Resolves a supplier's business name from its unique database key ID code
 */
public getSupplierName(supplierId: string | undefined): string {
  if (!supplierId) return 'Unassigned';
  const match = this.suppliers().find(s => s.id === supplierId);
  return match ? match.name : 'Unknown Supplier';
}

public prepareNewSupplier(): void {
  this.isCreatingNew.set(true);
  this.formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };
}

public saveSupplierChanges(): void {
  if (!this.formSupplier.name) {
    alert('⚠️ Supplier Business Name string is mandatory!');
    return;
  }

  if (this.isCreatingNew()) {
    this.formSupplier.id = this.formSupplier.id || Math.floor(100 + Math.random() * 900).toString();
  }

  const updatedPayload: Supplier = { ...this.formSupplier };

  this.suppliers.update(all => {
    if (this.isCreatingNew()) return [...all, updatedPayload];
    return all.map(s => s.id === updatedPayload.id ? updatedPayload : s);
  });

  this.clearAllWorkbenches();
  this.isCreatingNew.set(false);
  this.selectedProduct.set(null);
  this.editingCategory.set(null); // 🧼 Reset
  this.selectedSupplier.set(null); // 🧼 Reset
  alert('📋 Supplier directory updated successfully!');
}

  /**
   * 🛰️ Loads initial inventory metadata (Categories, Suppliers) 
   */
  private loadInventoryMetadata(): void {
    this.salesService.loadStoreInventory().subscribe({
      next: (data) => {
        console.log('📦 Inventory Metadata Payload Received:', data);
        if (data) {
          this.categories.set(data.categories || []);

          const backendSuppliers: Supplier[] = data.suppliers && data.suppliers.length > 0 
            ? data.suppliers 
            : [
                { id: '1', name: 'Standard Local Supplier', contact: '', phone: '', notes: '', isActive: true },
                { id: '2', name: 'Direct Procurement Wholesale', contact: '', phone: '', notes: '', isActive: true },
                { id: 'DRINKS', name: 'Beverage Main Distributor', contact: '', phone: '', notes: '', isActive: true }
              ];
              
          this.suppliers.set(backendSuppliers);
          console.log(`✅ Signals initialized safely. Categories: ${this.categories().length}, Suppliers: ${this.suppliers().length}`);
        }
      },
      error: (err) => console.error('Failed to load form reference metadata:', err)
    });
  }

  /**
   * 📅 Expiration Forecast Logic: Calculates automatic -2M / +3M dates 
   */
  public openForecastControl(): void {
    console.log('Filtering date window:', this.startDate, this.endDate);
    const today = new Date();
    
    // Automatic 2 Months Behind
    const past = new Date();
    past.setMonth(today.getMonth() - 2);
    this.startDate.set(past.toISOString().split('T')[0]);

    // Automatic 3 Months Coming
    const future = new Date();
    future.setMonth(today.getMonth() + 3);
    this.endDate.set(future.toISOString().split('T')[0]);

    this.showForecastOverlay.set(true);
  }

  public closeForecastControl(): void {
    this.showForecastOverlay.set(false);
  }

  /**
   * 📊 Filtered Expiration Matrix Matrix Calculator
   */
  public filteredForecastProducts = computed(() => {
    const start = new Date(this.startDate());
    const end = new Date(this.endDate());
    const allProducts = this.salesService.products();

    if (!this.showForecastOverlay()) return [];

    return allProducts.filter(product => {
      if (!product.expire) return false; 
      const expDate = new Date(product.expire);
      return expDate >= start && expDate <= end;
    });
  });

  /**
   * ⚡ Quick Date-Only Prompt Update on the Fly
   */
  public updateDateOnTheFly(product: Product): void {
    const currentExpiry = product.expire || '';
    const newDate = prompt(`Update expiration date for ${product.name} (YYYY-MM-DD):`, currentExpiry);
    
    if (newDate !== null) {
      this.salesService.products.update((allProducts: Product[]) => {
        return allProducts.map(p => 
          p.id?.toString() === product.id?.toString() 
            ? { ...p, expire: newDate } as Product
            : p
        );
      });
      
      if (this.selectedProduct()?.id === product.id) {
        this.formProduct.expire = newDate;
      }
      
      alert('📋 Expiration date modified on the fly!');
    }
  }

  public getStatusText(dateStr: string | undefined): string {
    if (!dateStr) return 'NOT TRACKED';
    return new Date(dateStr) < new Date() ? 'EXPIRED' : 'Expiring Soon';
  }

  public getStatusClass(dateStr: string | undefined): string {
    if (!dateStr) return 'status-untracked';
    return new Date(dateStr) < new Date() ? 'status-expired' : 'status-warning';
  }

  /**
   * 🛰️ Captures incoming text/scans
   */
  public handleBarcodeScan(inputValue: string): void {
    const searchTerm = inputValue.trim();
    this.searchQuery.set(searchTerm);
    console.log(`Inventory view filter updated to: "${searchTerm}"`);
  }

  /**
   * 📊 Filtered Products Matrix Selector
   */
  public managedProducts = computed(() => {
    let items: Product[] = this.salesService.products();

    if (!this.showInactive()) {
      items = items.filter(p => p.isActive !== false);
    }

    if (this.selectedCategory() !== 'ALL') {
      items = items.filter(p => p.categoryId === this.selectedCategory());
    }

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(p => {
        const barcode = ((p as any).barcode || '').toString().toLowerCase();
        const name = (p.name || '').toLowerCase();
        const id = (p.id || '').toString().toLowerCase();

        return barcode === query || name.includes(query) || id.includes(query);
      });
    }

    return items;
  });

  /**
   * 📉 Dynamic Live Profit Margin Calculator
   */
  public getFormProfitMargin(): number {
    const cost = this.formProduct.purchasePrice || 0;
    const retail = this.formProduct.price || 0;
    if (retail === 0) return 0;
    return ((retail - cost) / retail) * 100;
  }

  /**
   * 🎭 UI Interaction Layer: Select an item to map straight onto the form inputs
   */
  public selectProductToEdit(product: Product): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(product);
    
    this.formProduct = {
      id: product.id?.toString() || '',
      barcode: (product as any).barcode || product.id?.toString() || '',
      name: product.name || '',
      price: product.price || 0,
      purchasePrice: (product as any).purchasePrice || 0,
      taxRate: (product as any).taxRate || 1.24,
      categoryId: product.categoryId || '5622',
      supplierId: (product as any).supplierId || '1',
      stockQuantity: product.stockQuantity || 0,
      minStockWarning: (product as any).minStockWarning || 5,
      isActive: product.isActive !== false,
      expire: product.expire || '',
      notes: (product as any).notes || '',
      isWeighted: (product as any).isWeighted || false
    };
  }

  /**
   * 🆕 Initialize a blank form state for clean additions
   */
  public prepareNewProduct(): void {
    this.selectedProduct.set(null);
    this.isCreatingNew.set(true);
    
    this.formProduct = {
      id: '',
      barcode: '',
      name: '',
      price: 0,
      purchasePrice: 0,
      taxRate: 1.24,
      categoryId: this.selectedCategory() !== 'ALL' ? this.selectedCategory() : '5622',
      supplierId: '1',
      stockQuantity: 0,
      minStockWarning: 5,
      isActive: true,
      expire: '',
      notes: '',
      isWeighted: false
    };
  }

  public isLowStock(prod: any): boolean {
    const warningFloor = prod.minStockWarning !== undefined ? prod.minStockWarning : 5;
    return prod.stockQuantity <= warningFloor;
  }

  public getProductCost(prod: any): number {
    return prod.purchasePrice || 0;
  }

  /**
   * 💾 Save Changes: Dispatches mutations straight into the global State Service
   */
  public saveProductChanges(): void {
    if (!this.formProduct.id || !this.formProduct.name) {
      alert('⚠️ Barcode Identification and Product Name strings are mandatory fields!');
      return;
    }

    if (this.isCreatingNew() && this.salesService.products().some(p => p.id?.toString() === this.formProduct.id.toString())) {
      alert('⚠️ Operation Aborted: This Barcode / ID already exists inside system registry!');
      return;
    }

    const structuredPayload: Product = {
      id: this.formProduct.id,
      name: this.formProduct.name,
      price: this.formProduct.price,
      stockQuantity: this.formProduct.stockQuantity,
      categoryId: this.formProduct.categoryId,
      isActive: this.formProduct.isActive,
      expire: this.formProduct.expire,
      ...({
        barcode: this.formProduct.barcode,
        purchasePrice: this.formProduct.purchasePrice,
        taxRate: this.formProduct.taxRate,
        supplierId: this.formProduct.supplierId,
        minStockWarning: this.formProduct.minStockWarning,
        notes: this.formProduct.notes,
        isWeighted: this.formProduct.isWeighted
      } as any)
    };

    this.salesService.products.update((allProducts: Product[]) => {
      if (this.isCreatingNew()) {
        return [...allProducts, structuredPayload];
      } else {
        return allProducts.map(p => p.id?.toString() === structuredPayload.id?.toString() ? structuredPayload : p);
      }
    });

    this.selectedProduct.set(null);
    this.isCreatingNew.set(false);
    alert('📋 System Inventory records updated successfully!');
  }

  /**
   * 🗑️ Toggle product activity status flag
   */
  public toggleProductStatus(): void {
    this.formProduct.isActive = !this.formProduct.isActive;
    this.saveProductChanges();
  }

// 📊 Advanced Analytics Matrix for Supplier Reports
public supplierReportSummary = computed(() => {
  const allProducts = this.salesService.products();
  const allSuppliers = this.suppliers();
  const today = new Date();
  
  // Create an automatic map for every supplier record
  return allSuppliers.map(sup => {
    const matchingProducts = allProducts.filter(p => (p as any).supplierId === sup.id);
    
    // 1. Calculate critical low stock items
    const lowStockItems = matchingProducts.filter(p => {
      const minWarning = (p as any).minStockWarning !== undefined ? (p as any).minStockWarning : 5;
      return (p.stockQuantity || 0) <= minWarning && p.isActive !== false;
    });

    // 2. Calculate items already expired or nearing date lines
    const criticalExpiryItems = matchingProducts.filter(p => {
      if (!p.expire) return false;
      const expDate = new Date(p.expire);
      const timeDiff = expDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
      return daysLeft <= 30; // Flag anything expiring within 30 days
    });

    return {
      supplierId: sup.id,
      supplierName: sup.name,
      totalCatalogCount: matchingProducts.length,
      orderRequiredCount: lowStockItems.length,
      expiryRiskCount: criticalExpiryItems.length,
      lowStockProducts: lowStockItems,
      atRiskProducts: criticalExpiryItems
    };
  });
});

}