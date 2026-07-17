import { Component, inject, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { SalesService } from '../../../../shared/services/sales';

@Component({
  selector: 'app-shopping-basket',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  templateUrl: './shopping-basket.html',
  styleUrls: ['./shopping-basket.css']
})
export class ShoppingBasketComponent {
  public salesService = inject(SalesService);

  @ViewChild('scrollViewport') private scrollViewport!: ElementRef<HTMLDivElement>;

  // Safe wrapper for the HTML pipes
  public getSafeGrandTotal(): number {
    const val = this.salesService.grandTotal();
    return isNaN(val) ? 0 : val;
  }

  constructor() {
    effect(() => {
      // Safely access basket to trigger effect
      const currentBasket = this.salesService.basket() || [];
      setTimeout(() => {
        if (this.scrollViewport?.nativeElement) {
          const el = this.scrollViewport.nativeElement;
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    });
  }
}