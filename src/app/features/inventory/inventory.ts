import { Component, AfterViewInit, ViewChild, ElementRef, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';
import { ThemeService } from '../../shared/services/theme.service';
import { PosSearchFocusDirective } from '../../shared/directives/pos-search-focus.directive';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, PosSearchFocusDirective, RouterLink],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent implements AfterViewInit {
  @ViewChild('invSearchInput') invSearchInput?: ElementRef<HTMLInputElement>;
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

  public filteredSuppliers = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.suppliers();
    return this.suppliers().filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.contact && s.contact.toLowerCase().includes(q)) ||
      (s.phone && String(s.phone).toLowerCase().includes(q))
    );
  });

  public filteredCategories = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.categories();
    return this.categories().filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.id && String(c.id).toLowerCase().includes(q))
    );
  });

  constructor(public themeService: ThemeService) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.invSearchInput?.nativeElement?.focus();
    }, 100);
  }

  public isAnyEditFormOpen(): boolean {
    return (
      this.editingProductId !== null ||
      this.editingCategoryId !== null ||
      this.editingSupplierId !== null ||
      this.editingStaffId() !== null
    );
  }

  public onInventorySearchEnter(event: Event): void {
    event.preventDefault();
    const inputEl = event.target as HTMLInputElement;
    const query = inputEl.value.trim();
    if (!query) return;

    // Block accidental QR code scans from polluting the search filter
    if (this.salesService.isQrCodePayload(query)) {
      this.searchQuery.set('');
      inputEl.value = '';
    }
  }

  // ==========================================
  // VAT / TAX NORMALIZATION HELPERS
  // ==========================================
public extractRawTaxRate(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    return obj.taxRate ?? obj.vatRate ?? obj.FPA ?? obj.vat ?? obj.fpa ?? obj.tax 
        ?? obj.vat_rate ?? obj.tax_rate ?? obj.vatPercent ?? obj.taxPercent 
        ?? obj.fpa_rate ?? obj.fpaRate ?? obj.vat_percent ?? obj.vatPercent 
        ?? obj.FPA_RATE ?? obj.VAT ?? obj.TAX;
  }

 public normalizeTaxRate(rate: any): number | undefined {
    if (rate === undefined || rate === null) return undefined;
    let str = String(rate).trim().replace('%', '');
    if (str === '' || str === 'null' || str === 'undefined' || str === 'NaN') return undefined;
    
    let num = Number(str);
    if (isNaN(num)) return undefined;

    // Handle tax divisor format (e.g. 1.24 -> 0.24, 1.13 -> 0.13, 1.0 -> 0)
    if (num >= 1.0 && num <= 1.5) {
      num = parseFloat((num - 1).toFixed(2));
    } else if (num > 1.5) {
      // Handle percentage format (e.g. 24 -> 0.24, 13 -> 0.13)
      num = parseFloat((num / 100).toFixed(2));
    } else {
      num = parseFloat(num.toFixed(2));
    }

    // Strictly match valid Greek VAT rates (0.24, 0.13, 0.06, 0)
    if (Math.abs(num - 0.24) < 0.01) return 0.24;
    if (Math.abs(num - 0.13) < 0.01) return 0.13;
    if (Math.abs(num - 0.06) < 0.01) return 0.06;
    if (Math.abs(num - 0) < 0.01) return 0;

    // Unrecognized or invalid rate -> treat as missing
    return undefined;
  }

  public formatVatLabel(rate: any): string {
    const rawRate = this.extractRawTaxRate(rate);
    const norm = this.normalizeTaxRate(rawRate);
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
      // 🎯 Extracts AND normalizes raw rate to ensure empty/invalid rates are properly caught
      const rawRate = this.extractRawTaxRate(prod);
      const normRate = this.normalizeTaxRate(rawRate);

      // 🎯 GLOBAL AUDIT MODE: When Missing VAT is enabled, bypass Category & Status filters
      if (missingVatOnly) {
        if (normRate !== undefined) {
          return false; // Has a valid normalized VAT rate -> hide it
        }

        // Apply search query if user typed a name/barcode while auditing
        if (query) {
          const nameMatch = prod.name && prod.name.toLowerCase().includes(query);
          const barcodeMatch = prod.barcode && prod.barcode.toLowerCase().includes(query);
          const idMatch = prod.id && prod.id.toString().toLowerCase().includes(query);
          const altBarcodeMatch = prod.altBarcodes && prod.altBarcodes.some(alt => alt.toLowerCase().includes(query));
          if (!nameMatch && !barcodeMatch && !idMatch && !altBarcodeMatch) return false;
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
        const altBarcodeMatch = prod.altBarcodes && prod.altBarcodes.some(alt => alt.toLowerCase().includes(query));
        if (!nameMatch && !barcodeMatch && !idMatch && !altBarcodeMatch) return false;
      }

      if (query) {
          const nameMatch = prod.name && prod.name.toLowerCase().includes(query);
          const barcodeMatch = prod.barcode && String(prod.barcode).toLowerCase().includes(query);
          const idMatch = prod.id && String(prod.id).toLowerCase().includes(query);
          const altBarcodeMatch = Array.isArray(prod.altBarcodes) && prod.altBarcodes.some(alt => String(alt).toLowerCase().includes(query));
          if (!nameMatch && !barcodeMatch && !idMatch && !altBarcodeMatch) return false;
        }

      return true;
    });
  });

  public toggleEdit(prod: Product): void {
    if (this.editingProductId === prod.id) {
      this.editingProductId = null;
    } else {
      this.editingProductId = prod.id;
      // 🎯 Normalizes the extracted rate so dropdown options (0.24, 0.13, etc.) auto-select correctly!
      const rawRate = this.extractRawTaxRate(prod);
      const normRate = this.normalizeTaxRate(rawRate);

      this.editForm = { 
        ...prod, 
        taxRate: normRate 
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
    const updatedStock = parseFloat((currentStock - quantity).toFixed(3));

    this.salesService.logSpoilage(product, quantity, reason);
    product.stockQuantity = updatedStock;

    if (product.id && product.id !== 'NEW') {
      this.salesService.saveProduct(product.id, {
        ...product,
        stockQuantity: updatedStock
      } as Product);
    }

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

  public printInventoryCountSheet(): void {
    const activeProducts = this.products()
      .filter(p => p.isActive !== false)
      .sort((a, b) => {
        const catA = this.salesService.getCategoryName(a.categoryId);
        const catB = this.salesService.getCategoryName(b.categoryId);
        return catA.localeCompare(catB) || (a.name || '').localeCompare(b.name || '');
      });

    if (activeProducts.length === 0) {
      alert('No active products available to print.');
      return;
    }

    const escapeHtml = (str: any) =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const totalSystemUnits = activeProducts.reduce((sum, p) => sum + (Number(p.stockQuantity) || 0), 0);
    const totalCostValuation = activeProducts.reduce((sum, p) => {
      const qty = Number(p.stockQuantity) || 0;
      const cost = Number(p.costPrice ?? p.purchasePrice ?? 0) || 0;
      return sum + qty * cost;
    }, 0);

    const rowsHtml = activeProducts
      .map((p, index) => {
        const unit = this.salesService.isProductWeighted(p) ? 'kg' : 'pcs';
        const cost = Number(p.costPrice ?? p.purchasePrice ?? 0) || 0;
        const qty = Number(p.stockQuantity) || 0;
        const catName = this.salesService.getCategoryName(p.categoryId);

        return `
          <tr>
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(catName)}</td>
            <td class="mono">${escapeHtml(p.barcode || p.id)}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td class="right">${qty} ${unit}</td>
            <td class="count-box"></td>
            <td class="count-box"></td>
            <td class="right">€${cost.toFixed(2)}</td>
            <td class="right">€${(qty * cost).toFixed(2)}</td>
          </tr>
        `;
      })
      .join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentYear = new Date().getFullYear();
    printWindow.document.write(`
      <html>
        <head>
          <title>Ετήσια Απογραφή Αποθήκης ${currentYear} - Maranth POS</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #111; font-size: 11px; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
            .header h1 { margin: 0; font-size: 18px; }
            .meta { text-align: right; font-size: 11px; line-height: 1.4; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 5px 6px; }
            th { background: #f1f5f9; font-weight: bold; text-align: left; font-size: 10px; text-transform: uppercase; }
            .center { text-align: center; }
            .right { text-align: right; }
            .mono { font-family: monospace; font-size: 10px; }
            .count-box { width: 75px; background: #fafafa; }
            .summary { margin-top: 14px; display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; border-top: 2px solid #111; padding-top: 8px; }
            .signatures { margin-top: 28px; display: flex; justify-content: space-between; }
            .sig-line { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>🍊 MARANTH POS — ΦΥΛΛΟ ΕΤΗΣΙΑΣ ΑΠΟΓΡΑΦΗΣ (${currentYear})</h1>
              <div>Σύνολο Ενεργών Κωδικών: <strong>${activeProducts.length}</strong></div>
            </div>
            <div class="meta">
              <div><strong>Ημερομηνία Εκτύπωσης:</strong> ${new Date().toLocaleString('el-GR')}</div>
              <div><strong>Υπεύθυνος:</strong> ${escapeHtml(this.salesService.currentCashier() || 'Admin')}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th class="center">#</th>
                <th>Κατηγορία</th>
                <th>Barcode / SKU</th>
                <th>Περιγραφή Είδους</th>
                <th class="right">Υπόλοιπο POS</th>
                <th class="center">Φυσική Καταμέτρηση</th>
                <th class="center">Διαφορά (+/-)</th>
                <th class="right">Τιμή Κόστους</th>
                <th class="right">Αξία Αποθέματος</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="summary">
            <div>Συνολικές Μονάδες Συστήματος: ${totalSystemUnits.toFixed(2)}</div>
            <div>Συνολική Αποτίμηση Κόστους: €${totalCostValuation.toFixed(2)}</div>
          </div>

          <div class="signatures">
            <div class="sig-line">Υπογραφή Καταμετρητή</div>
            <div class="sig-line">Υπογραφή Υπευθύνου Καταστήματος</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
  
}