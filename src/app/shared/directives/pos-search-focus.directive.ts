import { Directive, ElementRef, HostListener, effect, inject, input, output } from '@angular/core';
import { SalesService } from '../services/sales';

@Directive({
  selector: '[appPosSearchFocus]',
  standalone: true
})
export class PosSearchFocusDirective {
  private el = inject(ElementRef<HTMLInputElement>);
  private salesService = inject(SalesService);

  public blockFocus = input<boolean>(false);
  public enableBasketSync = input<boolean>(true);
  public clearSearch = output<void>();

  constructor() {
    effect(() => {
      const trigger = this.salesService.focusSearchTrigger();
      if (this.enableBasketSync() && trigger > 0) {
        this.refocus();
      }
    });

    effect(() => {
      if (this.enableBasketSync() && this.salesService.basket().length === 0) {
        this.refocus();
      }
    });
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.el.nativeElement.value = '';
      this.clearSearch.emit();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const isInteractiveField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!isInteractiveField) {
      this.refocus();
    }
  }

  public refocus(): void {
    if (this.blockFocus() || this.salesService.activeModal()) {
      return;
    }

    setTimeout(() => {
      const inputEl = this.el.nativeElement;
      if (inputEl && document.activeElement !== inputEl) {
        inputEl.focus();
      }
    }, 30);
  }
}