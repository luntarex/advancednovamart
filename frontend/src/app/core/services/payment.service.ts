import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { loadStripe } from '@stripe/stripe-js';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = environment.apiUrl + '/payments';
  private stripePromise = loadStripe(environment.stripePublicKey);

  constructor(private http: HttpClient) {}

  createCheckoutSession(orderId: number): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.apiUrl}/create-checkout-session`, { orderId });
  }

  async redirectToStripe(url: string): Promise<void> {
    window.location.href = url;
  }
}
