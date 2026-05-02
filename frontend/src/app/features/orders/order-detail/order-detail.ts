import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Order } from '../../../core/models/order.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { OrderService } from '../../../core/services/order/order.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type OrderStatus = Order['status'];

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, CurrencyPipe, DatePipe, FormsModule, DropdownComponent],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
})
export class OrderDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly orderService = inject(OrderService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly order = signal<Order | null>(null);
  readonly orderReceived = signal(false);

  readonly role = computed(() => this.auth.getUserRole());
  readonly canManageOrders = computed(() => {
    const role = this.role();
    return role === 'CORPORATE' || role === 'ADMIN';
  });
  
  readonly canShop = computed(() => this.role() === 'INDIVIDUAL');

  readonly pageTitle = computed(() => {
    const payment = this.paymentResult();
    if (payment === 'cancelled') {
      return 'Payment cancelled';
    }
    return this.orderReceived() ? 'Your order has been received' : 'Order details';
  });

  readonly paymentResult = signal('');

  readonly itemCount = computed(() =>
    (this.order()?.items ?? []).reduce((total, item) => total + item.quantity, 0),
  );

  readonly lineItemsTotal = computed(() =>
    (this.order()?.items ?? []).reduce((total, item) => total + Number(item.price ?? 0), 0),
  );

  readonly paymentLabel = computed(() => this.formatPaymentMethod(this.order()?.paymentMethod ?? ''));

  readonly paymentStatus = computed(() => {
    const method = (this.order()?.paymentMethod ?? '').toUpperCase();
    if (method.includes('CASH')) {
      return 'Due on delivery';
    }
    if (method.includes('BANK')) {
      return 'Awaiting transfer';
    }
    return this.orderReceived() ? 'Payment recorded' : 'Payment selected';
  });

  readonly deliveryEstimate = computed(() => {
    const rawDate = this.order()?.orderDate;
    const orderDate = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(orderDate.getTime())) {
      return '2-4 business days';
    }
    const start = new Date(orderDate);
    const end = new Date(orderDate);
    start.setDate(start.getDate() + 2);
    end.setDate(end.getDate() + 4);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  });

  readonly currentStepIndex = computed(() => {
    const order = this.order();
    if (!order) {
      return 0;
    }

    const map: Record<OrderStatus, number> = {
      PENDING: 0,
      PROCESSING: 1,
      SHIPPED: 2,
      DELIVERED: 3,
      CANCELLED: 4,
    };

    return map[order.status];
  });

  readonly trackingSteps = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  readonly statusOptions: DropdownOption[] = [
    { label: 'PENDING', value: 'PENDING' },
    { label: 'PROCESSING', value: 'PROCESSING' },
    { label: 'SHIPPED', value: 'SHIPPED' },
    { label: 'DELIVERED', value: 'DELIVERED' },
    { label: 'CANCELLED', value: 'CANCELLED' },
  ];

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.paymentResult.set(params.get('payment') ?? '');
      this.orderReceived.set(
        params.get('placed') === 'true' ||
          params.get('payment') === 'success' ||
          params.has('session_id'),
      );
    });

    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id) || id <= 0) {
        this.errorMessage.set('Invalid order id.');
        this.order.set(null);
        return;
      }

      this.loadOrder(id);
    });
  }

  updateStatus(status: OrderStatus): void {
    const order = this.order();
    if (!order || !this.canManageOrders() || order.status === status) {
      return;
    }

    this.orderService.update(order.id, { status }).subscribe({
      next: () => this.order.set({ ...order, status }),
      error: () => this.order.set({ ...order, status }),
    });
  }

  private loadOrder(id: number): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.getById(id).subscribe({
      next: (order) => {
        const normalized = order as Order;
        if (this.canShop() && normalized.userId !== Number(this.auth.getUserId() ?? 0)) {
          this.order.set(null);
          this.errorMessage.set('You are not allowed to view this order.');
          this.isLoading.set(false);
          return;
        }

        this.order.set(normalized);
        this.isLoading.set(false);
      },
      error: () => {
        const fallback = this.getFallbackOrders().find((o) => o.id === id) ?? null;
        this.order.set(fallback);
        this.errorMessage.set(fallback ? 'Live data unavailable. Showing sample order detail.' : 'Order not found.');
        this.isLoading.set(false);
      },
    });
  }

  private formatPaymentMethod(method: string): string {
    if (!method) {
      return 'Not selected';
    }

    return method
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getFallbackOrders(): Order[] {
    const currentUserId = Number(this.auth.getUserId() ?? 14);

    return [
      {
        id: 2001,
        userId: currentUserId,
        storeId: 1,
        status: 'PROCESSING',
        grandTotal: 1599,
        paymentMethod: 'CREDIT_CARD',
        orderDate: new Date().toISOString(),
        items: [
          { id: 1, productId: 101, productName: 'Nova Wireless Earbuds', quantity: 1, price: 849 },
          { id: 2, productId: 103, productName: 'Terra Smart Water Bottle', quantity: 1, price: 750 },
        ],
      },
      {
        id: 2002,
        userId: currentUserId,
        storeId: 2,
        status: 'SHIPPED',
        grandTotal: 1299,
        paymentMethod: 'DEBIT_CARD',
        orderDate: new Date(Date.now() - 86400000 * 4).toISOString(),
        items: [{ id: 3, productId: 102, productName: 'Pulse Mechanical Keyboard', quantity: 1, price: 1299 }],
      },
    ];
  }
}
