import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { loadStripe, Stripe } from '@stripe/stripe-js';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = environment.apiUrl + '/payments';
  readonly stripePromise: Promise<Stripe | null> = loadStripe(environment.stripePublicKey);

  constructor(private http: HttpClient) {}

  createCheckoutSession(orderId: number): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.apiUrl}/create-checkout-session`, { orderId });
  }

  createPaymentIntent(orderId: number): Observable<{ clientSecret: string }> {
    return this.http.post<{ clientSecret: string }>(`${this.apiUrl}/create-payment-intent`, { orderId });
  }

  async redirectToStripe(url: string): Promise<void> {
    window.location.href = url;
  }
}
