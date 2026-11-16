import { Component, inject, ViewChild, ElementRef, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesService } from '../../../../shared/services/sales';

export interface SupplierOption {
  afm: string;
  legalName: string;
  doy: string;
  address: {
    street: string;
    number: string;
    postalCode: string;
    city: string;
  };
}

@Component({
  selector: 'app-shopping-basket',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shopping-basket.html',
  styleUrls: ['./shopping-basket.css']
})
export class ShoppingBasketComponent {
  public salesService = inject(SalesService);

  @ViewChild('scrollViewport') private scrollViewport!: ElementRef<HTMLDivElement>;

  // Bridge & Modal states
  public isReturnModalOpen = signal<boolean>(false);
  public isDispatching = signal<boolean>(false);
  public dispatchStatus = signal<string | null>(null);

  // Common Greek vendor presets for 1-click selection
  public readonly vendorPresets: SupplierOption[] = [
    {
      afm: '094019245',
      legalName: 'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ Α.Ε.',
      doy: 'ΦΑΕ ΑΘΗΝΩΝ',
      address: { street: 'Λεωφ. Κηφισίας', number: '99', postalCode: '15124', city: 'Μαρούσι' }
    },
    {
      afm: '094002644',
      legalName: 'ΑΘΗΝΑΪΚΗ ΖΥΘΟΠΟΙΙΑ Α.Ε.',
      doy: 'ΦΑΕ ΑΘΗΝΩΝ',
      address: { street: 'Λεωφ. Κηφισού', number: '102', postalCode: '12241', city: 'Αιγάλεω' }
    }
  ];

  public selectedSupplier = signal<SupplierOption>(this.vendorPresets[0]);
  public customAfm = signal<string>('');
  public customLegalName = signal<string>('');

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

  public openReturnModal(): void {
    if (this.salesService.basket().length === 0) return;
    this.dispatchStatus.set(null);
    this.isReturnModalOpen.set(true);
  }

  public closeReturnModal(): void {
    this.isReturnModalOpen.set(false);
    this.salesService.triggerSearchFocus();
  }

  /**
   * Fires the return cart through the BroadcastChannel to Maranth Timologio
   */
 public async dispatchToTimologio(): Promise<void> {
    const basket = this.salesService.basket();
    if (basket.length === 0) return;

    this.isDispatching.set(true);
    this.dispatchStatus.set('Σύνδεση με το Τιμολόγιο...');

    const supplier: SupplierOption = this.customAfm().trim()
      ? {
          afm: this.customAfm().trim(),
          legalName: this.customLegalName().trim() || 'ΠΡΟΜΗΘΕΥΤΗΣ',
          doy: 'ΑΘΗΝΩΝ',
          address: { street: 'Έδρα', number: '1', postalCode: '10564', city: 'ΑΘΗΝΑ' }
        }
      : this.selectedSupplier();

    const tenantId = 'tenant_minimarket';
    const messageId = crypto.randomUUID();

    // Set documentType to 9.3 (Autonomous Dispatch Note for Supplier Returns)
    const payload = {
      version: '1.0',
      tenantId: tenantId,
      messageId: messageId,
      documentType: '9.3',
      movementPurpose: 4, // 4 = Επιστροφή in AADE table
      supplier: supplier,
      movement: {
        movePurpose: 4,
        dispatchDateTime: new Date().toISOString().substring(0, 16),
        vehicleNumber: ''
      },
      transport: {
        vehiclePlate: ''
      },
      items: basket.map((b) => ({
        barcode: (b.product as any).barcode || '',
        description: b.product.name + (b.isRefund ? ' (Επιστροφή)' : ''),
        quantity: b.quantity,
        unitPrice: Number(b.product.price || 0),
        vatRate: (b.product as any).taxRate ?? 13,
        reason: b.isRefund ? 'DEFECTIVE' : 'RETURN'
      }))
    };

    // 1. Dual Dispatch: BroadcastChannel (for already-open tabs) + Window Open (for fresh tab)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bus = new BroadcastChannel('maranth_cart_handover_bus');
        bus.postMessage({
          type: 'MARANTH_CART_HANDOVER',
          payload: payload,
          correlationId: messageId
        });
        setTimeout(() => bus.close(), 10000);
      } catch (e) {
        console.warn('[Cart Dispatch] BroadcastChannel error:', e);
      }
    }

    // Resolve Timologio URL dynamically
    const isPosLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const timologioOrigin = isPosLocal 
      ? 'http://localhost:4201' 
      : 'https://maranth-timologio.vercel.app';

    const encodedPayload = encodeURIComponent(
      btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    );

    const timologioWin = window.open(
      `${timologioOrigin}/?handover=${encodedPayload}`,
      'maranth_timologio'
    );

    // 2. Cross-Window ACK Listener with Retry Pulsing
    let intervalId: any;

    const ackPromise = new Promise<boolean>((resolve, reject) => {
      const handleAck = (event: MessageEvent) => {
        if (event.origin !== timologioOrigin && !event.origin.includes('localhost') && !event.origin.includes('127.0.0.1')) {
          return;
        }

        if (event.data?.type === 'MARANTH_HANDOVER_ACK' && event.data?.correlationId === messageId) {
          clearInterval(intervalId);
          window.removeEventListener('message', handleAck);
          if (event.data.status === 'ACCEPTED') {
            resolve(true);
          } else {
            reject(new Error(event.data.error || 'Απορρίφθηκε από το Τιμολόγιο'));
          }
        }
      };

      window.addEventListener('message', handleAck);

      // Timeout safety (6s for cold tab boot)
      setTimeout(() => {
        clearInterval(intervalId);
        window.removeEventListener('message', handleAck);
        reject(new Error('Το Maranth Timologio δεν αποκρίθηκε. Βεβαιωθείτε ότι είναι ανοιχτό στο ' + timologioOrigin));
      }, 6000);
    });

    // 3. Pulse postMessage every 250ms until ACK arrives
    intervalId = setInterval(() => {
      if (timologioWin && !timologioWin.closed) {
        timologioWin.postMessage(
          {
            type: 'MARANTH_HANDOVER_REQUEST',
            payload: payload,
            correlationId: messageId
          },
          timologioOrigin
        );
      }
    }, 250);

    try {
      await ackPromise;
      this.dispatchStatus.set('✓ Επιτυχής αποστολή!');

      setTimeout(() => {
        if (typeof (this.salesService as any).clearBasket === 'function') {
          (this.salesService as any).clearBasket();
        }
        this.isDispatching.set(false);
        this.closeReturnModal();
      }, 800);
    } catch (err: any) {
      this.isDispatching.set(false);
      this.dispatchStatus.set(err.message || 'Σφάλμα διαβίβασης');
    }
  }
}