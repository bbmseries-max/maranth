import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';
import { SalesService } from '../../shared/services/sales';
import { ThemeService } from '../../shared/services/theme.service';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private http = inject(HttpClient);
  public salesService = inject(SalesService);

  public products = this.salesService.products;
  public categories = this.salesService.categories;
  public suppliers = this.salesService.suppliers;

  public searchQuery = signal<string>('');
  public selectedCategory = signal<string>('ALL');

  public filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.selectedCategory();
    
    return this.products().filter(product => {
      const matchesCategory = category === 'ALL' || product.categoryId === category;
      const matchesQuery = !query || 
        product.name.toLowerCase().includes(query) || 
        (product as any).barcode?.includes(query) || 
        product.id?.toString().includes(query);
        
      return matchesCategory && matchesQuery;
    });
  });

  public productsByCategoryMap = computed(() => {
    const allProducts = this.products() || []; 
    const categoryMap = new Map<string, Product[]>();

    allProducts.forEach(product => {
      if (product.categoryId) {
        if (!categoryMap.has(product.categoryId)) {
          categoryMap.set(product.categoryId, []);
        }
        categoryMap.get(product.categoryId)?.push(product);
      }
    });

    return categoryMap;
  });

  public loadInventoryData(): void {
  }

  public updateProductExpiry(productId: string | undefined, newDate: string): void {
    if (!productId) return;
    this.salesService.updateProductExpiry(productId, newDate);
  }

  public saveProductPayload(productId: string, structuredPayload: Product): void {
    this.salesService.saveProduct(productId, structuredPayload);
  }

  public saveCategoryPayload(structuredPayload: Category, isCreatingNew: boolean): void {
    this.salesService.saveCategory(structuredPayload);
  }

  public saveSupplierPayload(structuredPayload: Supplier, isCreatingNew: boolean): void {
    this.salesService.saveSupplier(structuredPayload);
  }
}