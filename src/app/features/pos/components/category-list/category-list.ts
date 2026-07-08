import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Category } from '../../../../shared/services/pos-data.models';
import { SalesService } from '../../../../shared/services/sales';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './category-list.html',
  styleUrls: ['./category-list.css']
})
export class CategoryListComponent {
  private salesService = inject(SalesService);

  // Expose the raw array out of your parent component load stream
  @Input() categories: Category[] = [];

  // Expose reactive helpers directly to the HTML template layout
  public currentCategory = this.salesService.currentCategory;

  public selectCategory(id: string): void {
    this.salesService.selectCategory(id);
  }
}