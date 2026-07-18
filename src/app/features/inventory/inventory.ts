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

  public searchQuery = signal<string>('');
  
  // ⭐ FIXED: Changed from Signals to standard variables so the HTML form works perfectly
  public editingProductId: string | null = null;
  public editForm: Partial<Product> = {};

  public filteredProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allProds = this.salesService.products() || [];
    
    // Limits to 100 to prevent mobile lag!
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
        const element = document.getElementById('prod-card-' + prod.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }

  public saveEdit(): void {
    if (!this.editForm.id || !this.editForm.name || this.editForm.price === undefined) return;
    this.salesService.saveProduct(this.editForm.id, this.editForm as Product);
    this.editingProductId = null;
  }

  public cancelEdit(): void {
    this.editingProductId = null;
  }

  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    return isNaN(parsed) ? '€0.00' : '€' + parsed.toFixed(2);
  }
}