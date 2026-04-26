export interface Shipment {
  id: number;
  orderId: number;
  warehouse: string;
  mode: string;
  trackingNumber?: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED';
}
