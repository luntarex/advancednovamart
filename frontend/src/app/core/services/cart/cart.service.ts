import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { OrderService } from '../order/order.service';
import { AuthService } from '../auth/auth.service';
import { CartItem } from '../../models/cart.model';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);

  private readonly itemsSubject = new BehaviorSubject<CartItem[]>([]);
  readonly items$ = this.itemsSubject.asObservable();

  private readonly countSubject = new BehaviorSubject<number>(0);
  readonly count$ = this.countSubject.asObservable();

  constructor() {
    this.auth.currentUser$.subscribe((user) => {
      if (user && this.auth.getUserRole() === 'INDIVIDUAL') {
        this.refreshCart().subscribe();
      } else {
        this.itemsSubject.next([]);
        this.countSubject.next(0);
      }
    });
  }

  getItems(): CartItem[] {
    return this.itemsSubject.value;
  }

  refreshCart(): Observable<CartItem[]> {
    return this.orderService.getCart().pipe(
      map((cart) => this.mapOrderToCartItems(cart)),
      tap((items) => this.setState(items)),
    );
  }

  addItem(productId: number, quantity: number): Observable<CartItem[]> {
    return this.orderService.addCartItem(productId, quantity).pipe(
      map((cart) => this.mapOrderToCartItems(cart)),
      tap((items) => this.setState(items)),
    );
  }

  updateItemQuantity(productId: number, quantity: number): Observable<CartItem[]> {
    return this.orderService.updateCartItem(productId, quantity).pipe(
      map((cart) => this.mapOrderToCartItems(cart)),
      tap((items) => this.setState(items)),
    );
  }

  removeItem(productId: number): Observable<CartItem[]> {
    return this.orderService.removeCartItem(productId).pipe(
      map((cart) => this.mapOrderToCartItems(cart)),
      tap((items) => this.setState(items)),
    );
  }

  clearCart(): Observable<void> {
    return this.orderService.clearCart().pipe(
      tap(() => this.setState([])),
    );
  }

  checkoutCart(): Observable<any> {
    return this.orderService.checkoutCart().pipe(
      tap(() => this.setState([]))
    );
  }

  private setState(items: CartItem[]): void {
    this.itemsSubject.next(items);
    this.countSubject.next(items.reduce((total, item) => total + item.quantity, 0));
  }

  private mapOrderToCartItems(order: any): CartItem[] {
    const items = Array.isArray(order?.items) ? order.items : [];
    return items.map((item: any) => ({
      productId: Number(item.productId ?? 0),
      name: String(item.productName ?? `Product #${item.productId ?? ''}`),
      unitPrice: Number(item.price ?? 0),
      quantity: Number(item.quantity ?? 0),
    }));
  }
}
