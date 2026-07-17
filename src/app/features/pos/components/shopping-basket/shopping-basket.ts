import { Component, inject, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { SalesService } from '../../../../shared/services/sales';

@Component({
  selector: 'app-shopping-basket',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  // ⭐ IMPORTANT: If your files have ".component" in the name, add it here! 
  // Example: templateUrl: './shopping-basket.component.html'
  templateUrl: './shopping-basket.html',
  styleUrls: ['./shopping-basket.css']
})
export class ShoppingBasketComponent {
  public salesService = inject(SalesService);

  @ViewChild('scrollViewport') private scrollViewport!: ElementRef<HTMLDivElement>;

  constructor() {
    effect(() => {
      const currentBasket = this.salesService.basket();
      setTimeout(() => {
        if (this.scrollViewport?.nativeElement) {
          const el = this.scrollViewport.nativeElement;
          el.scrollTop = el.scrollHeight;
        }
      }, 50);
    });
  }
}