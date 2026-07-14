export interface Product {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
  categoryId?: string;
  isActive?: boolean;
  expire?: string;
  barcode?: string;
  sku?: string;
  purchasePrice?: number;
  taxRate?: number;
  supplierId?: string;
  minStockWarning?: number;
  notes?: string;
  isWeighted?: boolean;
  imageUrl?: string;
  
  // UI Display Helpers
  isFirstOfCategory?: boolean;
  displayCategoryName?: string;
}

export interface Category {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  notes?: string;
  isActive?: boolean;
}

export interface BasketItem {
  product: Product;
  quantity: number;
}

export interface TransactionRecord {
  id: string;
  timestamp: string;
  items: BasketItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'Card' | 'Debit';
}