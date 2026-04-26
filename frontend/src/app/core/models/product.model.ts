export interface Product {
  id: number;
  name: string;
  sku: string;
  description?: string;
  imageUrl?: string;
  unitPrice: number;
  stockQuantity: number;
  categoryId?: number;
  categoryName?: string;
  storeId?: number;
}
