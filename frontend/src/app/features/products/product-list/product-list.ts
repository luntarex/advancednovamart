import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { CartService } from '../../../core/services/cart/cart.service';
import { ProductService } from '../../../core/services/prodcut/product.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-product-list',
  imports: [RouterLink, FormsModule, CurrencyPipe, DropdownComponent],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList {
  readonly fallbackImageUrl = 'https://dummyimage.com/640x480/f3f4f6/6b7280&text=No+Image';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);
  private readonly cartService = inject(CartService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly searchTerm = signal('');
  readonly sortBy = signal<'newest' | 'priceAsc' | 'priceDesc' | 'name'>('newest');
  readonly selectedCategory = signal<'ALL' | number>('ALL');

  readonly sortOptions: DropdownOption[] = [
    { label: 'Newest Arrivals', value: 'newest' },
    { label: 'Price: Low to High', value: 'priceAsc' },
    { label: 'Price: High to Low', value: 'priceDesc' },
    { label: 'Name: A-Z', value: 'name' },
  ];
  readonly saleOnly = signal(false);

  readonly products = signal<Product[]>([]);
  readonly categoryOptions = computed<DropdownOption[]>(() => {
    const categoryMap = new Map<number, string>();
    this.products().forEach((product) => {
      if (!Number.isFinite(product.categoryId)) {
        return;
      }
      const categoryId = Number(product.categoryId);
      const categoryName = (product.categoryName ?? '').trim() || `Category #${categoryId}`;
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, categoryName);
      }
    });

    const categories = Array.from(categoryMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    );

    return [
      { label: 'All Categories', value: 'ALL' },
      ...categories.map(([categoryId, categoryName]) => ({
        label: categoryName,
        value: categoryId,
      })),
    ];
  });

  readonly filteredProducts = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const saleOnly = this.saleOnly();
    const sortBy = this.sortBy();
    const selectedCategory = this.selectedCategory();

    let data = this.products().filter((product) => {
      const matchesQuery =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);
      const matchesCategory =
        selectedCategory === 'ALL' || Number(product.categoryId ?? 0) === selectedCategory;

      const hasSale = !saleOnly || product.unitPrice < 1000;
      return matchesQuery && matchesCategory && hasSale;
    });

    if (sortBy === 'priceAsc') {
      data = [...data].sort((a, b) => a.unitPrice - b.unitPrice);
    } else if (sortBy === 'priceDesc') {
      data = [...data].sort((a, b) => b.unitPrice - a.unitPrice);
    } else if (sortBy === 'name') {
      data = [...data].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      data = [...data].sort((a, b) => b.id - a.id);
    }

    return data;
  });

  readonly currentPage = signal(1);
  readonly pageSize = 48;

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredProducts().length / this.pageSize)));

  readonly paginatedProducts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredProducts().slice(start, start + this.pageSize);
  });

  readonly role = computed(() => this.auth.getUserRole());
  readonly canManageProducts = computed(() => {
    const role = this.role();
    return role === 'CORPORATE' || role === 'ADMIN';
  });
  readonly canShop = computed(() => this.role() === 'INDIVIDUAL');

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.searchTerm.set(params.get('search') ?? '');

      const sortParam = params.get('sort');
      if (sortParam === 'priceAsc' || sortParam === 'priceDesc' || sortParam === 'name' || sortParam === 'newest') {
        this.sortBy.set(sortParam);
      } else {
        this.sortBy.set('newest');
      }

      this.saleOnly.set(params.get('sale') === 'true');

      const categoryParam = Number(params.get('category'));
      if (Number.isFinite(categoryParam) && categoryParam > 0) {
        this.selectedCategory.set(categoryParam);
      } else {
        this.selectedCategory.set('ALL');
      }

      // Reset to page 1 whenever filters change
      this.currentPage.set(1);
    });

    this.loadProducts();
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  loadProducts(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.productService.getAll().subscribe({
      next: (products) => {
        this.products.set(products);
        this.isLoading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.errorMessage.set('Product data could not be loaded from database.');
        this.isLoading.set(false);
      },
    });
  }

  onFilterChange(): void {
    const queryParams: Record<string, string> = {};

    const search = this.searchTerm().trim();
    if (search.length > 0) {
      queryParams['search'] = search;
    }

    const sort = this.sortBy();
    if (sort !== 'newest') {
      queryParams['sort'] = sort;
    }

    if (this.saleOnly()) {
      queryParams['sale'] = 'true';
    }

    const category = this.selectedCategory();
    if (category !== 'ALL') {
      queryParams['category'] = String(category);
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
    });
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.sortBy.set('newest');
    this.selectedCategory.set('ALL');
    this.saleOnly.set(false);
    this.onFilterChange();
  }

  trackById(_: number, product: Product): number {
    return product.id;
  }

  readonly selectedQuantities = signal<Record<number, number>>({});

  getQuantity(productId: number): number {
    return this.selectedQuantities()[productId] || 1;
  }

  updateQuantity(productId: number, delta: number): void {
    const current = this.getQuantity(productId);
    const newVal = Math.max(1, current + delta);
    this.selectedQuantities.update(q => ({ ...q, [productId]: newVal }));
  }

  addToCart(product: Product): void {
    if (product.stockQuantity === 0 || !this.canShop()) {
      return;
    }

    const qty = this.getQuantity(product.id);
    const finalQty = Math.min(qty, product.stockQuantity);

    this.cartService.addItem(product.id, finalQty).subscribe({
      next: () => {
        this.successMessage.set(`${finalQty}x ${product.name} added to cart.`);
        setTimeout(() => this.successMessage.set(''), 3000);
        this.selectedQuantities.update(q => ({ ...q, [product.id]: 1 }));
      },
      error: () => {
        this.successMessage.set('Could not add product to cart.');
        setTimeout(() => this.successMessage.set(''), 3000);
      },
    });
  }

  onProductImageError(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (target) {
      target.src = this.fallbackImageUrl;
    }
  }
}
