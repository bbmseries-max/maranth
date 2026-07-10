export interface Category {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  notes: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  barcode: string;
  categoryId: string;
  companyId?: string;
  name: string;
  price: number;
  stockQuantity: number;
  purchasePrice: number;
  taxRate: number;
  isActive: boolean;
  expire?: string;
  notes?: string;
}

export interface BasketItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  taxRate: number; // 🚀 Add this line (e.g., 24, 13, or 6)
  // ... keep any other existing fields like barcode or unit
}

export interface SupplierJsonData {
  [key: string]: Supplier;
}

export interface ProductJsonData {
  [key: string]: Product;
}