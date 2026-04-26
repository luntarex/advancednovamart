import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../../../core/models/store.model';
import { Order } from '../../../core/models/order.model';
import { OrderService } from '../../../core/services/order/order.service';
import { StoreService } from '../../../core/services/store/store.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type StoreStatus = Store['status'];

type AuditEntry = {
  id: number;
  action: string;
  actor: string;
  at: string;
};

@Component({
  selector: 'app-store-management',
  imports: [FormsModule, CurrencyPipe, DatePipe, DropdownComponent],
  templateUrl: './store-management.html',
  styleUrl: './store-management.css',
})
export class StoreManagement {
  private readonly storeService = inject(StoreService);
  private readonly orderService = inject(OrderService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly statusFilter = signal<'ALL' | StoreStatus>('ALL');
  readonly statusFilterOptions: DropdownOption[] = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'PENDING_APPROVAL', value: 'PENDING_APPROVAL' },
    { label: 'OPEN', value: 'OPEN' },
    { label: 'CLOSED', value: 'CLOSED' },
  ];
  readonly searchTerm = signal('');

  readonly stores = signal<Store[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly categories = signal<string[]>(['Electronics', 'Home', 'Fashion', 'Sports']);

  readonly auditLog = signal<AuditEntry[]>([
    { id: 1, action: 'Store approval policy reviewed', actor: 'admin@novamart.com', at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, action: 'Category renamed', actor: 'admin@novamart.com', at: new Date(Date.now() - 5400000).toISOString() },
  ]);

  readonly newCategory = signal('');

  readonly filteredStores = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.stores().filter((store) => {
      const matchesStatus = status === 'ALL' || store.status === status;
      const matchesSearch = search.length === 0 || store.name.toLowerCase().includes(search) || store.id.toString().includes(search);
      return matchesStatus && matchesSearch;
    });
  });

  readonly pendingCount = computed(() => this.stores().filter((store) => store.status === 'PENDING_APPROVAL').length);
  readonly openCount = computed(() => this.stores().filter((store) => store.status === 'OPEN').length);
  readonly closedCount = computed(() => this.stores().filter((store) => store.status === 'CLOSED').length);

  readonly revenueByStore = computed(() => {
    const totals = new Map<number, number>();
    for (const order of this.orders()) {
      totals.set(order.storeId, (totals.get(order.storeId) ?? 0) + order.grandTotal);
    }

    return this.stores().map((store) => ({
      id: store.id,
      name: store.name,
      revenue: totals.get(store.id) ?? 0,
    }));
  });

  constructor() {
    this.loadStores();
    this.loadOrders();
  }

  loadStores(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.storeService.getAll().subscribe({
      next: (stores) => {
        this.stores.set((stores as Store[]).map((store) => ({
          ...store,
          status: store.status ?? 'PENDING_APPROVAL',
        })));
        this.isLoading.set(false);
      },
      error: () => {
        this.stores.set(this.getFallbackStores());
        this.errorMessage.set('Live store data is unavailable. Showing sample store records.');
        this.isLoading.set(false);
      },
    });
  }

  loadOrders(): void {
    this.orderService.getAll().subscribe({
      next: (orders) => this.orders.set(orders as Order[]),
      error: () => this.orders.set(this.getFallbackOrders()),
    });
  }

  setStoreStatus(store: Store, status: StoreStatus): void {
    if (store.status === status) {
      return;
    }

    this.storeService.update(store.id, { status }).subscribe({
      next: () => {
        this.stores.update((stores) => stores.map((current) => (current.id === store.id ? { ...current, status } : current)));
      },
      error: () => {
        this.stores.update((stores) => stores.map((current) => (current.id === store.id ? { ...current, status } : current)));
      },
    });

    this.addAudit(`Store status changed to ${status}`);
  }

  addCategory(): void {
    const name = this.newCategory().trim();
    if (!name) {
      return;
    }

    if (this.categories().some((category) => category.toLowerCase() === name.toLowerCase())) {
      this.newCategory.set('');
      return;
    }

    this.categories.update((categories) => [...categories, name]);
    this.newCategory.set('');
    this.addAudit('Category created');
  }

  removeCategory(category: string): void {
    this.categories.update((categories) => categories.filter((current) => current !== category));
    this.addAudit('Category removed');
  }

  trackByStoreId(_: number, store: Store): number {
    return store.id;
  }

  private addAudit(action: string): void {
    this.auditLog.update((entries) => [
      { id: Date.now(), action, actor: 'admin@novamart.com', at: new Date().toISOString() },
      ...entries,
    ]);
  }

  private getFallbackStores(): Store[] {
    return [
      { id: 1, name: 'Nova Electronics', ownerId: 12, status: 'OPEN' },
      { id: 2, name: 'Urban Home Hub', ownerId: 18, status: 'PENDING_APPROVAL' },
      { id: 3, name: 'Peak Sportline', ownerId: 24, status: 'CLOSED' },
    ];
  }

  private getFallbackOrders(): Order[] {
    return [
      {
        id: 2001,
        userId: 14,
        storeId: 1,
        status: 'PROCESSING',
        grandTotal: 1599,
        paymentMethod: 'CREDIT_CARD',
        orderDate: new Date().toISOString(),
      },
      {
        id: 2002,
        userId: 9,
        storeId: 2,
        status: 'SHIPPED',
        grandTotal: 3299,
        paymentMethod: 'DEBIT_CARD',
        orderDate: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 2003,
        userId: 7,
        storeId: 1,
        status: 'DELIVERED',
        grandTotal: 999,
        paymentMethod: 'BANK_TRANSFER',
        orderDate: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ];
  }
}
