import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Order } from '../../../core/models/order.model';
import { Shipment } from '../../../core/models/shipment.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { OrderService } from '../../../core/services/order/order.service';
import { ShipmentService } from '../../../core/services/shipmemt/shipment.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type ShipmentView = Shipment & {
  userId?: number;
  storeId?: number;
  lastUpdated: string;
  estimatedDelivery: string;
};

@Component({
  selector: 'app-shipment-tracking',
  imports: [FormsModule, DatePipe, DecimalPipe, DropdownComponent],
  templateUrl: './shipment-tracking.html',
  styleUrl: './shipment-tracking.css',
})
export class ShipmentTracking {
  private readonly auth = inject(AuthService);
  private readonly shipmentService = inject(ShipmentService);
  private readonly orderService = inject(OrderService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly shipments = signal<ShipmentView[]>([]);
  readonly ordersById = signal<Record<number, Order>>({});

  readonly role = computed(() => this.auth.getUserRole());
  readonly userId = computed(() => Number(this.auth.getUserId() ?? 0));
  readonly canManageFulfillment = computed(() => this.role() === 'CORPORATE' || this.role() === 'ADMIN');
  readonly isIndividual = computed(() => this.role() === 'INDIVIDUAL');

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'ALL' | Shipment['status']>('ALL');
  readonly selectedShipmentId = signal<number | null>(null);

  readonly statusOptions: DropdownOption[] = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'PENDING', value: 'PENDING' },
    { label: 'IN_TRANSIT', value: 'IN_TRANSIT' },
    { label: 'DELIVERED', value: 'DELIVERED' },
    { label: 'RETURNED', value: 'RETURNED' },
  ];

  readonly visibleShipments = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.shipments().filter((shipment) => {
      const matchesStatus = status === 'ALL' || shipment.status === status;
      const haystack = [
        shipment.trackingNumber ?? '',
        shipment.warehouse,
        shipment.mode,
        String(shipment.orderId),
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = search.length === 0 || haystack.includes(search);
      return matchesStatus && matchesSearch;
    });
  });

  readonly totalShipments = computed(() => this.visibleShipments().length);
  readonly pendingCount = computed(() => this.visibleShipments().filter((shipment) => shipment.status === 'PENDING').length);
  readonly inTransitCount = computed(() =>
    this.visibleShipments().filter((shipment) => shipment.status === 'IN_TRANSIT').length,
  );
  readonly deliveredCount = computed(() =>
    this.visibleShipments().filter((shipment) => shipment.status === 'DELIVERED').length,
  );
  readonly returnedCount = computed(() =>
    this.visibleShipments().filter((shipment) => shipment.status === 'RETURNED').length,
  );
  readonly deliverySuccessRate = computed(() => {
    const total = this.totalShipments();
    if (total === 0) {
      return 0;
    }

    return (this.deliveredCount() / total) * 100;
  });

  readonly selectedShipment = computed(() => {
    const id = this.selectedShipmentId();
    return this.shipments().find((shipment) => shipment.id === id) ?? null;
  });

  readonly shipmentSteps = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const;

  constructor() {
    this.loadData();
  }

  selectShipment(id: number): void {
    this.selectedShipmentId.set(id);
  }

  statusStepIndex(status: Shipment['status']): number {
    const index = this.shipmentSteps.findIndex((step) => step === status);
    return index < 0 ? 0 : index;
  }

  updateStatus(shipment: ShipmentView, status: Shipment['status']): void {
    if (!this.canManageFulfillment() || shipment.status === status) {
      return;
    }

    const payload = { status };
    this.shipmentService.update(shipment.id, payload).subscribe({
      next: () => {
        this.shipments.update((shipments) =>
          shipments.map((current) =>
            current.id === shipment.id ? { ...current, status, lastUpdated: new Date().toISOString() } : current,
          ),
        );
      },
      error: () => {
        this.shipments.update((shipments) =>
          shipments.map((current) =>
            current.id === shipment.id ? { ...current, status, lastUpdated: new Date().toISOString() } : current,
          ),
        );
      },
    });

    this.successMessage.set(`Shipment #${shipment.id} updated to ${status}.`);
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.getAll().subscribe({
      next: (orders) => {
        const orderMap: Record<number, Order> = {};
        for (const order of orders as Order[]) {
          orderMap[order.id] = order;
        }
        this.ordersById.set(orderMap);

        this.shipmentService.getAll().subscribe({
          next: (shipments) => {
            const normalized = this.normalizeShipments(shipments as Shipment[], orderMap);
            const scoped = this.scopeByRole(normalized, orderMap);
            this.shipments.set(scoped);
            this.selectedShipmentId.set(scoped[0]?.id ?? null);
            this.isLoading.set(false);
          },
          error: () => {
            const normalized = this.normalizeShipments(this.getFallbackShipments(), orderMap);
            const scoped = this.scopeByRole(normalized, orderMap);
            this.shipments.set(scoped);
            this.selectedShipmentId.set(scoped[0]?.id ?? null);
            this.errorMessage.set('Live shipment data is unavailable. Showing sample shipment tracking data.');
            this.isLoading.set(false);
          },
        });
      },
      error: () => {
        const fallbackOrders = this.getFallbackOrders();
        const orderMap: Record<number, Order> = {};
        for (const order of fallbackOrders) {
          orderMap[order.id] = order;
        }
        this.ordersById.set(orderMap);

        const normalized = this.normalizeShipments(this.getFallbackShipments(), orderMap);
        const scoped = this.scopeByRole(normalized, orderMap);
        this.shipments.set(scoped);
        this.selectedShipmentId.set(scoped[0]?.id ?? null);
        this.errorMessage.set('Live shipment data is unavailable. Showing sample shipment tracking data.');
        this.isLoading.set(false);
      },
    });
  }

  private normalizeShipments(shipments: Shipment[], orderMap: Record<number, Order>): ShipmentView[] {
    const now = Date.now();
    return shipments.map((shipment, index) => {
      const order = orderMap[shipment.orderId];
      return {
        ...shipment,
        userId: order?.userId,
        storeId: order?.storeId,
        trackingNumber: shipment.trackingNumber ?? `TRK-${9000 + shipment.id}`,
        lastUpdated: new Date(now - index * 3600000).toISOString(),
        estimatedDelivery: new Date(now + (index + 1) * 86400000).toISOString(),
      };
    });
  }

  private scopeByRole(shipments: ShipmentView[], orderMap: Record<number, Order>): ShipmentView[] {
    if (this.isIndividual()) {
      const uid = this.userId();
      return shipments.filter((shipment) => shipment.userId === uid);
    }

    if (this.role() === 'CORPORATE') {
      const allowedOrderIds = new Set(Object.keys(orderMap).map((id) => Number(id)));
      return shipments.filter((shipment) => allowedOrderIds.has(shipment.orderId));
    }

    return shipments;
  }

  private getFallbackOrders(): Order[] {
    const currentUserId = this.userId() || 14;
    return [
      { id: 2001, userId: currentUserId, storeId: 1, status: 'PROCESSING', grandTotal: 1599, paymentMethod: 'CREDIT_CARD', orderDate: new Date().toISOString() },
      { id: 2002, userId: currentUserId, storeId: 2, status: 'SHIPPED', grandTotal: 899, paymentMethod: 'DEBIT_CARD', orderDate: new Date().toISOString() },
      { id: 2003, userId: 21, storeId: 1, status: 'DELIVERED', grandTotal: 1420, paymentMethod: 'BANK_TRANSFER', orderDate: new Date().toISOString() },
    ];
  }

  private getFallbackShipments(): Shipment[] {
    return [
      { id: 1, orderId: 2001, warehouse: 'A-12', mode: 'Express', trackingNumber: 'TRK-1001', status: 'PENDING' },
      { id: 2, orderId: 2002, warehouse: 'B-08', mode: 'Standard', trackingNumber: 'TRK-1002', status: 'IN_TRANSIT' },
      { id: 3, orderId: 2003, warehouse: 'A-12', mode: 'Express', trackingNumber: 'TRK-1003', status: 'DELIVERED' },
      { id: 4, orderId: 2003, warehouse: 'C-03', mode: 'Economy', trackingNumber: 'TRK-1004', status: 'RETURNED' },
    ];
  }
}
