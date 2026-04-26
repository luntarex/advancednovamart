import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ProductService } from '../../../core/services/prodcut/product.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-product-list',
  imports: [RouterLink, FormsModule, CurrencyPipe, DropdownComponent],
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly searchTerm = signal('');
  readonly sortBy = signal<'newest' | 'priceAsc' | 'priceDesc' | 'name'>('newest');

  readonly sortOptions: DropdownOption[] = [
    { label: 'Newest Arrivals', value: 'newest' },
    { label: 'Price: Low to High', value: 'priceAsc' },
    { label: 'Price: High to Low', value: 'priceDesc' },
    { label: 'Name: A-Z', value: 'name' },
  ];
  readonly saleOnly = signal(false);

  readonly products = signal<Product[]>([]);

  readonly filteredProducts = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const saleOnly = this.saleOnly();
    const sortBy = this.sortBy();

    let data = this.products().filter((product) => {
      const matchesQuery =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);

      const hasSale = !saleOnly || product.unitPrice < 1000;
      return matchesQuery && hasSale;
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
    });

    this.loadProducts();
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
        this.products.set(this.getFallbackProducts());
        this.errorMessage.set('Live product data is unavailable. Showing sample products.');
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

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
    });
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.sortBy.set('newest');
    this.saleOnly.set(false);
    this.onFilterChange();
  }

  trackById(_: number, product: Product): number {
    return product.id;
  }

  addToCart(product: Product): void {
    if (product.stockQuantity === 0 || !this.canShop()) {
      return;
    }

    const cart = localStorage.getItem('cart');
    const cartItems = cart ? JSON.parse(cart) : [];
    const existingItem = cartItems.find((item: { productId: number }) => item.productId === product.id);

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + 1, product.stockQuantity);
    } else {
      cartItems.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.unitPrice,
        quantity: 1,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cartItems));
    window.dispatchEvent(new CustomEvent('cart-updated'));
    this.successMessage.set(`${product.name} added to cart.`);
  }

  private getFallbackProducts(): Product[] {
    return [
      {
        id: 101,
        name: 'Nova Wireless Earbuds',
        sku: 'NV-AUD-101',
        description: 'Noise isolation with all-day battery.',
        unitPrice: 849,
        stockQuantity: 34,
        categoryId: 1,
        storeId: 1,
      },
      {
        id: 102,
        name: 'Pulse Mechanical Keyboard',
        sku: 'NV-KEY-204',
        description: 'Compact RGB keyboard for productivity and gaming.',
        unitPrice: 1299,
        stockQuantity: 18,
        categoryId: 2,
        storeId: 1,
      },
      {
        id: 103,
        name: 'Terra Smart Water Bottle',
        sku: 'NV-LIF-550',
        description: 'Tracks hydration and syncs with your mobile app.',
        unitPrice: 579,
        stockQuantity: 0,
        categoryId: 3,
        storeId: 2,
      },
      {
        id: 104,
        name: 'AeroFit Running Shoes',
        sku: 'NV-SPT-702',
        description: 'Lightweight daily trainers with reinforced heel support.',
        unitPrice: 1499,
        stockQuantity: 42,
        categoryId: 4,
        storeId: 2,
      },
    ];
  }
}
