import { Component, AfterViewInit, inject, signal, computed, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SalesService } from '../../shared/services/sales';
import { Product } from '../../shared/services/pos-data.models';
import { ShoppingBasketComponent } from './components/shopping-basket/shopping-basket';
import { ThemeService } from '../../shared/services/theme.service';
import { PosSearchFocusDirective } from '../../shared/directives/pos-search-focus.directive';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    SlicePipe,
    ShoppingBasketComponent,
    PosSearchFocusDirective
  ],
  templateUrl: './pos.html',
  styleUrls: ['./pos.css']
})
export class PosComponent implements AfterViewInit {
  public salesService = inject(SalesService);
  public themeService = inject(ThemeService);
  public router = inject(Router);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ShoppingBasketComponent) basketComponent?: ShoppingBasketComponent;

  public searchQuery = signal<string>('');
  public selectedCategoryId = signal<string>('ALL');
  public isSidebarMobileOpen = signal<boolean>(false);
  public isMobileBasketOpen = signal<boolean>(false);
  private scanTimer: any = null;

  // Quick edit product modal state
  public editingProduct = signal<Product | null>(null);
  public editForm: Partial<Product> = {};

  // Categories source
  public categories = this.salesService.categories;

  // Daily Shift Note Signal with automatic LocalStorage persistence
  public dailyNote = signal<string>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('maranth_daily_note') || '' : ''
  );

  // Combined modal check for directive focus blocking
  public isAnyLocalModalOpen = computed(() => {
    return !!this.editingProduct() || !!this.basketComponent?.isReturnModalOpen();
  });

  constructor() {
    effect(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('maranth_daily_note', this.dailyNote());
      }
    });

    effect(() => {
      if (this.salesService.basket().length === 0) {
        this.isMobileBasketOpen.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    }, 100);
  }

  public selectCategory(catId: string): void {
    this.selectedCategoryId.set(catId);
    this.searchQuery.set('');
    this.isSidebarMobileOpen.set(false);
    this.salesService.triggerSearchFocus();
  }

  public openQuickEdit(prod: Product, event: Event): void {
    event.stopPropagation();
    this.editingProduct.set(prod);
    this.editForm = { ...prod };
  }

  public closeQuickEdit(): void {
    this.editingProduct.set(null);
    this.editForm = {};
    this.salesService.triggerSearchFocus();
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
      const safeNote = (this.dailyNote() || 'Δεν υπάρχουν σημειώσεις.')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

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
            <pre>${safeNote}</pre>
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

  public checkExpiredGuard(prod: Product): boolean {
    if (this.getExpireStatus(prod.expire) === 'danger') {
      this.salesService.activeModal.set({
        type: 'warning',
        title: '⛔ ΛΗΓΜΕΝΟ ΠΡΟΪΟΝ (EXPIRED)',
        message: `Το προϊόν "${prod.name}" έχει λήξει στις ${prod.expire}! Απαγορεύεται η πώληση.`,
        value: '',
        onConfirm: () => {
          this.salesService.closeModal();
          setTimeout(() => this.salesService.triggerSearchFocus(), 100);
        }
      });
      return false;
    }
    return true;
  }

  public getProductDisplay(name: string): { icon: string; text: string } {
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
    return this.salesService.products().filter(
      p => p.isActive !== false && this.salesService.isProductWeighted(p)
    );
  });

  public filteredCatalogProducts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const categoryId = this.selectedCategoryId();
    let products = this.salesService.products().filter(p => p.isActive !== false);

    if (categoryId !== 'ALL' && !query) {
      products = products.filter(p => p.categoryId === categoryId);
    }

    if (query) {
      products = products.filter(p =>
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(query)) ||
        (p.id && String(p.id).toLowerCase().includes(query)) ||
        (Array.isArray(p.altBarcodes) && p.altBarcodes.some(alt => String(alt).toLowerCase().includes(query)))
      );
    }

    return products;
  });

  public onSearchInput(value: string): void {
    this.searchQuery.set(value);

    if (this.scanTimer) clearTimeout(this.scanTimer);
    const trimmed = value.trim();
    if (trimmed.length < 4) return;

    this.scanTimer = setTimeout(() => {
      // Extract trailing barcode if old search text was sitting in front of a new scan
      const trailingCode = trimmed.match(/([0-9A-Za-z\-]{4,})$/)?.[1] || trimmed;
      const result = this.salesService.scanBarcodeExact(trailingCode);

      if (result === 'added' || result === 'qr_blocked') {
        this.searchQuery.set('');
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.value = '';
        }
        this.salesService.triggerSearchFocus();
      }
    }, 100);
  }

  public onSearchEnter(event: Event): void {
    event.preventDefault();
    if (this.scanTimer) clearTimeout(this.scanTimer);

    const inputEl = event.target as HTMLInputElement;
    const raw = inputEl.value.trim();
    if (!raw) return;

    const trailingCode = raw.match(/([0-9A-Za-z\-]{4,})$/)?.[1] || raw;
    const result = this.salesService.scanBarcodeExact(trailingCode);

    if (result === 'added' || result === 'qr_blocked' || /^\d{4,}$/.test(trailingCode)) {
      this.searchQuery.set('');
      inputEl.value = '';
    }

    this.salesService.triggerSearchFocus();
  }

  public handleProductClick(prod: Product): void {
    if (!this.checkExpiredGuard(prod)) {
      return;
    }

    // Keep searchQuery intact so multiple similar search results remain visible!
    if (this.salesService.isProductWeighted(prod)) {
      this.salesService.activeModal.set({
        type: 'prompt',
        title: '⚖️ Scale Weight (kg)',
        message: `Enter the measured weight for ${prod.name}:`,
        value: '1.000',
        onConfirm: (val) => {
          const weight = parseFloat(val);
          if (!isNaN(weight) && weight > 0) this.salesService.addToBasket(prod, undefined, weight);
          this.salesService.closeModal();
          this.salesService.triggerSearchFocus();
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