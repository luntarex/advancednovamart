export interface Order {
  id: number;
  userId: number;
  storeId: number;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  grandTotal: number;
  paymentMethod: string;
  orderDate: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  productId: number;
  productName?: string;
  quantity: number;
  price: number;
}
