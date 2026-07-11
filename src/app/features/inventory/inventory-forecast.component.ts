import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common'; // Required for basic template features
import { FormsModule } from '@angular/forms';     // Required for [(ngModel)] working smoothly

@Component({
  selector: 'app-inventory-forecast',
  standalone: true,                            // 🌟 Marks it as standalone
  imports: [CommonModule, FormsModule],        // 🌟 Fixes NG8002 by declaring imports locally
  templateUrl: './inventory-forecast.component.html',
  styles: []                                   // 🌟 Fixes NG2008 by bypassing missing CSS file
})
export class InventoryForecastComponent implements OnInit {
  startDate: string = '';
  endDate: string = '';
  allProducts: any[] = []; // Loaded from your products.json
  filteredProducts: any[] = [];

  // Emits an event to the parent component when the close button is clicked
  @Output() close = new EventEmitter<void>();

  ngOnInit() {
    this.calculateDefaultDates();
    this.runFilter();
  }

  calculateDefaultDates() {
    const today = new Date();
    
    // 2 Months Behind
    const past = new Date();
    past.setMonth(today.getMonth() - 2);
    this.startDate = past.toISOString().split('T')[0];

    // 3 Months Ahead
    const future = new Date();
    future.setMonth(today.getMonth() + 3);
    this.endDate = future.toISOString().split('T')[0];
  }

  runFilter() {
    if (!this.startDate || !this.endDate) return;

    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    this.filteredProducts = this.allProducts.filter(product => {
      // 🌟 Aligned to look for .expire property key to match your database schema
      if (!product.expire) return false;
      const expDate = new Date(product.expire);
      return expDate >= start && expDate <= end;
    });
  }

  // 🌟 Handles string | undefined to eliminate TS2345 strict parameters
  getStatusText(dateStr: string | undefined): string {
    if (!dateStr) return 'NOT TRACKED';
    const today = new Date();
    const expDate = new Date(dateStr);
    return expDate < today ? 'EXPIRED' : 'Expiring Soon';
  }

  // 🌟 Handles string | undefined to eliminate TS2345 strict parameters
  getStatusClass(dateStr: string | undefined): string {
    if (!dateStr) return 'badge-secondary';
    const today = new Date();
    const expDate = new Date(dateStr);
    return expDate < today ? 'badge-danger' : 'badge-warning';
  }

  closeForecast(): void {
    this.close.emit();
  }

  openQuickDateEdit(product: any) {
    // 🌟 Aligned to use .expire property key
    const currentValidDate = product.expire || '';
    const newDate = prompt(`Enter new expiration date for ${product.name} (YYYY-MM-DD):`, currentValidDate);
    
    if (newDate !== null) {
      product.expire = newDate; 
      this.runFilter(); // Refresh grid instantly
    }
  }
}