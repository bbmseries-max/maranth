import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';
import { ThemeService } from '../../shared/services/theme.service';

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

  //STAFF 
  public editingStaffId = signal<string | null>(null);
  public staffForm = { username: '', pin: '', role: 'cashier' as 'admin' | 'cashier' };

  // Search logic for products tab
  public searchQuery = signal<string>('');
  
  // Data sources directly from the service
  public products = this.salesService.products;
  public categories = this.salesService.categories;
  public suppliers = this.salesService.suppliers;

  public expireFilterDate = signal<string>('');
  public filterStatus = signal<'active' | 'inactive' | 'all'>('active'); // Defaults to Active!
  public filterLowStock = signal<boolean>(false);
  public filterCategory = signal<string>('ALL');
  
  // 🎯 Filter signal to find items missing a VAT rate
  public filterMissingVat = signal<boolean>(false);

  // Edit states
  public editingProductId: string | null = null;
  public newAltBarcode: string = '';
  public editForm: Partial<Product> = {};

  public editingCategoryId: string | null = null;
  public categoryForm: Partial<Category> = {};

  public editingSupplierId: string | null = null;
  public supplierForm: Partial<Supplier> = {};

  constructor(public themeService: ThemeService) {}

  // ==========================================
  // VAT / TAX NORMALIZATION HELPERS
  // ==========================================
  public normalizeTaxRate(rate: any): number | undefined {
    if (rate === undefined || rate === null) return undefined;
    const str = String(rate).trim();
    if (str === '' || str === 'null' || str === 'undefined' || str === 'NaN') return undefined;
    let num = Number(str);
    if (isNaN(num)) return undefined;
    if (num > 1) num = num / 100; // e.g. 13 -> 0.13
    return num;
  }

  // 🎯 Centralized extraction checking ALL possible JSON keys
  public extractRawTaxRate(p: any): number | undefined {
    if (!p) return undefined;
    const raw = p.taxRate ?? p.vatRate ?? p.FPA ?? p.vat ?? p.fpa ?? p.tax 
             ?? p.vat_rate ?? p.tax_rate ?? p.vatPercent ?? p.taxPercent 
             ?? p.fpa_rate ?? p.fpaRate ?? p.vat_percent ?? p.vatPercent 
             ?? p.FPA_RATE ?? p.VAT ?? p.TAX;
    return this.normalizeTaxRate(raw);
  }

  public formatVatLabel(rateOrProduct: any): string {
    const norm = typeof rateOrProduct === 'object' 
      ? this.extractRawTaxRate(rateOrProduct) 
      : this.normalizeTaxRate(rateOrProduct);
    if (norm === undefined) return '⚠️ NO VAT';
    return `${Math.round(norm * 100)}% VAT`;
  }

  // 🎯 Dynamic computed product list for the template
  public filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.filterStatus();
    const category = this.filterCategory();
    const lowStockOnly = this.filterLowStock();
    const expireDate = this.expireFilterDate();
    const missingVatOnly = this.filterMissingVat();

    return this.products().filter(prod => {
      // 🎯 Uses centralized extractor
      const normRate = this.extractRawTaxRate(prod);

      // 🎯 GLOBAL AUDIT MODE: When Missing VAT is enabled, bypass Category & Status filters
      if (missingVatOnly) {
        if (normRate !== undefined) {
          return false; // Has a valid VAT rate -> hide it
        }

        // Apply search query if user typed a name/barcode while auditing
        if (query) {
          const nameMatch = prod.name && prod.name.toLowerCase().includes(query);
          const barcodeMatch = prod.barcode && prod.barcode.toLowerCase().includes(query);
          const idMatch = prod.id && prod.id.toString().toLowerCase().includes(query);
          if (!nameMatch && !barcodeMatch && !idMatch) return false;
        }

        return true; // Show ALL missing VAT products across active, inactive, and all categories!
      }

      if (status === 'active' && prod.isActive === false) return false;
      if (status === 'inactive' && prod.isActive !== false) return false;

      if (category !== 'ALL' && prod.categoryId !== category) return false;

      if (lowStockOnly && prod.stockQuantity > (prod.minStockWarning || 5)) return false;

      if (expireDate && prod.expire !== expireDate) return false;

      if (query) {
        const nameMatch = prod.name && prod.name.toLowerCase().includes(query);
        const barcodeMatch = prod.barcode && prod.barcode.toLowerCase().includes(query);
        const idMatch = prod.id && prod.id.toString().toLowerCase().includes(query);
        if (!nameMatch && !barcodeMatch && !idMatch) return false;
      }

      return true;
    });
  });

  public toggleEdit(prod: Product): void {
    if (this.editingProductId === prod.id) {
      this.editingProductId = null;
    } else {
      this.editingProductId = prod.id;
      // 🎯 Now checks all key variations in sync with the filter!
      this.editForm = { 
        ...prod, 
        taxRate: this.extractRawTaxRate(prod) 
      };
      setTimeout(() => {
        const el = document.getElementById('prod-card-' + prod.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  public prepareNewProduct(): void {
    if (this.searchQuery()) {
      this.searchQuery.set('');
    }
    this.editingProductId = 'NEW';
    this.editForm = { 
      id: 'PROD-' + Date.now().toString().slice(-6),
      name: '', 
      price: 0, 
      costPrice: 0,
      taxRate: 0.24,
      stockQuantity: 0,
      minStockWarning: 2,
      expire: '',
      categoryId: '',
      supplierId: undefined, 
      isActive: true,
      isWeighted: false,
      altBarcodes: [],
      isPinned: false,
    };
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  }

  // ==========================================
  // MULTIPLE BARCODES LOGIC
  // ==========================================
  public addAltBarcode(): void {
    const code = this.newAltBarcode.trim();
    if (!code) return;

    if (!this.editForm.altBarcodes) {
      this.editForm.altBarcodes = [];
    }

    if (this.editForm.barcode === code) {
      alert("This is already the main barcode!");
      this.newAltBarcode = '';
      return;
    }
    if (this.editForm.altBarcodes.includes(code)) {
      alert("Barcode already added!");
      this.newAltBarcode = '';
      return;
    }

    this.editForm.altBarcodes.push(code);
    this.newAltBarcode = '';
  }

  public removeAltBarcode(codeToRemove: string): void {
    if (!this.editForm.altBarcodes) return;
    
    this.editForm.altBarcodes = this.editForm.altBarcodes.filter(
      code => code !== codeToRemove
    );
  }

  public saveEdit(): void {
    if (!this.editForm.id || !this.editForm.name || this.editForm.price === undefined) return;
    const payload = {
      ...this.editForm,
      taxRate: this.editForm.taxRate
    } as Product;
    this.salesService.saveProduct(this.editForm.id, payload);
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
    this.salesService.saveSupplier(this.supplierForm as Supplier);
    this.editingSupplierId = null;
  }

  // ==========================================
  // STAFF MANAGEMENT STATE
  // ==========================================
  public prepareNewStaff(): void {
    this.staffForm = { username: '', pin: '', role: 'cashier' };
    this.editingStaffId.set('NEW');
  }

  public saveNewStaff(): void {
    if (!this.staffForm.username || !this.staffForm.pin) return;

    const success = this.salesService.registerNewCashier(
      this.staffForm.username,
      this.staffForm.pin,
      this.staffForm.role
    );

    if (!success) {
      alert('A user with that username already exists!');
      return;
    }
    
    this.editingStaffId.set(null);
  }

  // ==========================================
  // HELPERS
  // ==========================================
  public cancelAllEdits(): void {
    this.editingProductId = null;
    this.editingCategoryId = null;
    this.editingSupplierId = null;
    this.editingStaffId.set(null);
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

  // ==========================================
  // CACHE BUSTING & SYNC
  // ==========================================
  public async syncInventory(): Promise<void> {
    const btn = document.getElementById('sync-btn');
    if (btn) btn.style.transform = 'rotate(180deg)';

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('maranth_products');
        localStorage.removeItem('maranth_products_date');
      }

      if (this.salesService.setupDailyProductCache) {
        await this.salesService.setupDailyProductCache();
      }

      setTimeout(() => {
        if (btn) btn.style.transform = 'rotate(0deg)';
      }, 500);

    } catch (error) {
      console.error("Failed to sync:", error);
      alert("Sync failed. Check your connection.");
    }
  }

  public promptLogWaste(product: any): void {
    const qtyStr = window.prompt(`🗑️ LOG WASTE: ${product.name}\n\nEnter the quantity wasted/lost:`);
    if (!qtyStr) return;
    
    const quantity = parseFloat(qtyStr.replace(',', '.'));
    if (isNaN(quantity) || quantity <= 0) return;

    const currentStock = Number(product.stockQuantity || 0);
    if (quantity > currentStock) {
      alert(`Error: You only have ${currentStock} in stock. You cannot log ${quantity} as waste.`);
      return;
    }

    const reason = window.prompt('Enter the reason (e.g., Dropped, Expired, Rotten):') || 'Unspecified Spoilage';

    this.salesService.logSpoilage(product, quantity, reason);
    product.stockQuantity = currentStock - quantity;
    
    alert(`✅ Logged ${quantity} of ${product.name} as waste.`);
  }

  public exportCatalogToCSV(): void {
    const products = this.salesService.products();
    if (!products || products.length === 0) {
      alert('No products to export.');
      return;
    }

    let csvContent = "Category,Product Name,Barcode,Cost Price,Retail Price,Current Stock\n";

    products.forEach(p => {
      const cleanName = p.name ? `"${p.name.replace(/"/g, '""')}"` : '""';
      const category = (p as any).categoryName || p.categoryId || 'Uncategorized';
      const cost = p.costPrice || (p as any).wholesalePrice || (p as any).buyingPrice || 0;
      
      csvContent += `"${category}",${cleanName},"${p.barcode || ''}",${cost},${p.price || 0},${p.stockQuantity || 0}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `maranth_accountant_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}