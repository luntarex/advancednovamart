import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CartItem } from '../../../core/models/cart.model';
import { CartService } from '../../../core/services/cart/cart.service';
import { PaymentService } from '../../../core/services/payment.service';

@Component({
  selector: 'app-cart-view',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './cart-view.html',
  styleUrl: './cart-view.css',
})
export class CartView {
  private readonly cartService = inject(CartService);
  private readonly paymentService = inject(PaymentService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isCheckingOut = signal(false);

  readonly items = signal<CartItem[]>([]);
  readonly infoMessage = signal('');

  readonly subtotal = computed(() =>
    this.items().reduce((total, item) => total + item.unitPrice * item.quantity, 0),
  );
  readonly shippingFee = computed(() => (this.subtotal() >= 1500 || this.subtotal() === 0 ? 0 : 79));
  readonly total = computed(() => this.subtotal() + this.shippingFee());
  readonly totalCount = computed(() => this.items().reduce((total, item) => total + item.quantity, 0));

  constructor() {
    this.cartService.items$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.items.set(items));

    this.cartService.refreshCart().subscribe();
  }

  increase(item: CartItem): void {
    this.cartService.updateItemQuantity(item.productId, item.quantity + 1).subscribe();
  }

  decrease(item: CartItem): void {
    this.cartService.updateItemQuantity(item.productId, Math.max(item.quantity - 1, 1)).subscribe();
  }

  remove(item: CartItem): void {
    this.cartService.removeItem(item.productId).subscribe();
  }

  clearCart(): void {
    this.cartService.clearCart().subscribe({
      next: () => this.infoMessage.set('Cart cleared.'),
      error: () => this.infoMessage.set('Could not clear cart right now.'),
    });
  }

  checkout(): void {
    if (this.items().length === 0) return;
    
    this.isCheckingOut.set(true);
    this.infoMessage.set('Preparing secure checkout...');

    this.cartService.checkoutCart().subscribe({
      next: (order) => {
        this.paymentService.createCheckoutSession(order.id).subscribe({
          next: (response) => {
            this.paymentService.redirectToStripe(response.url);
          },
          error: (err) => {
            console.error('Stripe error', err);
            this.infoMessage.set('Failed to initiate payment.');
            this.isCheckingOut.set(false);
          }
        });
      },
      error: (err) => {
        console.error('Checkout error', err);
        this.infoMessage.set('Failed to prepare checkout.');
        this.isCheckingOut.set(false);
      }
    });
  }
}
