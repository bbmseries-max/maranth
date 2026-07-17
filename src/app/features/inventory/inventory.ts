import { Component, inject, signal, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { InventoryService } from './inventory.service';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, DecimalPipe],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent implements AfterViewInit {
  public salesService = inject(SalesService);
  public inventoryService = inject(InventoryService);

  @ViewChild('newBarcodeFocus') newProductBarcodeRef!: ElementRef<HTMLInputElement>;
  @ViewChild('barcodeInput') mainSearchInputRef!: ElementRef<HTMLInputElement>;

  public activeTab = signal<'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS' | 'STAFF'>('PRODUCTS');
  public stockFilter = signal<'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'LOW_STOCK'>('ALL');

  public managedProducts = this.inventoryService.filteredProducts;
  
  public displayProducts = computed(() => {
    const baseList = this.managedProducts();
    const filter = this.stockFilter();
    
    if (filter === 'ALL') return baseList;
    
    return baseList.filter(p => {
      if (filter === 'LOW_STOCK') return this.isLowStock(p);
      if (filter === 'EXPIRED') return this.getExpireStatus(p.expire) === 'danger';
      if (filter === 'EXPIRING_SOON') return this.getExpireStatus(p.expire) === 'warning';
      return true;
    });
  });

  public categories = this.salesService.categories;
  public suppliers = this.salesService.suppliers;
  public staffMembers = this.salesService.registeredCashiers;

  public searchQuery = this.inventoryService.searchQuery;
  public selectedCategory = this.inventoryService.selectedCategory;

  public selectedProduct = signal<Product | null>(null);
  public isCreatingNew = signal<boolean>(false);
  public showExpirationGrid = signal<boolean>(false);

  public editingCategory = signal<Category | null>(null);
  public selectedSupplier = signal<Supplier | null>(null);

  public formProduct: Partial<Product> = {};
  public formCategory: Partial<Category> = {};
  public formSupplier: Partial<Supplier> = {};

  ngAfterViewInit() {
    this.focusMainSearchBar();
  }

  // ⭐ THE FIX: Totally clear all services and inputs!
  public focusMainSearchBar(): void {
    setTimeout(() => {
      if (this.activeTab() === 'PRODUCTS' && !this.isCreatingNew() && !this.selectedProduct() && this.mainSearchInputRef?.nativeElement) {
        this.searchQuery.set('');
        this.inventoryService.searchQuery.set(''); 
        this.mainSearchInputRef.nativeElement.value = '';
        this.mainSearchInputRef.nativeElement.focus();
      }
    }, 100);
  }

  public switchTab(tab: 'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS' | 'STAFF'): void {
    this.activeTab.set(tab);
    this.clearAllWorkbenches();
  }

  public clearAllWorkbenches(): void {
    this.selectedProduct.set(null);
    this.editingCategory.set(null);
    this.selectedSupplier.set(null);
    this.isCreatingNew.set(false);
    this.showExpirationGrid.set(false);
    
    this.formProduct = {};
    this.formCategory = {};
    this.formSupplier = {};

    this.focusMainSearchBar();
  }

  public getFormProfitMargin(): number {
    const cost = this.formProduct.purchasePrice || 0;
    const retail = this.formProduct.price || 0;
    if (cost === 0) return 100;
    return ((retail - cost) / cost) * 100;
  }

  public getProductCost(product: Product): number {
    return product.purchasePrice || 0;
  }

  public isLowStock(product: Product): boolean {
    return product.stockQuantity <= (product.minStockWarning || 5);
  }

  public getExpireStatus(expire?: string): 'safe' | 'warning' | 'danger' | 'none' {
    if (!expire) return 'none';
    const expDate = new Date(expire + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'danger';
    if (diffDays <= 14) return 'warning';
    return 'safe';
  }

  public prepareNewProduct(): void {
    this.clearAllWorkbenches();
    this.isCreatingNew.set(true);
    
    this.formProduct = {
      id: Math.floor(Math.random() * 90000) + 10000 + '',
      categoryId: 'ALL',
      isActive: true,
      stockQuantity: 0,
      price: 0,
      purchasePrice: 0,
      taxRate: 1.24, 
      isWeighted: false
    };

    setTimeout(() => {
      if (this.newProductBarcodeRef?.nativeElement) {
        this.newProductBarcodeRef.nativeElement.focus();
      }
    }, 50);
  }

  public focusNext(nextElement: any): void {
    if (nextElement && nextElement.focus) {
      nextElement.focus();
    }
  }

  public selectProductToEdit(product: Product): void {
    this.clearAllWorkbenches();
    this.selectedProduct.set(product); 
    this.formProduct = { ...product };
  }

  public saveProductChanges(): void {
    if (!this.formProduct.name || !this.formProduct.price || !this.formProduct.id) {
      this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Invalid Form', message: 'Product Name, ID, and Price are required fields.', value: '', onConfirm: () => this.salesService.closeModal() });
      return;
    }
    
    const payload: Product = this.formProduct as Product;
    this.inventoryService.saveProductPayload(payload.id, payload);
    this.clearAllWorkbenches();
  }

  public handleBarcodeScan(query: string): void {
    this.searchQuery.set(query);
  }

  public prepareNewCategory(): void {
    this.clearAllWorkbenches();
    this.isCreatingNew.set(true);
    this.formCategory = { id: Math.floor(Math.random() * 90000) + 10000 + '', isActive: true };
  }

  public selectCategoryToEdit(category: Category): void {
    this.clearAllWorkbenches();
    this.editingCategory.set(category);
    this.formCategory = { ...category };
  }

  public saveCategoryChanges(): void {
    if (!this.formCategory.name || !this.formCategory.id) {
       this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Invalid Form', message: 'Category Name and ID are required.', value: '', onConfirm: () => this.salesService.closeModal() });
       return;
    }
    this.inventoryService.saveCategoryPayload(this.formCategory as Category, this.isCreatingNew());
    this.clearAllWorkbenches();
  }

  public prepareNewSupplier(): void {
    this.clearAllWorkbenches();
    this.isCreatingNew.set(true);
    this.formSupplier = { id: Math.floor(Math.random() * 90000) + 10000 + '', isActive: true };
  }

  public selectSupplierToEdit(supplier: Supplier): void {
    this.clearAllWorkbenches();
    this.selectedSupplier.set(supplier);
    this.formSupplier = { ...supplier };
  }

  public saveSupplierChanges(): void {
    if (!this.formSupplier.name || !this.formSupplier.id) {
       this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Invalid Form', message: 'Supplier Company Name and ID are required.', value: '', onConfirm: () => this.salesService.closeModal() });
       return;
    }
    this.inventoryService.saveSupplierPayload(this.formSupplier as Supplier, this.isCreatingNew());
    this.clearAllWorkbenches();
  }

  public toggleStaffApproval(username: string, currentStatus: boolean): void {
     if (username === this.salesService.currentCashier()) {
        this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Action Denied', message: 'You cannot revoke your own Admin access.', value: '', onConfirm: () => this.salesService.closeModal() });
        return;
     }
     this.salesService.toggleCashierApproval(username, !currentStatus);
  }

  public importJsonData(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    this.salesService.activeModal.set({
      type: 'success', title: '⏳ Processing Upload...', message: 'Reading file data. Please wait.', value: '', onConfirm: () => {}
    });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonText = e.target?.result as string;
        let cleanText = jsonText.replace(/^[\uFEFF\u200B]/, '').replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/\\(?!["\\/bfnrtu])/g, '\\\\').replace(/,\s*([\]}])/g, '$1'); 
        const rawData = JSON.parse(cleanText);
        
        let extracted = rawData;
        if (!Array.isArray(rawData)) {
          const foundKey = Object.keys(rawData).find(k => ['records', 'data', 'items', 'categories', 'category', 'suppliers', 'supplier', 'products', 'product'].includes(k.toLowerCase()));
          if (foundKey && Array.isArray(rawData[foundKey])) extracted = rawData[foundKey];
          else extracted = Object.values(rawData).find(val => Array.isArray(val)) || rawData;
        }

        let dataArray: any[] = [];
        if (Array.isArray(extracted)) dataArray = extracted;
        else if (typeof extracted === 'object' && extracted !== null) dataArray = Object.values(extracted);

        if (dataArray.length === 0) throw new Error("No valid data found in file.");
        
        let importCount = 0;
        const sample = dataArray[0] || {};
        let targetType = 'CATEGORIES'; 
        
        if (sample.Price !== undefined || sample.price !== undefined || sample.Barcode !== undefined || sample.barcode !== undefined || sample.ProductID !== undefined || sample.Blerje !== undefined) targetType = 'PRODUCTS';
        else if (sample.Phone !== undefined || sample.phone !== undefined || sample.Contact !== undefined || sample.contact !== undefined || sample.SupplierID !== undefined || sample.CompanyName !== undefined) targetType = 'SUPPLIERS';

        if (targetType === 'PRODUCTS') {
          const normalizeDate = (rawDate: any): string => {
            if (!rawDate) return '';
            const strDate = String(rawDate).trim();
            if (strDate.includes('/')) {
              const parts = strDate.split('/');
              if (parts.length === 3) {
                let year = parts[2];
                if (year.length === 2) year = '20' + year; 
                let month = parts[0].padStart(2, '0');
                let day = parts[1].padStart(2, '0');
                if (parseInt(month) > 12) { const temp = month; month = day; day = temp; }
                return `${year}-${month}-${day}`;
              }
            }
            return strDate;
          };
          
          dataArray.forEach(item => {
            const rawId = item.ProductID || item.id || item.Barcode || item.barcode;
            if (rawId) {
              const itemId = rawId.toString();
              const existingProduct = this.salesService.products().find(p => p.id === itemId);
              
              const parsedItem: Product = {
                id: itemId,
                barcode: (item.Barcode || item.barcode || '').toString(),
                name: item.Product || item.name || 'Unknown Item',
                categoryId: (item.Category || item.categoryId || 'ALL').toString(),
                price: parseFloat(item.Price || item.price) || 0,
                purchasePrice: parseFloat(item.Blerje || item.purchasePrice) || 0,
                stockQuantity: parseFloat(item.Cope || item.stockQuantity) || 0,
                taxRate: parseFloat(item.FPA || item.taxRate) || 1.24,
                afterTaxRate: parseFloat(item.AfterFPA || item.afterTaxRate) || 0,
                expire: normalizeDate(item.Expire || item.expire),
                statusDate: normalizeDate(item.StatusDate || item.statusDate),
                notes: item.Shenime || item.notes || '',
                status: item.Status || item.status || 'Active',
                isActive: (item.Status || item.status) !== 'Inactive',
                isWeighted: existingProduct && existingProduct.isWeighted !== undefined 
                              ? existingProduct.isWeighted 
                              : (item.isWeighted === true || item.isWeighted === 'true')
              };
              this.inventoryService.saveProductPayload(itemId, parsedItem);
              importCount++;
            }
          });

          this.salesService.activeModal.set({
            type: 'success', title: '✅ Live Sync Complete', message: `Successfully blasted ${importCount} products straight to Firebase!`, value: '', onConfirm: () => this.salesService.closeModal()
          });

        } else if (targetType === 'CATEGORIES') {
          dataArray.forEach(item => {
            const rawId = item.CategoryID || item.categoryId || item.id || item.ID || item.Category_ID || ('CAT-' + Math.floor(Math.random() * 90000));
            if (rawId) {
              const catId = rawId.toString();
              const parsedCat: Category = {
                id: catId,
                name: item.CategoryName || item.categoryName || item.name || item.Name || item.category || item.Category || `Category ${catId}`,
                isActive: (item.Status || item.status) !== 'Inactive'
              };
              this.inventoryService.saveCategoryPayload(parsedCat, true);
              importCount++;
            }
          });

          this.salesService.activeModal.set({
            type: 'success', title: '✅ Matrix Sync Complete', message: `Successfully loaded ${importCount} categories into the Firebase Cloud!`, value: '', onConfirm: () => this.salesService.closeModal()
          });
        }
        else if (targetType === 'SUPPLIERS') {
          dataArray.forEach(item => {
            const rawId = item.SupplierID || item.supplierId || item.id || item.ID;
            if (rawId) {
              const supId = rawId.toString();
              const parsedSup: Supplier = {
                id: supId,
                name: item.CompanyName || item.name || item.Name || item.name || `Vendor ${supId}`,
                contact: item.ContactName || item.contact || item.Contact || '',
                phone: item.Phone || item.phone || '',
                notes: item.Notes || item.notes || item.Observations || '',
                isActive: (item.Status || item.status) !== 'Inactive' && item.isActive !== false
              };
              this.inventoryService.saveSupplierPayload(parsedSup, true);
              importCount++;
            }
          });

          this.salesService.activeModal.set({
            type: 'success', title: '✅ Ledger Sync Complete', message: `Successfully loaded ${importCount} suppliers into the Firebase Cloud!`, value: '', onConfirm: () => this.salesService.closeModal()
          });
        }
        
      } catch (error: any) {
        const exactError = error.message || String(error);
        this.salesService.activeModal.set({
          type: 'warning', 
          title: '⚠️ Import Failed', 
          message: `The file broke at this exact spot:\n\n${exactError}\n\nPlease copy this error and send it to me!`, 
          value: '', 
          onConfirm: () => this.salesService.closeModal()
        });
      }
      
      event.target.value = '';
    };
    
    reader.readAsText(file);
  }
}