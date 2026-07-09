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
  public salesService = inject(SalesService);

  // 📂 Dataset Collections
  public categories = signal<Category[]>([]);
  public suppliers = signal<Supplier[]>([]);

  

  // 🔍 UI Workbench Filters State
  public searchQuery = signal<string>('');
  public selectedCategory = signal<string>('ALL');
  public showInactive = signal<boolean>(true);
  
  // 🎯 Active Selection States
  public selectedProduct = signal<Product | null>(null);
  public isCreatingNew = signal<boolean>(false);

  // 📝 Complete Fleshed-Out Retail Form Model
  public formProduct = {
    id: '',
    barcode: '',
    name: '',
    price: 0,
    purchasePrice: 0,
    taxRate: 24,         // Default Greece Standard VAT (24%)
    categoryId: 'DRINKS',
    supplierId: '1',
    stockQuantity: 0,
    minStockWarning: 5,  // Threshold for low stock warning
    isActive: true,
    expireDate: '',
    notes: ''
  };

  ngOnInit(): void {
  this.salesService.loadStoreInventory().subscribe({
    next: (data) => {
      console.log('📦 Inventory Metadata Payload Received:', data);

      if (data) {
        this.categories.set(data.categories || []);

        // 🚀 Fully structured mock suppliers to satisfy the Supplier model contract
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
   * 🛰️ Captures incoming text/scans and updates the query tracking signal
   */
  public handleBarcodeScan(inputValue: string): void {
    const searchTerm = inputValue.trim();
    this.searchQuery.set(searchTerm);
    console.log(`Inventory view filter updated to: "${searchTerm}"`);
  }

  /**
   * 📊 Filtered Products Matrix Selector
   * Combines category select, inactive toggles, name strings, and barcode filter checks
   */
  public managedProducts = computed(() => {
    let items: Product[] = this.salesService.products();

    // 1. Filter out inactive items if toggled off
    if (!this.showInactive()) {
      items = items.filter(p => p.isActive !== false);
    }

    // 2. Filter by Category Dropdown selection
    if (this.selectedCategory() !== 'ALL') {
      items = items.filter(p => p.categoryId === this.selectedCategory());
    }

    // 3. Filter by Live Text Input search / Barcode Scans
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
  public selectProductToEdit(product: any): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(product);
    
    // De-serialize parameters cleanly with fallback defaults
    this.formProduct = {
      id: product.id?.toString() || '',
      barcode: product.barcode || product.id?.toString() || '',
      name: product.name || '',
      price: product.price || 0,
      purchasePrice: product.purchasePrice || 0,
      taxRate: product.taxRate || 24,
      categoryId: product.categoryId || 'DRINKS',
      supplierId: product.supplierId || '1',
      stockQuantity: product.stockQuantity || 0,
      minStockWarning: product.minStockWarning || 5,
      isActive: product.isActive !== false,
      expireDate: product.expireDate || '',
      notes: product.notes || ''
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
      taxRate: 24,
      categoryId: this.selectedCategory() !== 'ALL' ? this.selectedCategory() : 'DRINKS',
      supplierId: '1',
      stockQuantity: 0,
      minStockWarning: 5,
      isActive: true,
      expireDate: '',
      notes: ''
    };
  }

  /**
   * Checks if a product stock level has dropped below its safe floor limit
   */
  public isLowStock(prod: any): boolean {
    const warningFloor = prod.minStockWarning !== undefined ? prod.minStockWarning : 5;
    return prod.stockQuantity <= warningFloor;
  }

  /**
   * Safely extracts the cost/purchase price from a product model
   */
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

    // Force unique index creation validations on new entries
    if (this.isCreatingNew() && this.salesService.products().some(p => p.id?.toString() === this.formProduct.id.toString())) {
      alert('⚠️ Operation Aborted: This Barcode / ID already exists inside system registry!');
      return;
    }

    // Clean data wrapper payload assignment mapping
    const structuredPayload: Product = {
      id: this.formProduct.id,
      name: this.formProduct.name,
      price: this.formProduct.price,
      stockQuantity: this.formProduct.stockQuantity,
      categoryId: this.formProduct.categoryId,
      isActive: this.formProduct.isActive,
      ...({
        barcode: this.formProduct.barcode,
        purchasePrice: this.formProduct.purchasePrice,
        taxRate: this.formProduct.taxRate,
        supplierId: this.formProduct.supplierId,
        minStockWarning: this.formProduct.minStockWarning,
        expireDate: this.formProduct.expireDate,
        notes: this.formProduct.notes
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
   * 🗑️ Toggle product activity status flag instead of raw deletion to preserve receipt records integrity
   */
  public toggleProductStatus(): void {
    this.formProduct.isActive = !this.formProduct.isActive;
    this.saveProductChanges();
  }
}