import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { Order } from '../../../core/models/order.model';
import { Store } from '../../../core/models/store.model';
import { AnalyticsService } from '../../../core/services/analytics/analytics.service';
import { OrderService } from '../../../core/services/order/order.service';
import { StoreService } from '../../../core/services/store/store.service';
import { UserService } from '../../../core/services/user/user.service';

type PlatformUser = {
  id: number;
  email: string;
  roleType: 'ADMIN' | 'CORPORATE' | 'INDIVIDUAL';
  status: 'ACTIVE' | 'SUSPENDED';
};

type AuditEvent = {
  id: number;
  title: string;
  at: string;
};

@Component({
  selector: 'app-admin-dashboard',
  imports: [CurrencyPipe, BaseChartDirective],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard {
  private readonly userService = inject(UserService);
  private readonly storeService = inject(StoreService);
  private readonly orderService = inject(OrderService);
  private readonly analyticsService = inject(AnalyticsService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly users = signal<PlatformUser[]>([]);
  readonly stores = signal<Store[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly segments = signal<{ segment: string; count: number }[]>([]);

  readonly auditEvents = signal<AuditEvent[]>([
    { id: 1, title: 'RBAC policy updated', at: new Date(Date.now() - 7200000).toISOString() },
    { id: 2, title: 'Store approval threshold changed', at: new Date(Date.now() - 9000000).toISOString() },
    { id: 3, title: 'Suspicious login blocked', at: new Date(Date.now() - 12000000).toISOString() },
  ]);

  readonly totalUsers = computed(() => this.users().length);
  readonly totalStores = computed(() => this.stores().length);
  readonly activeStores = computed(() => this.stores().filter((store) => store.status === 'OPEN').length);
  readonly platformRevenue = computed(() => this.orders().reduce((sum, order) => sum + order.grandTotal, 0));

  readonly roleDistribution = computed(() => {
    const distribution = { ADMIN: 0, CORPORATE: 0, INDIVIDUAL: 0 };
    for (const user of this.users()) {
      distribution[user.roleType] += 1;
    }
    return distribution;
  });

  readonly storeRevenue = computed(() => {
    const totals = new Map<number, number>();
    for (const order of this.orders()) {
      totals.set(order.storeId, (totals.get(order.storeId) ?? 0) + order.grandTotal);
    }

    return this.stores()
      .map((store) => ({
        id: store.id,
        name: store.name,
        status: store.status,
        revenue: totals.get(store.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  });

  // Chart configuration for Role Distribution (Pie)
  public pieChartOptions: ChartOptions<'pie'> = {
    responsive: true,
  };
  public pieChartData = computed<ChartConfiguration<'pie'>['data']>(() => {
    const dist = this.roleDistribution();
    return {
      labels: ['Admins', 'Corporate', 'Individual'],
      datasets: [ {
        data: [dist.ADMIN, dist.CORPORATE, dist.INDIVIDUAL]
      } ]
    };
  });

  // Chart configuration for Segments (Bar)
  public barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
  };
  public barChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const segs = this.segments();
    return {
      labels: segs.map(s => s.segment),
      datasets: [ {
        data: segs.map(s => s.count), label: 'Users'
      } ]
    };
  });

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.userService.getAll().subscribe({
      next: (users) => {
        const normalized = (users as any[]).map((user, index) => ({
          id: Number(user.id ?? index + 1),
          email: String(user.email ?? `user${index + 1}@example.com`),
          roleType: (user.roleType ?? 'INDIVIDUAL') as PlatformUser['roleType'],
          status: (user.status ?? 'ACTIVE') as PlatformUser['status'],
        }));
        this.users.set(normalized);
      },
      error: () => {
        this.users.set(this.getFallbackUsers());
        this.errorMessage.set('Live platform data is unavailable. Showing sample analytics.');
      },
    });

    this.storeService.getAll().subscribe({
      next: (stores) => this.stores.set(stores as Store[]),
      error: () => this.stores.set(this.getFallbackStores()),
    });

    this.orderService.getAll().subscribe({
      next: (orders) => {
        this.orders.set(orders as Order[]);
        this.isLoading.set(false);
      },
      error: () => {
        this.orders.set(this.getFallbackOrders());
        this.isLoading.set(false);
      },
    });

    this.analyticsService.getCustomerSegments().subscribe({
      next: (segments) => {
        const normalized = Array.isArray(segments)
          ? segments.map((segment: any, index) => ({
              segment: String(segment?.segment ?? segment?.name ?? `Segment ${index + 1}`),
              count: Number(segment?.count ?? segment?.value ?? 0),
            }))
          : [];
        this.segments.set(normalized.length > 0 ? normalized : this.getFallbackSegments());
      },
      error: () => this.segments.set(this.getFallbackSegments()),
    });
  }

  private getFallbackUsers(): PlatformUser[] {
    return [
      { id: 1, email: 'admin@novamart.com', roleType: 'ADMIN', status: 'ACTIVE' },
      { id: 2, email: 'corp@novamart.com', roleType: 'CORPORATE', status: 'ACTIVE' },
      { id: 3, email: 'corp2@novamart.com', roleType: 'CORPORATE', status: 'ACTIVE' },
      { id: 4, email: 'user1@novamart.com', roleType: 'INDIVIDUAL', status: 'ACTIVE' },
      { id: 5, email: 'user2@novamart.com', roleType: 'INDIVIDUAL', status: 'SUSPENDED' },
    ];
  }

  private getFallbackStores(): Store[] {
    return [
      { id: 1, name: 'Nova Electronics', ownerId: 2, status: 'OPEN' },
      { id: 2, name: 'Urban Home Hub', ownerId: 3, status: 'OPEN' },
      { id: 3, name: 'Peak Sportline', ownerId: 3, status: 'CLOSED' },
    ];
  }

  private getFallbackOrders(): Order[] {
    return [
      { id: 901, userId: 4, storeId: 1, status: 'DELIVERED', grandTotal: 1850, paymentMethod: 'CARD', orderDate: new Date().toISOString() },
      { id: 902, userId: 4, storeId: 2, status: 'PROCESSING', grandTotal: 760, paymentMethod: 'CARD', orderDate: new Date().toISOString() },
      { id: 903, userId: 5, storeId: 1, status: 'SHIPPED', grandTotal: 2340, paymentMethod: 'TRANSFER', orderDate: new Date().toISOString() },
    ];
  }

  private getFallbackSegments(): { segment: string; count: number }[] {
    return [
      { segment: 'High Value', count: 142 },
      { segment: 'Frequent Buyers', count: 297 },
      { segment: 'At Risk', count: 86 },
    ];
  }
}
