import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PosComponent } from '../../features/pos/pos'; 
import { Product } from '../../shared/services/pos-data.models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent {
  private posService = inject(PosComponent);

  // Search & Filter UI states
  public searchQuery = signal<string>('');
  public selectedCategory = signal<string>('ALL');
  public showInactive = signal<boolean>(true);

  // State tracker for the Editor Form on the right panel
  public selectedProduct = signal<Product | null>(null);
  public isCreatingNew = signal<boolean>(false);

  // 🎯 CLEANED: Form model matches your core model schema exactly (No suppliers!)
  public formProduct = {
    id: '',
    barcode: '',
    name: '',
    price: 0,
    purchasePrice: 0,
    taxRate: 24,
    categoryId: '',
    stockQuantity: 0,
    isActive: true,
    expire: '',
    notes: ''
  };

  /**
   * 🔍 Dynamically computes and filters rows for your manager grid dashboard
   */
  public managedProducts = computed(() => {
    let items: Product[] = (this.posService as any).products(); 

    // Apply active soft-delete filters
    if (!this.showInactive()) {
      items = items.filter(p => p.isActive !== false);
    }

    // Intersect Category queries
    if (this.selectedCategory() !== 'ALL') {
      items = items.filter(p => p.categoryId === this.selectedCategory());
    }

    // Intersect Search matching text string or precise barcode indexes
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      items = items.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.id.toString().includes(query)
      );
    }

    return items;
  });

  /**
   * 🎯 Loads an item configuration straight into the action editor form panel
   */
  public selectProductToEdit(product: any): void {
    this.isCreatingNew.set(false);
    this.selectedProduct.set(product);
    
    this.formProduct = { 
      ...product, 
      barcode: product.barcode || product.id || '',
      isActive: product.isActive !== false 
    };
  }

  /**
   * ✨ Resets form bindings to prepare a blank matrix slot for new merchandise arrivals
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
      categoryId: 'DRINKS',
      stockQuantity: 0,
      isActive: true,
      expire: '',
      notes: ''
    };
  }

  /**
   * 💾 Commits the modified editor state straight into your core products signal network
   */
  public saveProductChanges(): void {
    if (!this.formProduct.id || !this.formProduct.name) {
      alert('⚠️ Barcode Identification and Product Name strings are mandatory fields!');
      return;
    }

    (this.posService as any).products.update((allProducts: any[]) => {
      if (this.isCreatingNew()) {
        if (allProducts.some(p => p.id === this.formProduct.id)) {
          alert('⚠️ This product barcode tracking index already exists inside your inventory!');
          return allProducts;
        }
        return [...allProducts, { ...this.formProduct }];
      } else {
        return allProducts.map(p => p.id === this.formProduct.id ? { ...this.formProduct } : p);
      }
    });

    this.selectedProduct.set(null);
    this.isCreatingNew.set(false);
    alert('📋 System Inventory records mutated successfully!');
  }
}