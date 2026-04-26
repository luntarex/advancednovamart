import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ProductService } from '../../../core/services/prodcut/product.service';

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
})
export class ProductDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly product = signal<Product | null>(null);
  readonly quantity = signal(1);
  readonly infoMessage = signal('');

  readonly inStock = computed(() => {
    const product = this.product();
    return !!product && product.stockQuantity > 0;
  });
  readonly role = computed(() => this.auth.getUserRole());
  readonly canManageProducts = computed(() => {
    const role = this.role();
    return role === 'CORPORATE' || role === 'ADMIN';
  });
  readonly canShop = computed(() => this.role() === 'INDIVIDUAL');

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id) || id <= 0) {
        this.errorMessage.set('Invalid product id.');
        this.product.set(null);
        return;
      }

      this.fetchProduct(id);
    });
  }

  decreaseQuantity(): void {
    this.quantity.update((value) => Math.max(1, value - 1));
  }

  increaseQuantity(): void {
    const maxStock = this.product()?.stockQuantity ?? 1;
    this.quantity.update((value) => Math.min(maxStock > 0 ? maxStock : 1, value + 1));
  }

  addToCart(): void {
    const product = this.product();
    if (!product || product.stockQuantity === 0 || !this.canShop()) {
      return;
    }

    const cart = localStorage.getItem('cart');
    const cartItems = cart ? JSON.parse(cart) : [];

    const existingItem = cartItems.find((item: { productId: number }) => item.productId === product.id);
    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + this.quantity(), product.stockQuantity);
    } else {
      cartItems.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.unitPrice,
        quantity: this.quantity(),
      });
    }

    localStorage.setItem('cart', JSON.stringify(cartItems));
    window.dispatchEvent(new CustomEvent('cart-updated'));
    this.infoMessage.set('Product added to cart.');
  }

  private fetchProduct(id: number): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.infoMessage.set('');

    this.productService.getById(id).subscribe({
      next: (product) => {
        this.product.set(product);
        this.quantity.set(product.stockQuantity > 0 ? 1 : 0);
        this.isLoading.set(false);
      },
      error: () => {
        const sample = this.getFallbackProducts().find((p) => p.id === id) ?? null;
        this.product.set(sample);
        this.quantity.set(sample && sample.stockQuantity > 0 ? 1 : 0);
        this.errorMessage.set(sample ? 'Live data unavailable. Showing sample product.' : 'Product not found.');
        this.isLoading.set(false);
      },
    });
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
