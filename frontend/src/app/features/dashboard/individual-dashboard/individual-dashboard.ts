import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { Order } from '../../../core/models/order.model';
import { Review } from '../../../core/models/review.model';
import { Shipment } from '../../../core/models/shipment.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { OrderService } from '../../../core/services/order/order.service';
import { ReviewService } from '../../../core/services/review/review.service';
import { ShipmentService } from '../../../core/services/shipmemt/shipment.service';

@Component({
  selector: 'app-individual-dashboard',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, BaseChartDirective],
  templateUrl: './individual-dashboard.html',
  styleUrl: './individual-dashboard.css',
})
export class IndividualDashboard {
  private readonly auth = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly shipmentService = inject(ShipmentService);
  private readonly reviewService = inject(ReviewService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly orders = signal<Order[]>([]);
  readonly shipments = signal<Shipment[]>([]);
  readonly reviews = signal<Review[]>([]);

  readonly userId = computed(() => Number(this.auth.getUserId() ?? 0));
  readonly totalSpend = computed(() => this.orders().reduce((sum, order) => sum + order.grandTotal, 0));
  readonly deliveredCount = computed(() => this.orders().filter((order) => order.status === 'DELIVERED').length);
  readonly activeShipmentCount = computed(() =>
    this.shipments().filter((shipment) => shipment.status === 'PENDING' || shipment.status === 'IN_TRANSIT').length,
  );
  readonly avgRating = computed(() => {
    const data = this.reviews();
    if (data.length === 0) {
      return 0;
    }
    return data.reduce((sum, review) => sum + review.starRating, 0) / data.length;
  });

  readonly recentOrders = computed(() => [...this.orders()].sort((a, b) => +new Date(b.orderDate) - +new Date(a.orderDate)).slice(0, 5));
  readonly recentShipments = computed(() => this.shipments().slice(0, 5));
  readonly recentReviews = computed(() => this.reviews().slice(0, 4));

  // Chart configuration for Spending Analytics (Bar)
  public barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
  };
  public barChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const sorted = [...this.orders()].sort((a, b) => +new Date(a.orderDate) - +new Date(b.orderDate));
    return {
      labels: sorted.map(o => new Date(o.orderDate).toLocaleDateString()),
      datasets: [ {
        data: sorted.map(o => o.grandTotal), 
        label: 'Spending (TRY)',
        backgroundColor: '#4F46E5'
      } ]
    };
  });

  constructor() {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.getAll().subscribe({
      next: (orders) => {
        const uid = this.userId();
        this.orders.set((orders as Order[]).filter((order) => order.userId === uid));
        this.isLoading.set(false);
      },
      error: () => {
        this.orders.set(this.getFallbackOrders());
        this.errorMessage.set('Live dashboard data is unavailable. Showing sample insights.');
        this.isLoading.set(false);
      },
    });

    this.shipmentService.getAll().subscribe({
      next: (shipments) => this.shipments.set(shipments as Shipment[]),
      error: () => this.shipments.set(this.getFallbackShipments()),
    });

    this.reviewService.getAll().subscribe({
      next: (reviews) => {
        const uid = this.userId();
        this.reviews.set((reviews as Review[]).filter((review) => review.userId === uid));
      },
      error: () => this.reviews.set(this.getFallbackReviews()),
    });
  }

  private getFallbackOrders(): Order[] {
    const uid = this.userId() || 14;
    return [
      {
        id: 401,
        userId: uid,
        storeId: 1,
        status: 'DELIVERED',
        grandTotal: 1249,
        paymentMethod: 'CREDIT_CARD',
        orderDate: new Date(Date.now() - 86400000 * 7).toISOString(),
      },
      {
        id: 402,
        userId: uid,
        storeId: 2,
        status: 'SHIPPED',
        grandTotal: 899,
        paymentMethod: 'DEBIT_CARD',
        orderDate: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 403,
        userId: uid,
        storeId: 1,
        status: 'PROCESSING',
        grandTotal: 559,
        paymentMethod: 'BANK_TRANSFER',
        orderDate: new Date().toISOString(),
      },
    ];
  }

  private getFallbackShipments(): Shipment[] {
    return [
      { id: 1, orderId: 402, warehouse: 'A-12', mode: 'Express', trackingNumber: 'TRK-9001', status: 'IN_TRANSIT' },
      { id: 2, orderId: 403, warehouse: 'B-08', mode: 'Standard', trackingNumber: 'TRK-9002', status: 'PENDING' },
      { id: 3, orderId: 401, warehouse: 'A-12', mode: 'Express', trackingNumber: 'TRK-8111', status: 'DELIVERED' },
    ];
  }

  private getFallbackReviews(): Review[] {
    const uid = this.userId() || 14;
    return [
      { id: 1, userId: uid, productId: 101, starRating: 5, reviewText: 'Excellent quality', helpfulVotes: 3 },
      { id: 2, userId: uid, productId: 102, starRating: 4, reviewText: 'Fast shipping', helpfulVotes: 2 },
      { id: 3, userId: uid, productId: 104, starRating: 4, reviewText: 'Comfortable and light', helpfulVotes: 1 },
    ];
  }
}
