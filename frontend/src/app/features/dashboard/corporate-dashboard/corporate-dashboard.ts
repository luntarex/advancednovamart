import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { Order } from '../../../core/models/order.model';
import { Product } from '../../../core/models/product.model';
import { AnalyticsService } from '../../../core/services/analytics/analytics.service';
import { OrderService } from '../../../core/services/order/order.service';
import { ProductService } from '../../../core/services/prodcut/product.service';

type RevenuePoint = {
  label: string;
  value: number;
};

@Component({
  selector: 'app-corporate-dashboard',
  imports: [CurrencyPipe, BaseChartDirective],
  templateUrl: './corporate-dashboard.html',
  styleUrl: './corporate-dashboard.css',
})
export class CorporateDashboard {
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);
  private readonly analyticsService = inject(AnalyticsService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly products = signal<Product[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly revenueTrend = signal<RevenuePoint[]>([]);

  readonly totalRevenue = computed(() => this.orders().reduce((sum, order) => sum + order.grandTotal, 0));
  readonly orderCount = computed(() => this.orders().length);
  readonly pendingFulfillment = computed(() =>
    this.orders().filter((order) => order.status === 'PENDING' || order.status === 'PROCESSING').length,
  );
  readonly lowStockProducts = computed(() => this.products().filter((product) => product.stockQuantity <= 10));

  readonly topProducts = computed(() => [...this.products()].sort((a, b) => b.unitPrice - a.unitPrice).slice(0, 5));

  // Chart configuration for Revenue Trend (Line)
  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
  };
  public lineChartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const trend = this.revenueTrend();
    return {
      labels: trend.map(t => t.label),
      datasets: [ {
        data: trend.map(t => t.value), 
        label: 'Revenue (TRY)',
        fill: true,
        tension: 0.4
      } ]
    };
  });

  constructor() {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    let failed = false;

    const markFailure = () => {
      if (!failed) {
        this.errorMessage.set('Some live dashboard data could not be loaded.');
      }
      failed = true;
    };

    this.productService.getAll().subscribe({
      next: (products) => {
        this.products.set(products);
      },
      error: () => {
        this.products.set([]);
        markFailure();
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });

    this.orderService.getAll().subscribe({
      next: (orders) => this.orders.set(orders as Order[]),
      error: () => {
        this.orders.set([]);
        markFailure();
      },
    });

    this.analyticsService.getRevenueTrend().subscribe({
      next: (points) => {
        const normalized = Array.isArray(points)
          ? points.map((point: any, index) => ({
              label: String(point?.label ?? point?.month ?? `M${index + 1}`),
              value: Number(point?.value ?? point?.revenue ?? 0),
            }))
          : [];
        this.revenueTrend.set(normalized);
      },
      error: () => {
        this.revenueTrend.set([]);
        markFailure();
      },
    });
  }
}
