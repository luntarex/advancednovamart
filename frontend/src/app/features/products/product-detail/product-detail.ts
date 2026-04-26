import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { Review } from '../../../core/models/review.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { CartService } from '../../../core/services/cart/cart.service';
import { ProductService } from '../../../core/services/prodcut/product.service';
import { ReviewService } from '../../../core/services/review/review.service';

@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, CurrencyPipe, DecimalPipe, DatePipe, FormsModule],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
})
export class ProductDetail {
  readonly fallbackImageUrl = 'https://dummyimage.com/960x640/f3f4f6/6b7280&text=No+Image';

  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly productService = inject(ProductService);
  private readonly reviewService = inject(ReviewService);
  private readonly cartService = inject(CartService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly product = signal<Product | null>(null);
  readonly quantity = signal(1);
  readonly infoMessage = signal('');
  readonly reviews = signal<Review[]>([]);
  readonly isLoadingReviews = signal(false);
  readonly reviewMessage = signal('');
  readonly showReviewForm = signal(false);
  readonly reviewRating = signal(5);
  readonly reviewText = signal('');
  readonly isSubmittingReview = signal(false);
  readonly respondingReviewId = signal<number | null>(null);
  readonly responseDraft = signal('');

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
  readonly canAddReview = computed(() => this.role() === 'INDIVIDUAL');
  readonly canRespondToReviews = computed(() => this.role() === 'CORPORATE');
  readonly visibleReviews = computed(() =>
    this.reviews()
      .filter((review) => (review.visibility ?? 'PUBLIC') !== 'HIDDEN')
      .sort((a, b) => Number(new Date(b.createdAt ?? 0)) - Number(new Date(a.createdAt ?? 0))),
  );
  readonly averageRating = computed(() => {
    const list = this.visibleReviews();
    if (list.length === 0) {
      return 0;
    }
    return list.reduce((sum, review) => sum + review.starRating, 0) / list.length;
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id) || id <= 0) {
        this.errorMessage.set('Invalid product id.');
        this.product.set(null);
        return;
      }

      this.fetchProduct(id);
      this.fetchReviews(id);
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

    this.cartService.addItem(product.id, this.quantity()).subscribe({
      next: () => {
        this.infoMessage.set('Product added to cart.');
      },
      error: () => {
        this.infoMessage.set('Could not add product to cart.');
      },
    });
  }

  toggleReviewForm(): void {
    this.showReviewForm.update((open) => !open);
    this.reviewMessage.set('');
    if (!this.showReviewForm()) {
      this.reviewText.set('');
      this.reviewRating.set(5);
    }
  }

  submitReview(): void {
    const product = this.product();
    if (!product || !this.canAddReview() || this.isSubmittingReview()) {
      return;
    }

    const text = this.reviewText().trim();
    if (text.length < 4) {
      this.reviewMessage.set('Please write at least 4 characters for your review.');
      return;
    }

    this.isSubmittingReview.set(true);
    this.reviewMessage.set('');

    this.reviewService.create({
      productId: product.id,
      starRating: this.reviewRating(),
      reviewText: text,
      sentiment: this.reviewRating() >= 4 ? 'POSITIVE' : this.reviewRating() === 3 ? 'NEUTRAL' : 'NEGATIVE',
    }).subscribe({
      next: (created) => {
        this.reviews.update((items) => [created, ...items]);
        this.reviewMessage.set('Review submitted.');
        this.reviewText.set('');
        this.reviewRating.set(5);
        this.showReviewForm.set(false);
      },
      error: () => {
        this.reviewMessage.set('Failed to submit review. Please try again.');
      },
      complete: () => this.isSubmittingReview.set(false),
    });
  }

  startRespond(review: Review): void {
    if (!this.canRespondToReviews()) {
      return;
    }
    this.respondingReviewId.set(review.id);
    this.responseDraft.set(review.responseText ?? '');
    this.reviewMessage.set('');
  }

  cancelRespond(): void {
    this.respondingReviewId.set(null);
    this.responseDraft.set('');
  }

  submitResponse(review: Review): void {
    if (!this.canRespondToReviews()) {
      return;
    }
    const responseText = this.responseDraft().trim();
    if (!responseText) {
      this.reviewMessage.set('Please enter a response before saving.');
      return;
    }
    this.reviewService.update(review.id, { responseText }).subscribe({
      next: () => {
        this.reviews.update((items) =>
          items.map((item) => (item.id === review.id ? { ...item, responseText } : item)),
        );
        this.reviewMessage.set('Response saved.');
        this.cancelRespond();
      },
      error: () => {
        this.reviewMessage.set('Failed to save response. Please try again.');
      },
    });
  }

  onProductImageError(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (target) {
      target.src = this.fallbackImageUrl;
    }
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
        this.product.set(null);
        this.quantity.set(0);
        this.errorMessage.set('Product could not be loaded from database.');
        this.isLoading.set(false);
      },
    });
  }

  private fetchReviews(productId: number): void {
    this.isLoadingReviews.set(true);
    this.reviewMessage.set('');

    this.reviewService.getByProduct(productId).subscribe({
      next: (reviews) => {
        this.reviews.set(reviews);
        this.isLoadingReviews.set(false);
      },
      error: () => {
        this.reviews.set([]);
        this.reviewMessage.set('Reviews could not be loaded right now.');
        this.isLoadingReviews.set(false);
      },
    });
  }
}
