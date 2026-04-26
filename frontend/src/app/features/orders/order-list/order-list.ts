import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Order } from '../../../core/models/order.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { OrderService } from '../../../core/services/order/order.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type OrderStatus = Order['status'];

@Component({
  selector: 'app-order-list',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, DropdownComponent],
  templateUrl: './order-list.html',
  styleUrl: './order-list.css',
})
export class OrderList {
  private readonly auth = inject(AuthService);
  private readonly orderService = inject(OrderService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly statusFilter = signal<'ALL' | OrderStatus>('ALL');
  readonly statusFilterOptions: DropdownOption[] = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Processing', value: 'PROCESSING' },
    { label: 'Shipped', value: 'SHIPPED' },
    { label: 'Delivered', value: 'DELIVERED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];
  readonly statusUpdateOptions: DropdownOption[] = [
    { label: 'PENDING', value: 'PENDING' },
    { label: 'PROCESSING', value: 'PROCESSING' },
    { label: 'SHIPPED', value: 'SHIPPED' },
    { label: 'DELIVERED', value: 'DELIVERED' },
    { label: 'CANCELLED', value: 'CANCELLED' },
  ];
  readonly searchTerm = signal('');

  readonly orders = signal<Order[]>([]);

  readonly role = computed(() => this.auth.getUserRole());
  readonly userId = computed(() => Number(this.auth.getUserId() ?? 0));
  readonly canManageOrders = computed(() => {
    const role = this.role();
    return role === 'CORPORATE' || role === 'ADMIN';
  });
  readonly canShop = computed(() => this.role() === 'INDIVIDUAL');

  readonly filteredOrders = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.orders().filter((order) => {
      const matchesStatus = status === 'ALL' || order.status === status;
      const matchesSearch =
        search.length === 0 ||
        order.id.toString().includes(search) ||
        order.paymentMethod.toLowerCase().includes(search) ||
        order.status.toLowerCase().includes(search);

      return matchesStatus && matchesSearch;
    });
  });

  constructor() {
    this.loadOrders();
  }

  loadOrders(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.getAll().subscribe({
      next: (orders) => {
        this.orders.set(this.scopeByRole(orders as Order[]));
        this.isLoading.set(false);
      },
      error: () => {
        const fallbackOrders = this.getFallbackOrders();
        const scopedFallback = this.scopeByRole(fallbackOrders);
        this.orders.set(scopedFallback);
        this.errorMessage.set('Live order data is unavailable. Showing sample order history.');
        this.isLoading.set(false);
      },
    });
  }

  onFilterChange(): void {
    this.statusFilter.set(this.statusFilter());
  }

  updateOrderStatus(order: Order, status: OrderStatus): void {
    if (!this.canManageOrders() || order.status === status) {
      return;
    }

    this.orderService.update(order.id, { status }).subscribe({
      next: () => {
        this.orders.update((orders) =>
          orders.map((current) => (current.id === order.id ? { ...current, status } : current)),
        );
      },
      error: () => {
        this.orders.update((orders) =>
          orders.map((current) => (current.id === order.id ? { ...current, status } : current)),
        );
      },
    });
  }

  trackById(_: number, order: Order): number {
    return order.id;
  }

  exportFilteredOrdersCsv(): void {
    const rows = [
      ['OrderId', 'Date', 'Status', 'Total', 'PaymentMethod'],
      ...this.filteredOrders().map((order) => [
        String(order.id),
        order.orderDate,
        order.status,
        String(order.grandTotal),
        order.paymentMethod,
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private scopeByRole(orders: Order[]): Order[] {
    if (this.canShop()) {
      const currentUserId = this.userId();
      return orders.filter((order) => order.userId === currentUserId);
    }

    return orders;
  }

  private getFallbackOrders(): Order[] {
    const currentUserId = this.userId() || 14;

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
      {
        id: 2003,
        userId: 999,
        storeId: 3,
        status: 'PENDING',
        grandTotal: 2499,
        paymentMethod: 'BANK_TRANSFER',
        orderDate: new Date(Date.now() - 86400000).toISOString(),
        items: [{ id: 4, productId: 104, productName: 'AeroFit Running Shoes', quantity: 2, price: 1249.5 }],
      },
    ];
  }
}
