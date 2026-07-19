import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent {
  public salesService = inject(SalesService);

  // ⭐ TAB CONTROLLER
  public activeTab = signal<string>('products');

  // Search logic for products tab
  public searchQuery = signal<string>('');
  
  // Data sources directly from the service
  public products = this.salesService.products;
  public categories = this.salesService.categories;
  public suppliers = this.salesService.suppliers;
  public expireFilterDate = signal<string>('');

  // Edit states
  public editingProductId: string | null = null;
  public editForm: Partial<Product> = {};

  public editingCategoryId: string | null = null;
  public categoryForm: Partial<Category> = {};

  public editingSupplierId: string | null = null;
  public supplierForm: Partial<Supplier> = {};

  // ==========================================
  // PRODUCTS LOGIC
  // ==========================================
  public filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allProds = this.products() || [];
    if (!query) return allProds.slice(0, 100);

    return allProds.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) || 
      (p.barcode && p.barcode.toLowerCase().includes(query)) ||
      (p.id && p.id.toString().toLowerCase().includes(query))
    ).slice(0, 100);
  });

  public toggleEdit(prod: Product): void {
    if (this.editingProductId === prod.id) {
      this.editingProductId = null;
    } else {
      this.editingProductId = prod.id;
      this.editForm = { ...prod };
      setTimeout(() => {
        const el = document.getElementById('prod-card-' + prod.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  public prepareNewProduct(): void {
  this.editingProductId = 'NEW';
  this.editForm = { 
    id: 'PROD-' + Date.now().toString().slice(-6),
    name: '', 
    price: 0, 
    costPrice: 0,
    taxRate: 0.24,
    stockQuantity: 0,
    minStockWarning: 2,  // 👈 Using your original name
    expire: '',          // 👈 Using your original name
    categoryId: '',
    supplierId: undefined, 
    isActive: true,
    isWeighted: false
  };
}

  public saveEdit(): void {
    if (!this.editForm.id || !this.editForm.name || this.editForm.price === undefined) return;
    this.salesService.saveProduct(this.editForm.id, this.editForm as Product);
    this.editingProductId = null;
  }

  // ==========================================
  // CATEGORIES LOGIC
  // ==========================================
  public toggleCategoryEdit(cat: Category): void {
    if (this.editingCategoryId === cat.id) {
      this.editingCategoryId = null;
    } else {
      this.editingCategoryId = cat.id;
      this.categoryForm = { ...cat };
    }
  }

  public prepareNewCategory(): void {
    this.editingCategoryId = 'NEW';
    this.categoryForm = { id: '', name: '', isActive: true };
  }

  public saveCategoryChanges(): void {
    if (!this.categoryForm.id || !this.categoryForm.name) return;
    // ⭐ FIX 2: Removed the extra ID argument
    this.salesService.saveCategory(this.categoryForm as Category);
    this.editingCategoryId = null;
  }

  // ==========================================
  // SUPPLIERS LOGIC
  // ==========================================
  public toggleSupplierEdit(sup: Supplier): void {
    if (this.editingSupplierId === sup.id) {
      this.editingSupplierId = null;
    } else {
      this.editingSupplierId = sup.id;
      this.supplierForm = { ...sup };
    }
  }

  public prepareNewSupplier(): void {
    this.editingSupplierId = 'NEW';
    this.supplierForm = { id: 'SUP-' + Date.now().toString().slice(-4), name: '', contact: '', phone: '', notes: '', isActive: true };
  }

  public saveSupplierChanges(): void {
    if (!this.supplierForm.id || !this.supplierForm.name) return;
    // ⭐ FIX 3: Removed the extra ID argument
    this.salesService.saveSupplier(this.supplierForm as Supplier);
    this.editingSupplierId = null;
  }

  // ==========================================
  // HELPERS
  // ==========================================
  public cancelAllEdits(): void {
    this.editingProductId = null;
    this.editingCategoryId = null;
    this.editingSupplierId = null;
  }

  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    return isNaN(parsed) ? '€0.00' : '€' + parsed.toFixed(2);
  }

  public getSupplierName(supId: string | null | undefined): string {
    if (!supId) return 'None';
    const sup = this.suppliers().find(s => s.id === supId);
    return sup ? sup.name : 'Unknown';
  }
}