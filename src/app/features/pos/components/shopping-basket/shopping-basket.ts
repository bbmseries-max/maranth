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

  // ⭐ Grab the scrolling container from the HTML
  @ViewChild('scrollViewport') private scrollViewport!: ElementRef<HTMLDivElement>;

  constructor() {
    // ⭐ THE FIX: Auto-Scroll to the bottom!
    // This effect runs automatically every time the basket contents change.
    effect(() => {
      // 1. Read the basket to trigger the tracking
      const currentBasket = this.salesService.basket();
      
      // 2. Wait 50 milliseconds for Angular to finish drawing the new HTML row
      setTimeout(() => {
        if (this.scrollViewport?.nativeElement) {
          const el = this.scrollViewport.nativeElement;
          // 3. Force the scrollbar to the absolute bottom
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    });
  }
}