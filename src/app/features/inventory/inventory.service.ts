import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Product, Category, Supplier } from '../../shared/services/pos-data.models';
import { SalesService } from '../../shared/services/sales';

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
    this.salesService.products.update(allProducts => {
      return allProducts.map(p => 
        p.id?.toString() === productId.toString() 
          ? { ...p, expire: newDate } as Product
          : p
      );
    });
  }

  public saveProductPayload(productId: string, structuredPayload: Product): void {
    this.salesService.products.update(allProducts => {
      const exists = allProducts.some(p => p.id?.toString() === productId.toString());
      if (!exists) return [...allProducts, structuredPayload];
      
      return allProducts.map(p => 
        p.id?.toString() === productId.toString() ? structuredPayload : p
      );
    });
  }

  public saveCategoryPayload(structuredPayload: Category, isCreatingNew: boolean): void {
    this.salesService.categories.update(all => {
      if (isCreatingNew) return [...all, structuredPayload];
      return all.map(c => c.id === structuredPayload.id ? structuredPayload : c);
    });
  }

  public saveSupplierPayload(structuredPayload: Supplier, isCreatingNew: boolean): void {
    this.salesService.suppliers.update(all => {
      if (isCreatingNew) return [...all, structuredPayload];
      return all.map(s => s.id === structuredPayload.id ? structuredPayload : s);
    });
  }
}