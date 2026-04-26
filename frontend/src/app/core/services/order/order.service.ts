import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private apiUrl = `${environment.apiUrl}/orders`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  getCart(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/cart`);
  }

  addCartItem(productId: number, quantity: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/cart/items`, { productId, quantity });
  }

  updateCartItem(productId: number, quantity: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/cart/items/${productId}`, { quantity });
  }

  removeCartItem(productId: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/cart/items/${productId}`);
  }

  clearCart(): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/cart`);
  }

  getCartCount(): Observable<number> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/cart/count`).pipe(
      map((res) => Number(res?.count ?? 0)),
    );
  }

  update(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
