import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ProductService } from '../../../core/services/prodcut/product.service';

type CategoryShowcase = {
  id: number;
  name: string;
  count: number;
  coverImage: string;
};

type CategoryRail = {
  id: number;
  name: string;
  products: Product[];
};

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage {
  private readonly productService = inject(ProductService);
  private readonly auth = inject(AuthService);

  readonly fallbackImageUrl = 'https://dummyimage.com/960x640/f3f4f6/6b7280&text=NovaMart';

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly products = signal<Product[]>([]);

  readonly isLoggedIn = computed(() => this.auth.isLoggedIn());
  readonly heroTitle = computed(() =>
    this.isLoggedIn() ? 'Welcome Back to NovaMart' : 'Discover Your Next Favorite Product',
  );
  readonly heroSubtitle = computed(() =>
    this.isLoggedIn()
      ? 'Continue shopping with personalized picks, top sellers, and fast checkout.'
      : 'Explore trending products, category deals, and best sellers just like major ecommerce marketplaces.',
  );

  readonly topSellers = computed(() =>
    [...this.products()]
      .sort((a, b) => a.stockQuantity - b.stockQuantity || b.id - a.id)
      .slice(0, 10),
  );

  readonly bestDeals = computed(() =>
    [...this.products()]
      .sort((a, b) => a.unitPrice - b.unitPrice || b.id - a.id)
      .slice(0, 10),
  );

  readonly premiumPicks = computed(() =>
    [...this.products()]
      .sort((a, b) => b.unitPrice - a.unitPrice || b.id - a.id)
      .slice(0, 10),
  );

  readonly categoryShowcases = computed<CategoryShowcase[]>(() => {
    const categoryMap = new Map<number, { name: string; products: Product[] }>();
    for (const product of this.products()) {
      const categoryId = Number(product.categoryId ?? 0);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        continue;
      }
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          name: (product.categoryName ?? '').trim() || `Category #${categoryId}`,
          products: [],
        });
      }
      categoryMap.get(categoryId)!.products.push(product);
    }

    return Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        count: data.products.length,
        coverImage: data.products.find((p) => this.hasImage(p.imageUrl))?.imageUrl ?? this.fallbackImageUrl,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
  });

  readonly categoryRails = computed<CategoryRail[]>(() => {
    const rails: CategoryRail[] = [];
    for (const category of this.categoryShowcases().slice(0, 4)) {
      rails.push({
        id: category.id,
        name: category.name,
        products: this.products()
          .filter((product) => Number(product.categoryId ?? 0) === category.id)
          .slice(0, 10),
      });
    }
    return rails;
  });

  constructor() {
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
        this.products.set([]);
        this.errorMessage.set('Home feed could not be loaded right now.');
        this.isLoading.set(false);
      },
    });
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (target) {
      target.src = this.fallbackImageUrl;
    }
  }

  private hasImage(imageUrl?: string): boolean {
    return !!imageUrl && imageUrl.trim().length > 0;
  }
}
