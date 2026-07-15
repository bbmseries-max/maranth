import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';
import { InventoryService } from './inventory.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent implements OnInit {
  public salesService = inject(SalesService);
  public inventoryService = inject(InventoryService);

  public categories = this.inventoryService.categories;
  public suppliers = this.inventoryService.suppliers;
  readonly suppliersList = computed(() => Object.values(this.suppliers()));

  public activeTab = signal<'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'>('PRODUCTS');
  public showExpirationGrid = signal<boolean>(false);

  public formCategory = { id: '', name: '', isActive: true };
  public formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };

  public editingCategory = signal<Category | null>(null);
  public selectedSupplier = signal<Supplier | null>(null);
  public isCreatingNew = signal<boolean>(false);

  public searchQuery = signal<string>('');
  public selectedCategory = signal<string>('ALL');
  public showInactive = signal<boolean>(true);
  public selectedProduct = signal<Product | null>(null);

  public formProduct = {
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

  ngOnInit(): void {
    this.clearAllWorkbenches(); 
  }

  public switchTab(tab: 'PRODUCTS' | 'CATEGORIES' | 'SUPPLIERS'): void {
    this.activeTab.set(tab);
    this.clearAllWorkbenches();  
  }

  public clearAllWorkbenches(): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(null);
    this.editingCategory.set(null);
    this.selectedSupplier.set(null);
    
    this.formProduct = {
      id: '', barcode: '', name: '', price: 0, purchasePrice: 0, taxRate: 1.24,
      categoryId: this.selectedCategory() !== 'ALL' ? this.selectedCategory() : '5622', 
      supplierId: '1', stockQuantity: 0, minStockWarning: 5,
      isActive: true, expire: '', notes: '', isWeighted: false
    };

    this.formCategory = { id: '', name: '', isActive: true };
    this.formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };
  }

  public selectCategoryToEdit(cat: Category): void {
    this.isCreatingNew.set(false);
    this.editingCategory.set(cat);
    this.formCategory = { ...cat, isActive: cat.isActive !== false };
  }

  public prepareNewCategory(): void {
    this.isCreatingNew.set(true);
    this.formCategory = { id: '', name: '', isActive: true };
  }

  public saveCategoryChanges(): void {
    if (!this.formCategory.name) {
      this.salesService.activeModal.set({
        type: 'warning', title: '⚠️ Required Field', message: 'Category Name is mandatory!', value: '', onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    if (this.isCreatingNew()) {
      this.formCategory.id = this.formCategory.id || Math.floor(1000 + Math.random() * 9000).toString();
      if (this.categories().some(c => c.id === this.formCategory.id)) {
        this.salesService.activeModal.set({
          type: 'warning', title: '⚠️ Collision', message: 'ID collision detected. Save again to retry.', value: '', onConfirm: () => this.salesService.closeModal()
        });
        return;
      }
    }

    this.inventoryService.saveCategoryPayload({ ...this.formCategory }, this.isCreatingNew());
    this.clearAllWorkbenches();
    
    this.salesService.activeModal.set({
      type: 'success', title: '✅ Success', message: 'Category registry updated!', value: '', onConfirm: () => this.salesService.closeModal()
    });
  }

  public selectSupplierToEdit(sup: Supplier): void {
    this.isCreatingNew.set(false);
    this.selectedSupplier.set(sup);
    this.formSupplier = { id: sup.id, name: sup.name, contact: sup.contact || '', phone: sup.phone || '', notes: sup.notes || '', isActive: sup.isActive !== false };
  }

  public getSupplierName(supplierId: string | undefined): string {
    if (!supplierId) return 'Unassigned';
    const match = this.suppliers().find(s => s.id === supplierId);
    return match ? match.name : 'Unknown Supplier';
  }

  // ⭐ New function to translate Category IDs to actual names!
  public getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return 'Unassigned';
    const cleanId = categoryId.toString().trim();
    
    const match = this.categories().find(c => 
      c.id?.toString() === cleanId || 
      (c as any).category_id?.toString() === cleanId
    );
    
    if (match && (match.name || (match as any).category_name)) {
      return match.name || (match as any).category_name;
    }
    
    switch (cleanId) {
      case '5605': return 'Shkolla - Lojra';
      case '5619': return 'Xartika kouzinas - Banjo';
      case '5614': return 'Freska Fruta';
      case '5613': return 'Freska laxanika';
      case '5636': return 'Karta ananeosis';
      case '5606': return 'Caj zesto - Rofimata';
      case '5609': return 'Cikles - Karameles';
      case '5622': return 'Idi kapnistou -Pipes - Anaptires';
      case '5627': return 'Zootrofes - Axesuar katikidion';
      case '5635': return 'Veze';
    }
    return `Category ${cleanId}`;
  }

  public prepareNewSupplier(): void {
    this.isCreatingNew.set(true);
    this.formSupplier = { id: '', name: '', contact: '', phone: '', notes: '', isActive: true };
  }

  public saveSupplierChanges(): void {
    if (!this.formSupplier.name) {
      this.salesService.activeModal.set({
        type: 'warning', title: '⚠️ Required Field', message: 'Supplier Business Name is mandatory!', value: '', onConfirm: () => this.salesService.closeModal()
      });
      return;
    }

    if (this.isCreatingNew()) {
      this.formSupplier.id = this.formSupplier.id || Math.floor(100 + Math.random() * 900).toString();
    }

    this.inventoryService.saveSupplierPayload({ ...this.formSupplier }, this.isCreatingNew());
    this.clearAllWorkbenches();
    
    this.salesService.activeModal.set({
      type: 'success', title: '✅ Success', message: 'Supplier directory updated!', value: '', onConfirm: () => this.salesService.closeModal()
    });
  }

  public updateDateOnTheFly(product: Product): void {
    this.salesService.activeModal.set({
      type: 'prompt',
      title: '🗓️ Update Expiration Date',
      message: `Enter new expiration date for ${product.name} (YYYY-MM-DD):`,
      value: product.expire || '',
      onConfirm: (newDate) => {
        if (newDate) {
          this.inventoryService.updateProductExpiry(product.id, newDate);
          if (this.selectedProduct()?.id === product.id) this.formProduct.expire = newDate;
          this.salesService.activeModal.set({
            type: 'success', title: '✅ Date Updated', message: 'Expiration date modified on the fly!', value: '', onConfirm: () => this.salesService.closeModal()
          });
        }
      }
    });
  }

  public getStatusText(dateStr: string | undefined): string {
    if (!dateStr) return 'NOT TRACKED';
    return new Date(dateStr) < new Date() ? 'EXPIRED' : 'Expiring Soon';
  }

  public getStatusClass(dateStr: string | undefined): string {
    if (!dateStr) return 'status-untracked';
    return new Date(dateStr) < new Date() ? 'status-expired' : 'status-warning';
  }

  public handleBarcodeScan(inputValue: string): void {
    this.searchQuery.set(inputValue.trim());
  }

  public managedProducts = computed(() => {
    let items: Product[] = this.salesService.products();
    if (!this.showInactive()) items = items.filter(p => p.isActive !== false);
    if (this.selectedCategory() !== 'ALL') items = items.filter(p => p.categoryId === this.selectedCategory());
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(p => ((p as any).barcode || '').toString().toLowerCase() === query || (p.name || '').toLowerCase().includes(query) || (p.id || '').toString().toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => {
      if (!a.expire && !b.expire) return 0;
      if (!a.expire) return 1;
      if (!b.expire) return -1;
      return new Date(a.expire).getTime() - new Date(b.expire).getTime();
    });
  });

  public getFormProfitMargin(): number {
    const cost = this.formProduct.purchasePrice || 0, retail = this.formProduct.price || 0;
    return retail === 0 ? 0 : ((retail - cost) / retail) * 100;
  }

  public selectProductToEdit(product: Product): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(product);
    this.formProduct = {
      id: product.id?.toString() || '', barcode: (product as any).barcode || product.id?.toString() || '', name: product.name || '', price: product.price || 0,
      purchasePrice: (product as any).purchasePrice || 0, taxRate: (product as any).taxRate || 1.24, categoryId: product.categoryId || '5622',
      supplierId: (product as any).supplierId || '1', stockQuantity: product.stockQuantity || 0, minStockWarning: (product as any).minStockWarning || 5,
      isActive: product.isActive !== false, expire: product.expire || '', notes: (product as any).notes || '', isWeighted: (product as any).isWeighted || false
    };
  }

  public prepareNewProduct(): void {
    this.selectedProduct.set(null);
    this.isCreatingNew.set(true);
    this.formProduct = {
      id: '', barcode: '', name: '', price: 0, purchasePrice: 0, taxRate: 1.24, categoryId: this.selectedCategory() !== 'ALL' ? this.selectedCategory() : '5622',
      supplierId: '1', stockQuantity: 0, minStockWarning: 5, isActive: true, expire: '', notes: '', isWeighted: false
    };
  }

  public isLowStock(prod: any): boolean { return prod.stockQuantity <= (prod.minStockWarning !== undefined ? prod.minStockWarning : 5); }
  public getProductCost(prod: any): number { return prod.purchasePrice || 0; }

  public saveProductChanges(): void {
    if (!this.formProduct.id || !this.formProduct.name) {
      this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Required Fields', message: 'Barcode ID and Product Name are mandatory!', value: '', onConfirm: () => this.salesService.closeModal() });
      return;
    }
    
    if (this.isCreatingNew() && this.salesService.products().some(p => p.id?.toString() === this.formProduct.id.toString())) {
      this.salesService.activeModal.set({ type: 'warning', title: '⚠️ Collision', message: 'Operation Aborted: This Barcode / ID already exists!', value: '', onConfirm: () => this.salesService.closeModal() });
      return;
    }

    const structuredPayload: Product = {
      id: this.formProduct.id, name: this.formProduct.name, price: this.formProduct.price, stockQuantity: this.formProduct.stockQuantity,
      categoryId: this.formProduct.categoryId, isActive: this.formProduct.isActive, expire: this.formProduct.expire,
      ...({ barcode: this.formProduct.barcode, purchasePrice: this.formProduct.purchasePrice, taxRate: this.formProduct.taxRate, supplierId: this.formProduct.supplierId, minStockWarning: this.formProduct.minStockWarning, notes: this.formProduct.notes, isWeighted: this.formProduct.isWeighted } as any)
    };

    this.inventoryService.saveProductPayload(structuredPayload.id, structuredPayload);
    this.selectedProduct.set(null);
    this.isCreatingNew.set(false);
    this.salesService.activeModal.set({ type: 'success', title: '✅ Success', message: 'System Inventory records updated successfully!', value: '', onConfirm: () => this.salesService.closeModal() });
  }

  public toggleProductStatus(): void {
    this.formProduct.isActive = !this.formProduct.isActive;
    this.saveProductChanges();
  }

  public supplierReportSummary = computed(() => {
    const allProducts = this.salesService.products(), allSuppliers = this.suppliers(), today = new Date();
    return allSuppliers.map(sup => {
      const matchingProducts = allProducts.filter(p => (p as any).supplierId === sup.id);
      const lowStockItems = matchingProducts.filter(p => (p.stockQuantity || 0) <= ((p as any).minStockWarning !== undefined ? (p as any).minStockWarning : 5) && p.isActive !== false);
      const criticalExpiryItems = matchingProducts.filter(p => p.expire && (Math.ceil((new Date(p.expire).getTime() - today.getTime()) / (1000 * 3600 * 24)) <= 30));
      return { supplierId: sup.id, supplierName: sup.name, totalCatalogCount: matchingProducts.length, orderRequiredCount: lowStockItems.length, expiryRiskCount: criticalExpiryItems.length, lowStockProducts: lowStockItems, atRiskProducts: criticalExpiryItems };
    });
  });

  public getProductsInEditingCategory(): Product[] {
    const currentCat = this.editingCategory();
    return !currentCat || !currentCat.id ? [] : this.inventoryService.productsByCategoryMap().get(currentCat.id) || [];
  }

  public getExpiryRowClass(dateStr: string | undefined): string {
    if (!dateStr) return 'row-safe';
    const daysRemaining = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysRemaining <= 7 ? 'row-critical' : daysRemaining <= 30 ? 'row-warning' : 'row-safe';
  }
}