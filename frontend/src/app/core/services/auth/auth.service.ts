import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private readonly tokenStorageKey = 'token';
  private accessToken: string | null = null;
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  public redirectUrl: string = '';

  constructor(private http: HttpClient) {
    this.hydrateTokenFromStorage();
  }

  setToken(token: string | null): void {
    this.accessToken = token;
    if (token) {
      localStorage.setItem(this.tokenStorageKey, token);
    } else {
      localStorage.removeItem(this.tokenStorageKey);
    }
    this.currentUserSubject.next(token ? this.decodeToken(token) : null);
  }

  getToken(): string | null {
    return this.accessToken;
  }

  private decodeToken(token: string): any | null {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (e) {
      return null;
    }
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const decoded = this.decodeToken(token);
    if (!decoded) return false;
    if (decoded.exp < Date.now() / 1000) {
      this.logout();
      return false;
    }
    return true;
  }

  getUserRole(): string | null {
    const token = this.getToken();
    if (!token) return null;
    const decoded = this.decodeToken(token);
    if (!decoded) return null;
    return decoded.roleType;
  }

  getUserId(): string | null {
    const token = this.getToken();
    if (!token) return null;
    const decoded = this.decodeToken(token);
    if (!decoded) return null;
    return decoded.sub;
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap(response => {
        this.setToken(response.accessToken ?? null);
      })
    );
  }

  logout(): void {
    this.setToken(null);
  }

  register(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, data);
  }

  private hydrateTokenFromStorage(): void {
    const token = localStorage.getItem(this.tokenStorageKey);
    if (!token) {
      return;
    }

    this.accessToken = token;
    if (this.isLoggedIn()) {
      this.currentUserSubject.next(this.decodeToken(token));
      return;
    }

    this.logout();
  }
}
