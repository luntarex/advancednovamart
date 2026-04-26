import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private apiUrl = `${environment.apiUrl}/analytics`;

  constructor(private http: HttpClient) {}

  getSalesByCategory(dateRange?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/sales-by-category`, { params: dateRange });
  }

  getRevenueTrend(dateRange?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/revenue-trend`, { params: dateRange });
  }

  getTopProducts(limit = 5): Observable<any> {
    return this.http.get(`${this.apiUrl}/top-products`, { params: { limit } });
  }

  getCustomerSegments(): Observable<any> {
    return this.http.get(`${this.apiUrl}/customer-segments`);
  }
}
