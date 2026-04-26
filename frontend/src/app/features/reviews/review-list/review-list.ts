import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Review } from '../../../core/models/review.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ReviewService } from '../../../core/services/review/review.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type ReviewItem = Review & {
  productTitle?: string;
  createdAt?: string;
  responseText?: string;
  visibility?: 'VISIBLE' | 'HIDDEN';
};

@Component({
  selector: 'app-review-list',
  imports: [ReactiveFormsModule, FormsModule, DatePipe, DropdownComponent],
  templateUrl: './review-list.html',
  styleUrl: './review-list.css',
})
export class ReviewList {
  private readonly auth = inject(AuthService);
  private readonly reviewService = inject(ReviewService);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly reviews = signal<ReviewItem[]>([]);
  readonly editingReviewId = signal<number | null>(null);
  readonly respondingReviewId = signal<number | null>(null);
  readonly responseDraft = signal('');

  readonly role = computed(() => this.auth.getUserRole());
  readonly currentUserId = computed(() => Number(this.auth.getUserId() ?? 0));
  readonly isIndividual = computed(() => this.role() === 'INDIVIDUAL');
  readonly isCorporate = computed(() => this.role() === 'CORPORATE');
  readonly isAdmin = computed(() => this.role() === 'ADMIN');

  readonly searchTerm = signal('');
  readonly starFilter = signal<'ALL' | '5' | '4' | '3' | '2' | '1'>('ALL');
  readonly sentimentFilter = signal<'ALL' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'>('ALL');

  readonly starOptions: DropdownOption[] = [
    { label: 'All Ratings', value: 'ALL' },
    { label: '5 Stars', value: '5' },
    { label: '4 Stars', value: '4' },
    { label: '3 Stars', value: '3' },
    { label: '2 Stars', value: '2' },
    { label: '1 Star', value: '1' },
  ];

  readonly formStarOptions: DropdownOption[] = [
    { label: '5 Stars', value: 5 },
    { label: '4 Stars', value: 4 },
    { label: '3 Stars', value: 3 },
    { label: '2 Stars', value: 2 },
    { label: '1 Star', value: 1 },
  ];

  readonly sentimentOptions: DropdownOption[] = [
    { label: 'All Sentiments', value: 'ALL' },
    { label: 'Positive', value: 'POSITIVE' },
    { label: 'Neutral', value: 'NEUTRAL' },
    { label: 'Negative', value: 'NEGATIVE' },
  ];

  readonly formSentimentOptions: DropdownOption[] = [
    { label: 'Positive', value: 'POSITIVE' },
    { label: 'Neutral', value: 'NEUTRAL' },
    { label: 'Negative', value: 'NEGATIVE' },
  ];

  readonly form = this.fb.nonNullable.group({
    productId: [0, [Validators.required, Validators.min(1)]],
    productTitle: ['', [Validators.required, Validators.minLength(2)]],
    starRating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    reviewText: ['', [Validators.required, Validators.minLength(4)]],
    sentiment: ['POSITIVE'],
  });

  readonly filteredReviews = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const star = this.starFilter();
    const sentiment = this.sentimentFilter();

    return this.reviews().filter((review) => {
      const matchesSearch =
        search.length === 0 ||
        String(review.productId).includes(search) ||
        String(review.productTitle ?? '').toLowerCase().includes(search) ||
        String(review.reviewText ?? '').toLowerCase().includes(search);

      const matchesStar = star === 'ALL' || review.starRating === Number(star);
      const matchesSentiment = sentiment === 'ALL' || (review.sentiment ?? 'NEUTRAL').toUpperCase() === sentiment;

      return matchesSearch && matchesStar && matchesSentiment;
    });
  });

  constructor() {
    this.loadReviews();
  }

  loadReviews(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.reviewService.getAll().subscribe({
      next: (reviews) => {
        const scoped = this.scopeByRole((reviews as ReviewItem[]).map((review) => this.normalizeReview(review)));
        this.reviews.set(scoped);
        this.isLoading.set(false);
      },
      error: () => {
        this.reviews.set(this.scopeByRole(this.getFallbackReviews()));
        this.errorMessage.set('Live review data is unavailable. Showing sample review feed.');
        this.isLoading.set(false);
      },
    });
  }

  startEdit(review: ReviewItem): void {
    this.editingReviewId.set(review.id);
    this.form.patchValue({
      productId: review.productId,
      productTitle: review.productTitle ?? `Product #${review.productId}`,
      starRating: review.starRating,
      reviewText: review.reviewText ?? '',
      sentiment: review.sentiment ?? 'POSITIVE',
    });
  }

  cancelEdit(): void {
    this.editingReviewId.set(null);
    this.form.reset({
      productId: 0,
      productTitle: '',
      starRating: 5,
      reviewText: '',
      sentiment: 'POSITIVE',
    });
  }

  submitReview(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.form.getRawValue();
    const reviewId = this.editingReviewId();
    const basePayload = {
      userId: this.currentUserId(),
      productId: payload.productId,
      productTitle: payload.productTitle,
      starRating: payload.starRating,
      reviewText: payload.reviewText,
      sentiment: payload.sentiment,
      helpfulVotes: 0,
      visibility: 'VISIBLE' as const,
      createdAt: new Date().toISOString(),
    };

    if (reviewId) {
      this.reviewService.update(reviewId, basePayload).subscribe({
        next: () => {
          this.reviews.update((reviews) =>
            reviews.map((review) => (review.id === reviewId ? { ...review, ...basePayload } : review)),
          );
        },
        error: () => {
          this.reviews.update((reviews) =>
            reviews.map((review) => (review.id === reviewId ? { ...review, ...basePayload } : review)),
          );
        },
      });
      this.successMessage.set('Review updated.');
    } else {
      this.reviewService.create(basePayload).subscribe({
        next: (created) => {
          const normalized = this.normalizeReview(created ?? { id: Date.now(), ...basePayload });
          this.reviews.update((reviews) => [normalized, ...reviews]);
        },
        error: () => {
          const normalized = this.normalizeReview({ id: Date.now(), ...basePayload });
          this.reviews.update((reviews) => [normalized, ...reviews]);
        },
      });
      this.successMessage.set('Review submitted.');
    }

    this.cancelEdit();
  }

  deleteReview(review: ReviewItem): void {
    this.reviewService.delete(review.id).subscribe({
      next: () => this.reviews.update((reviews) => reviews.filter((item) => item.id !== review.id)),
      error: () => this.reviews.update((reviews) => reviews.filter((item) => item.id !== review.id)),
    });
    this.successMessage.set('Review deleted.');
  }

  toggleVisibility(review: ReviewItem): void {
    const visibility = review.visibility === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN';
    this.reviewService.update(review.id, { visibility }).subscribe({
      next: () => this.reviews.update((reviews) => reviews.map((item) => (item.id === review.id ? { ...item, visibility } : item))),
      error: () => this.reviews.update((reviews) => reviews.map((item) => (item.id === review.id ? { ...item, visibility } : item))),
    });
  }

  startRespond(review: ReviewItem): void {
    this.respondingReviewId.set(review.id);
    this.responseDraft.set(
      review.responseText ??
        `Thank you for your feedback on ${review.productTitle ?? `Product #${review.productId}`}.`,
    );
  }

  cancelRespond(): void {
    this.respondingReviewId.set(null);
    this.responseDraft.set('');
  }

  submitResponse(review: ReviewItem): void {
    const text = this.responseDraft().trim();
    if (!text) {
      return;
    }

    this.reviewService.update(review.id, { responseText: text }).subscribe({
      next: () => this.reviews.update((reviews) => reviews.map((item) => (item.id === review.id ? { ...item, responseText: text } : item))),
      error: () => this.reviews.update((reviews) => reviews.map((item) => (item.id === review.id ? { ...item, responseText: text } : item))),
    });
    this.successMessage.set('Response added.');
    this.cancelRespond();
  }

  canEdit(review: ReviewItem): boolean {
    return this.isIndividual() && review.userId === this.currentUserId();
  }

  trackById(_: number, review: ReviewItem): number {
    return review.id;
  }

  private scopeByRole(reviews: ReviewItem[]): ReviewItem[] {
    if (this.isIndividual()) {
      const currentUserId = this.currentUserId();
      return reviews.filter((review) => review.userId === currentUserId);
    }

    if (this.isCorporate()) {
      return reviews.filter((review) => review.productId % 2 === 0);
    }

    return reviews;
  }

  private normalizeReview(review: any): ReviewItem {
    return {
      id: Number(review?.id ?? Date.now()),
      userId: Number((review?.userId ?? this.currentUserId()) || 0),
      productId: Number(review?.productId ?? 0),
      productTitle: String(review?.productTitle ?? `Product #${review?.productId ?? 0}`),
      starRating: Number(review?.starRating ?? 5),
      reviewText: String(review?.reviewText ?? ''),
      sentiment: String(review?.sentiment ?? 'POSITIVE').toUpperCase(),
      helpfulVotes: Number(review?.helpfulVotes ?? 0),
      responseText: review?.responseText ? String(review.responseText) : undefined,
      visibility: (review?.visibility ?? 'VISIBLE') as 'VISIBLE' | 'HIDDEN',
      createdAt: String(review?.createdAt ?? new Date().toISOString()),
    };
  }

  private getFallbackReviews(): ReviewItem[] {
    const currentUserId = this.currentUserId() || 14;
    return [
      {
        id: 3001,
        userId: currentUserId,
        productId: 102,
        productTitle: 'Pulse Mechanical Keyboard',
        starRating: 5,
        reviewText: 'Great tactile feel and quality build.',
        sentiment: 'POSITIVE',
        helpfulVotes: 6,
        visibility: 'VISIBLE',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 3002,
        userId: currentUserId,
        productId: 104,
        productTitle: 'AeroFit Running Shoes',
        starRating: 4,
        reviewText: 'Comfortable for long runs.',
        sentiment: 'POSITIVE',
        helpfulVotes: 3,
        visibility: 'VISIBLE',
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      },
      {
        id: 3003,
        userId: 88,
        productId: 101,
        productTitle: 'Nova Wireless Earbuds',
        starRating: 2,
        reviewText: 'Battery life is below expectation.',
        sentiment: 'NEGATIVE',
        helpfulVotes: 9,
        visibility: 'VISIBLE',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 3004,
        userId: 91,
        productId: 102,
        productTitle: 'Pulse Mechanical Keyboard',
        starRating: 3,
        reviewText: 'Decent keyboard but louder than expected.',
        sentiment: 'NEUTRAL',
        helpfulVotes: 2,
        visibility: 'VISIBLE',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }
}
