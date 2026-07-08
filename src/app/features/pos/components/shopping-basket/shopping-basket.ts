import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SalesService, BasketItem } from '../../../../shared/services/sales';

@Component({
  selector: 'app-shopping-basket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shopping-basket.html',
  styleUrls: ['./shopping-basket.css']
})
export class ShoppingBasketComponent {
  private salesService = inject(SalesService);

  // 🎯 This maps the service's "basket" to your component's "basketItems"
  public basketItems = this.salesService.basket;   
  public totalAmount = this.salesService.subtotal;  

  public increaseQuantity(item: BasketItem): void {
    // Correct: uses local component property
    const current = this.basketItems(); 
    const found = current.find(i => i.product.id === item.product.id);
    if (found) {
      found.quantity++;
      this.basketItems.set([...current]);
    }
  }

  public decreaseQuantity(item: BasketItem): void {
    // Correct: uses local component property
    const current = this.basketItems(); 
    const found = current.find(i => i.product.id === item.product.id);
    if (found) {
      if (found.quantity > 1) {
        found.quantity--;
        this.basketItems.set([...current]);
      } else {
        this.basketItems.set(current.filter(i => i.product.id !== item.product.id));
      }
    }
  }

  public processCheckout(): void {
    this.salesService.clearBasket();
    alert('Sale completed successfully!');
  }
}