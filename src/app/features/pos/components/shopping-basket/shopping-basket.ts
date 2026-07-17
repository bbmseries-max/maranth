import { Component, inject, ViewChild, ElementRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SalesService } from '../../../../shared/services/sales';

@Component({
  selector: 'app-shopping-basket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shopping-basket.html',
  styleUrls: ['./shopping-basket.css']
})
export class ShoppingBasketComponent {
  public salesService = inject(SalesService);

  @ViewChild('scrollViewport') private scrollViewport!: ElementRef<HTMLDivElement>;

  // ⭐ THE ULTIMATE FIX: CUSTOM MONEY FORMATTER
  public formatMoney(amount: any): string {
    if (amount === null || amount === undefined || amount === '') return '€0.00';
    let parsed = Number(amount);
    if (isNaN(parsed)) return '€0.00';
    return '€' + parsed.toFixed(2);
  }

  constructor() {
    effect(() => {
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