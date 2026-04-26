import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../../core/services/analytics/analytics.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type MetricPoint = {
  label: string;
  value: number;
};

type WidgetId =
  | 'revenueTrend'
  | 'salesByCategory'
  | 'topProducts'
  | 'customerSegments'
  | 'executiveInsights';

@Component({
  selector: 'app-analytics-dashboard',
  imports: [FormsModule, CurrencyPipe, DecimalPipe, DropdownComponent],
  templateUrl: './analytics-dashboard.html',
  styleUrl: './analytics-dashboard.css',
})
export class AnalyticsDashboard {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly auth = inject(AuthService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly isWidgetPanelOpen = signal(false);

  readonly range = signal<'7d' | '30d' | '90d'>('30d');
  readonly rangeOptions: DropdownOption[] = [
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
  ];
  readonly salesByCategory = signal<MetricPoint[]>([]);
  readonly revenueTrend = signal<MetricPoint[]>([]);
  readonly topProducts = signal<MetricPoint[]>([]);
  readonly customerSegments = signal<MetricPoint[]>([]);
  readonly widgetOrder = signal<WidgetId[]>(this.loadWidgetOrder());
  readonly widgetVisibility = signal<Record<WidgetId, boolean>>(this.loadWidgetVisibility());

  readonly role = computed(() => this.auth.getUserRole());
  readonly isAdmin = computed(() => this.role() === 'ADMIN');
  readonly isCorporate = computed(() => this.role() === 'CORPORATE');

  readonly totalRevenue = computed(() => this.revenueTrend().reduce((sum, point) => sum + point.value, 0));
  readonly topCategory = computed(() => {
    const sorted = [...this.salesByCategory()].sort((a, b) => b.value - a.value);
    return sorted[0] ?? null;
  });
  readonly avgSegmentSize = computed(() => {
    const segments = this.customerSegments();
    if (segments.length === 0) {
      return 0;
    }
    return segments.reduce((sum, segment) => sum + segment.value, 0) / segments.length;
  });
  readonly topProduct = computed(() => {
    const sorted = [...this.topProducts()].sort((a, b) => b.value - a.value);
    return sorted[0] ?? null;
  });
  readonly trendDeltaPercent = computed(() => {
    const trend = this.revenueTrend();
    if (trend.length < 2) {
      return 0;
    }
    const first = trend[0].value;
    const last = trend[trend.length - 1].value;
    if (first === 0) {
      return 0;
    }
    return ((last - first) / first) * 100;
  });
  readonly isTrendPositive = computed(() => this.trendDeltaPercent() >= 0);
  readonly projectedRevenue = computed(() => this.totalRevenue() * 1.08);
  readonly categoryConcentration = computed(() => {
    const list = [...this.salesByCategory()].sort((a, b) => b.value - a.value);
    if (list.length === 0) {
      return 0;
    }
    const total = list.reduce((sum, entry) => sum + entry.value, 0);
    if (total === 0) {
      return 0;
    }
    const topThree = list.slice(0, 3).reduce((sum, entry) => sum + entry.value, 0);
    return (topThree / total) * 100;
  });
  readonly segmentTotal = computed(() => this.customerSegments().reduce((sum, segment) => sum + segment.value, 0));
  readonly segmentDiversity = computed(() => {
    const active = this.customerSegments().filter((segment) => segment.value > 0).length;
    const total = this.customerSegments().length;
    if (total === 0) {
      return 0;
    }
    return (active / total) * 100;
  });

  readonly revenueMax = computed(() => Math.max(1, ...this.revenueTrend().map((point) => point.value)));
  readonly categoryMax = computed(() => Math.max(1, ...this.salesByCategory().map((point) => point.value)));
  readonly segmentMax = computed(() => Math.max(1, ...this.customerSegments().map((point) => point.value)));
  readonly visibleWidgetOrder = computed(() =>
    this.widgetOrder().filter((widgetId) => this.widgetVisibility()[widgetId]),
  );

  constructor() {
    this.loadData();
  }

  toggleWidgetPanel(): void {
    this.isWidgetPanelOpen.update((open) => !open);
  }

  toggleWidget(widgetId: WidgetId): void {
    this.widgetVisibility.update((visibility) => ({
      ...visibility,
      [widgetId]: !visibility[widgetId],
    }));
    this.persistWidgetState();
  }

  moveWidgetUp(widgetId: WidgetId): void {
    this.widgetOrder.update((order) => {
      const index = order.indexOf(widgetId);
      if (index <= 0) {
        return order;
      }
      const next = [...order];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    this.persistWidgetState();
  }

  moveWidgetDown(widgetId: WidgetId): void {
    this.widgetOrder.update((order) => {
      const index = order.indexOf(widgetId);
      if (index < 0 || index >= order.length - 1) {
        return order;
      }
      const next = [...order];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    this.persistWidgetState();
  }

  getWidgetTitle(widgetId: WidgetId): string {
    switch (widgetId) {
      case 'revenueTrend':
        return 'Revenue Trend';
      case 'salesByCategory':
        return 'Sales by Category';
      case 'topProducts':
        return 'Top Products';
      case 'customerSegments':
        return 'Customer Segments';
      default:
        return 'Executive Insights';
    }
  }

  reload(): void {
    this.loadData();
  }

  widthByRevenue(value: number): number {
    return (value / this.revenueMax()) * 100;
  }

  widthByCategory(value: number): number {
    return (value / this.categoryMax()) * 100;
  }

  widthBySegment(value: number): number {
    return (value / this.segmentMax()) * 100;
  }

  exportCsv(): void {
    const rows = [
      ['Section', 'Label', 'Value'],
      ...this.revenueTrend().map((point) => ['RevenueTrend', point.label, String(point.value)]),
      ...this.salesByCategory().map((point) => ['SalesByCategory', point.label, String(point.value)]),
      ...this.topProducts().map((point) => ['TopProducts', point.label, String(point.value)]),
      ...this.customerSegments().map((point) => ['CustomerSegments', point.label, String(point.value)]),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `analytics-${this.range()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private persistWidgetState(): void {
    localStorage.setItem('analytics_widget_order', JSON.stringify(this.widgetOrder()));
    localStorage.setItem('analytics_widget_visibility', JSON.stringify(this.widgetVisibility()));
  }

  private loadWidgetOrder(): WidgetId[] {
    const fallback: WidgetId[] = [
      'revenueTrend',
      'salesByCategory',
      'topProducts',
      'customerSegments',
      'executiveInsights',
    ];
    const raw = localStorage.getItem('analytics_widget_order');
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as WidgetId[];
      const valid = parsed.filter((item): item is WidgetId => fallback.includes(item));
      return valid.length === fallback.length ? valid : fallback;
    } catch {
      return fallback;
    }
  }

  private loadWidgetVisibility(): Record<WidgetId, boolean> {
    const fallback: Record<WidgetId, boolean> = {
      revenueTrend: true,
      salesByCategory: true,
      topProducts: true,
      customerSegments: true,
      executiveInsights: true,
    };

    const raw = localStorage.getItem('analytics_widget_visibility');
    if (!raw) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Record<WidgetId, boolean>>;
      return {
        revenueTrend: parsed.revenueTrend ?? true,
        salesByCategory: parsed.salesByCategory ?? true,
        topProducts: parsed.topProducts ?? true,
        customerSegments: parsed.customerSegments ?? true,
        executiveInsights: parsed.executiveInsights ?? true,
      };
    } catch {
      return fallback;
    }
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    const params = this.getRangeParams(this.range());

    let completed = 0;
    const markDone = () => {
      completed += 1;
      if (completed >= 4) {
        this.isLoading.set(false);
      }
    };

    this.analyticsService.getSalesByCategory(params).subscribe({
      next: (data) => {
        this.salesByCategory.set(this.normalizeList(data, 'category'));
        markDone();
      },
      error: () => {
        this.salesByCategory.set([]);
        this.errorMessage.set('Live analytics data is unavailable.');
        markDone();
      },
    });

    this.analyticsService.getRevenueTrend(params).subscribe({
      next: (data) => {
        this.revenueTrend.set(this.normalizeList(data, 'period'));
        markDone();
      },
      error: () => {
        this.revenueTrend.set([]);
        markDone();
      },
    });

    this.analyticsService.getTopProducts(5).subscribe({
      next: (data) => {
        this.topProducts.set(this.normalizeList(data, 'product'));
        markDone();
      },
      error: () => {
        this.topProducts.set([]);
        markDone();
      },
    });

    this.analyticsService.getCustomerSegments().subscribe({
      next: (data) => {
        this.customerSegments.set(this.normalizeList(data, 'segment'));
        markDone();
      },
      error: () => {
        this.customerSegments.set([]);
        markDone();
      },
    });
  }

  private getRangeParams(range: '7d' | '30d' | '90d'): { range: string } {
    return { range };
  }

  private normalizeList(data: any, labelKey: string): MetricPoint[] {
    if (!Array.isArray(data)) {
      return [];
    }

    const mapped = data
      .map((item: any, index: number) => ({
        label: String(
          item?.label ??
            item?.name ??
            item?.category ??
            item?.segment ??
            item?.productName ??
            item?.product ??
            item?.month ??
            item?.period ??
            item?.[labelKey] ??
            `${labelKey}-${index + 1}`,
        ),
        value: Number(item?.value ?? item?.total ?? item?.amount ?? item?.sales ?? item?.revenue ?? item?.count ?? 0),
      }))
      .filter((item: MetricPoint) => Number.isFinite(item.value));

    return mapped.length > 0 ? mapped : [];
  }
}
