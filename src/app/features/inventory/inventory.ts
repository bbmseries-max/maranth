import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css']
})
export class InventoryComponent {
  public salesService = inject(SalesService);

  // Search and Filter
  public searchQuery = signal<string>('');
  
  // The product currently being edited
  public editingProductId = signal<string | null>(null);
  public editForm = signal<Partial<Product>>({});

 public filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allProds = this.salesService.products() || [];
    
    // If no search, only show the first 100 items so the phone doesn't crash!
    if (!query) return allProds.slice(0, 100);

    // If searching, search the ENTIRE 3,487 catalog and show results!
    return allProds.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) || 
      (p.barcode && p.barcode.toLowerCase().includes(query)) ||
      (p.id && p.id.toString().toLowerCase().includes(query))
    ).slice(0, 100); // Also limits search results to top 100 for speed
  });

  // Toggle the edit form and trigger the smooth scroll
  public toggleEdit(prod: Product): void {
    if (this.editingProductId() === prod.id) {
      // If tapping the same product, close it
      this.editingProductId.set(null);
    } else {
      // Open the new product
      this.editingProductId.set(prod.id);
      this.editForm.set({ ...prod });

      // Wait a tiny fraction of a second for the DOM to expand, then smooth scroll!
      setTimeout(() => {
        const element = document.getElementById('prod-card-' + prod.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  // Save changes and close the accordion
  public saveEdit(): void {
    const currentForm = this.editForm();
    if (!currentForm.id || !currentForm.name || currentForm.price === undefined) return;
    
    this.salesService.saveProduct(currentForm.id, currentForm as Product);
    this.editingProductId.set(null);
  }

  public cancelEdit(): void {
    this.editingProductId.set(null);
  }

  // Helper formatting
  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    return isNaN(parsed) ? '€0.00' : '€' + parsed.toFixed(2);
  }
}