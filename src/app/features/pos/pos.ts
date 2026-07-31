import { Component, OnInit, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';
import { ThemeService } from '../../shared/services/theme.service';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyPipe, DatePipe, SlicePipe, ShoppingBasketComponent],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements OnInit, AfterViewInit {
  public salesService = inject(SalesService);
  public themeService = inject(ThemeService);
  public router = inject(Router);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  public searchQuery = signal<string>('');
  public selectedCategoryId = signal<string>('ALL');
  public isSidebarMobileOpen = signal<boolean>(false); 
  public isMobileBasketOpen = signal<boolean>(false);

  // Quick edit product modal state
  public editingProduct = signal<Product | null>(null);
  public editForm: Partial<Product> = {};

  // Categories source
  public categories = this.salesService.categories;

  // Daily Shift Note Signal with automatic LocalStorage persistence
  public dailyNote = signal<string>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('maranth_daily_note') || '' : ''
  );

  constructor() {
    // Auto-save daily note to LocalStorage
    effect(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('maranth_daily_note', this.dailyNote());
      }
    });

    // Auto-focus search input when trigger changes
    effect(() => {
      const trigger = this.salesService.focusSearchTrigger();
      if (trigger > 0 && !this.salesService.activeModal() && !this.editingProduct() && this.searchInput?.nativeElement) {
        setTimeout(() => {
          this.searchQuery.set('');
          this.searchInput.nativeElement.value = '';
          this.searchInput.nativeElement.focus();
        }, 50);
      }
    });

    // Auto-focus search input when basket becomes empty
    effect(() => {
      if (this.salesService.basket().length === 0) {
        this.isMobileBasketOpen.set(false);
        setTimeout(() => {
          this.searchQuery.set('');
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.value = '';
            this.searchInput.nativeElement.focus();
          }
        }, 50);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.searchInput?.nativeElement) this.searchInput.nativeElement.focus();
    }, 100);
  }

  public selectCategory(catId: string): void {
    this.selectedCategoryId.set(catId);
    this.searchQuery.set('');
    this.isSidebarMobileOpen.set(false);
  }

  public openQuickEdit(prod: Product, event: Event): void {
    event.stopPropagation();
    this.editingProduct.set(prod);
    this.editForm = { ...prod };
  }

  public closeQuickEdit(): void {
    this.editingProduct.set(null);
    this.editForm = {};
  }

  public saveQuickEdit(): void {
    if (this.editForm.id) {
      const updatedProduct = {
        ...this.editingProduct(),
        ...this.editForm
      } as Product;
      this.salesService.saveProduct(this.editForm.id, updatedProduct);
    }
    this.closeQuickEdit();
  }

  public clearDailyNote(): void {
    this.dailyNote.set('');
  }

  public printDailyNote(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Σημειώσεις Βάρδιας - ${new Date().toLocaleDateString()}</title>
            <style>
              body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
              h2 { border-bottom: 2px solid #333; padding-bottom: 8px; }
              pre { font-family: inherit; white-space: pre-wrap; font-size: 16px; }
            </style>
          </head>
          <body>
            <h2>🍊 Maranth POS - Σημειώσεις Βάρδιας / Ημέρας</h2>
            <p><strong>Ημερομηνία:</strong> ${new Date().toLocaleString('el-GR')}</p>
            <hr />
            <pre>${this.dailyNote() || 'Δεν υπάρχουν σημειώσεις.'}</pre>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  public getLiveProduct(prod: Product): Product {
    return this.salesService.products().find(p => p.id === prod.id) || prod;
  }

  public getExpireStatus(expireDate?: string): 'danger' | 'warning' | 'safe' | 'none' {
    if (!expireDate) return 'none';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expireDate);
    exp.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays <= 0) return 'danger';
    if (diffDays <= 7) return 'warning';
    return 'safe';
  }

  public getProductDisplay(name: string): { icon: string, text: string } {
    const nameLower = (name || '').toLowerCase();
    let icon = '📦';
    if (nameLower.includes('τοματ') || nameLower.includes('tomat')) icon = '🍅';
    else if (nameLower.includes('μήλ') || nameLower.includes('appl')) icon = '🍎';
    else if (nameLower.includes('μπαν') || nameLower.includes('banan')) icon = '🍌';
    else if (nameLower.includes('τυρ') || nameLower.includes('φετ') || nameLower.includes('chees')) icon = '🧀';
    else if (nameLower.includes('ψωμ') || nameLower.includes('bread')) icon = '🍞';
    else if (nameLower.includes('καφ') || nameLower.includes('coffe')) icon = '☕';
    else if (nameLower.includes('νερο') || nameLower.includes('water')) icon = '💧';
    else if (nameLower.includes('πορτοκ') || nameLower.includes('orang')) icon = '🍊';

    return { icon, text: name };
  }

  public getPinnedProducts = computed(() => {
    return this.salesService.products().filter(p => p.isActive !== false && p.isPinned === true);
  });

  public weightedProducts = computed(() => {
    return this.salesService.products().filter(p => p.isActive !== false && (p.isWeighted === true || String(p.isWeighted) === 'true'));
  });

  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categoryId = this.selectedCategoryId();
    let products = this.salesService.products().filter(p => p.isActive !== false);

    // Filter by category if query is empty
    if (categoryId !== 'ALL' && !query) {
      products = products.filter(p => p.categoryId === categoryId);
    }

    // Filter by search query across name, barcode, ID, and altBarcodes
    if (query) {
      products = products.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.id && p.id.toString().toLowerCase().includes(query)) ||
        (p.altBarcodes && p.altBarcodes.some(alt => alt.toLowerCase().includes(query)))
      );
    }

    return products;
  });

  public onSearchEnter(event: Event): void {
    event.preventDefault(); // Prevent page refresh
    const inputEl = event.target as HTMLInputElement;
    const query = inputEl.value.trim();
    if (!query) return;

    const matchedExact = this.salesService.scanBarcodeExact(query);
    if (matchedExact) {
      this.searchQuery.set('');
      inputEl.value = '';
    }
  }

  public handleProductClick(prod: Product): void {
    this.searchQuery.set('');
    if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';

    const isScaled = prod.isWeighted === true || String(prod.isWeighted).toLowerCase() === 'true';
    if (isScaled) {
      this.salesService.activeModal.set({
        type: 'prompt',
        title: '⚖️ Scale Weight (kg)',
        message: `Enter the measured weight for ${prod.name}:`,
        value: '1.000',
        onConfirm: (val) => {
          const weight = parseFloat(val);
          if (!isNaN(weight) && weight > 0) this.salesService.addToBasket(prod, undefined, weight);
          this.salesService.closeModal();
          setTimeout(() => this.salesService.triggerSearchFocus(), 100);
        }
      });
    } else {
      this.salesService.addToBasket(prod);
    }
  }

  public formatMoney(amount: any): string {
    const num = Number(amount);
    return isNaN(num) ? '€0.00' : '€' + num.toFixed(2);
  }

  public onLogout(): void {
    this.salesService.logoutCashier();
    this.router.navigate(['/login']);
  }
}