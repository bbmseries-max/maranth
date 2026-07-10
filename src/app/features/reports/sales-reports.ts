import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SalesService } from '../../shared/services/sales';

@Component({
  selector: 'app-sales-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sales-reports.html'
})
export class SalesReportsComponent {
  private salesService = inject(SalesService);

// 📈 1. Total Gross Intake (Calculated directly from item arrays to bypass schema property bugs)
public totalGrossRevenue = computed(() => {
  return this.salesService.transactions().reduce((sum, tx) => {
    const txTotal = tx.items.reduce((itemSum, item) => itemSum + ((item.product.price || 0) * item.quantity), 0);
    return sum + txTotal;
  }, 0);
});

  // 📝 2. Break down sales tax and net sales by VAT tier
  public taxReport = computed(() => {
    let gross = 0;
    let net = 0;
    let totalTax = 0;

    const tiers = {
      '24': { net: 0, tax: 0 },
      '13': { net: 0, tax: 0 },
      '6': { net: 0, tax: 0 }
    };

    this.salesService.transactions().forEach(tx => {
     tx.items.forEach(item => {
        // 🚀 Extract fields cleanly from the nested product object
        const price = item.product.price || 0;
        const rate = (item.product as any).taxRate || 24; // Fallback to 24 if taxRate isn't on Product yet
        const itemGross = price * item.quantity;
        
        const itemNet = itemGross / (1 + (rate / 100));
        const itemTax = itemGross - itemNet;

        gross += itemGross;
        net += itemNet;
        totalTax += itemTax;

        const tierKey = rate.toString() as '24' | '13' | '6';
        if (tiers[tierKey]) {
          tiers[tierKey].net += itemNet;
          tiers[tierKey].tax += itemTax;
        }
      });
    });

    return { gross, net, totalTax, tiers };
  });

  public topSellingItems = computed(() => {
    const counts: { [key: string]: { name: string; qty: number; revenue: number } } = {};

    this.salesService.transactions().forEach(tx => {
      tx.items.forEach(item => {
        // 🚀 Extract fields cleanly from the nested product object
        const pId = item.product.id;
        const pName = item.product.name;
        const price = item.product.price || 0;

        if (!counts[pId]) {
          counts[pId] = { name: pName, qty: 0, revenue: 0 };
        }
        counts[pId].qty += item.quantity;
        counts[pId].revenue += (price * item.quantity);
      });
    });

    return Object.values(counts)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  });
}