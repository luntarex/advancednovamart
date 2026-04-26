import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-checkout-cancel',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="checkout-status">
      <div class="status-card">
        <div class="icon cancel">!</div>
        <h2>Payment Cancelled</h2>
        <p>Your payment was cancelled or failed. Your order has not been processed. You can try checking out again.</p>
        <div class="actions">
          <a routerLink="/cart" class="primary-btn">Return to Cart</a>
          <a routerLink="/orders" class="ghost-btn">View My Orders</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .checkout-status { display: flex; justify-content: center; padding: 4rem 1rem; }
    .status-card { text-align: center; max-width: 500px; padding: 3rem; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-md); }
    .icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 1.5rem; color: white; }
    .icon.cancel { background: var(--danger); }
    h2 { margin-bottom: 1rem; }
    p { color: var(--text-muted); margin-bottom: 2rem; line-height: 1.6; }
    .actions { display: flex; gap: 1rem; justify-content: center; }
    .primary-btn, .ghost-btn { padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: 500; cursor: pointer; border: none; }
    .primary-btn { background: var(--primary); color: white; }
    .ghost-btn { background: transparent; border: 1px solid var(--border); color: var(--text); }
  `]
})
export class CheckoutCancel {}
