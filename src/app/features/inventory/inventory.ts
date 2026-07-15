import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
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
export class InventoryComponent {
  public salesService = inject(SalesService);
  public inventoryService = inject(InventoryService);

  // 🎯 Allows Angular to grab the barcode input field to auto-focus it
  @ViewChild('newBarcodeFocus') barcodeInputRef!: ElementRef<HTMLInputElement>;

  public activeTab = signal<'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'>('PRODUCTS');

  public managedProducts = this.inventoryService.filteredProducts;
  public categories = this.salesService.categories;
  public suppliers = this.salesService.suppliers;

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

  public switchTab(tab: 'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'): void {
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
      taxRate: 1.24, // Default to 24% VAT
      isWeighted: false
    };

    // 🎯 Wait a tiny fraction of a second for the UI to render, then grab focus!
    setTimeout(() => {
      if (this.barcodeInputRef?.nativeElement) {
        this.barcodeInputRef.nativeElement.focus();
      }
    }, 50);
  }

  // 🎯 Helper to instantly jump the cursor to the next box when you press Enter
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

  public getProductsInEditingCategory(): Product[] {
    const cat = this.editingCategory();
    if (!cat) return [];
    return this.salesService.products().filter(p => p.categoryId === cat.id);
  }

  public prepareNewCategory(): void {
    this.clearAllWorkbenches();
    this.isCreatingNew.set(true);
    this.formCategory = {
      id: Math.floor(Math.random() * 90000) + 10000 + '',
      isActive: true
    };
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
    this.formSupplier = {
      id: Math.floor(Math.random() * 90000) + 10000 + '',
      isActive: true
    };
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
        const rawData = JSON.parse(jsonText);
        
        // 🧠 BULLETPROOF Extractor: Digs through wrappers like {"categories": {...}}
        let extracted = rawData;
        if (!Array.isArray(rawData)) {
          if (rawData.RECORDS) extracted = rawData.RECORDS;
          else if (rawData.data) extracted = rawData.data;
          else if (rawData.items) extracted = rawData.items;
          else if (rawData.categories) extracted = rawData.categories;
          else if (rawData.suppliers) extracted = rawData.suppliers;
          else if (rawData.products) extracted = rawData.products;
        }

        let dataArray: any[] = [];
        if (Array.isArray(extracted)) {
          dataArray = extracted;
        } else if (typeof extracted === 'object' && extracted !== null) {
          dataArray = Object.values(extracted);
        }

        if (dataArray.length === 0) throw new Error("No valid data found in file.");
        
        let importCount = 0;
        const sample = dataArray[0] || {};

        // 🕵️ AUTO-DETECT FILE TYPE (Ignores what tab you are on!)
        let targetType = 'CATEGORIES'; // Default
        
        // Check for Product signatures
        if (sample.Price !== undefined || sample.price !== undefined || sample.Barcode !== undefined || sample.barcode !== undefined || sample.ProductID !== undefined || sample.Blerje !== undefined) {
          targetType = 'PRODUCTS';
        } 
        // Check for Supplier signatures
        else if (sample.Phone !== undefined || sample.phone !== undefined || sample.Contact !== undefined || sample.contact !== undefined || sample.SupplierID !== undefined || sample.CompanyName !== undefined) {
          targetType = 'SUPPLIERS';
        }

        // 🟢 SCENARIO A: PRODUCTS
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
                isWeighted: item.isWeighted === true || item.isWeighted === 'true'
              };
              this.inventoryService.saveProductPayload(itemId, parsedItem);
              importCount++;
            }
          });

          this.salesService.activeModal.set({
            type: 'success', title: '✅ Live Sync Complete', message: `Successfully blasted ${importCount} products straight to Firebase!`, value: '', onConfirm: () => this.salesService.closeModal()
          });

        } 
        // 🔵 SCENARIO B: CATEGORIES
        else if (targetType === 'CATEGORIES') {
          dataArray.forEach(item => {
            const rawId = item.CategoryID || item.categoryId || item.id || item.ID || item.Category_ID;
            if (rawId) {
              const catId = rawId.toString();
              const parsedCat: Category = {
                id: catId,
                name: item.CategoryName || item.categoryName || item.name || item.Name || `Category ${catId}`,
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
        // 🟠 SCENARIO C: SUPPLIERS
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
        
      } catch (error) {
        console.error("JSON Import Error:", error);
        this.salesService.activeModal.set({
          type: 'warning', title: '⚠️ Import Failed', message: 'Could not read the JSON file. Check format.', value: '', onConfirm: () => this.salesService.closeModal()
        });
      }
      
      event.target.value = '';
    };
    
    reader.readAsText(file);
  }
}