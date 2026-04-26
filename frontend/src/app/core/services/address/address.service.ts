import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, of, switchMap, tap } from 'rxjs';
import { SavedAddress } from '../../models/address.model';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

type AddressInput = Omit<SavedAddress, 'id' | 'createdAt' | 'isDefault'>;
type ApiAddress = Partial<SavedAddress> & {
  id: string | number;
  default?: boolean;
  isDefault?: boolean;
};

@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/addresses`;

  private readonly addressesSubject = new BehaviorSubject<SavedAddress[]>([]);
  readonly addresses$ = this.addressesSubject.asObservable();

  private readonly selectedAddressIdSubject = new BehaviorSubject<string | null>(null);
  readonly selectedAddressId$ = this.selectedAddressIdSubject.asObservable();

  constructor() {
    this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.fetchAddresses().subscribe();
      } else {
        this.addressesSubject.next([]);
        this.selectedAddressIdSubject.next(null);
      }
    });
  }

  getAddresses(): SavedAddress[] {
    return this.addressesSubject.value;
  }

  getSelectedAddressId(): string | null {
    return this.selectedAddressIdSubject.value;
  }

  getSelectedAddress(): SavedAddress | null {
    const selectedId = this.getSelectedAddressId();
    if (!selectedId) {
      return null;
    }

    return this.getAddresses().find((address) => address.id.toString() === selectedId) ?? null;
  }

  fetchAddresses(): Observable<SavedAddress[]> {
    return this.http.get<ApiAddress[]>(this.apiUrl).pipe(
      map((addresses) => addresses.map((address) => this.normalizeAddress(address))),
      tap((addresses) => {
        this.addressesSubject.next(addresses);
        const defaultAddress = addresses.find((address) => address.isDefault);
        const selectedAddress = defaultAddress ?? addresses[0] ?? null;
        this.selectedAddressIdSubject.next(selectedAddress?.id.toString() ?? null);
      })
    );
  }

  addAddress(input: AddressInput): Observable<SavedAddress> {
    return this.http.post<ApiAddress>(this.apiUrl, input).pipe(
      map((newAddress) => this.normalizeAddress(newAddress)),
      tap((newAddress) => {
        const nextAddresses = [newAddress, ...this.getAddresses()].map((address) => {
          if (!newAddress.isDefault) {
            return address;
          }

          return {
            ...address,
            isDefault: address.id.toString() === newAddress.id.toString(),
          };
        });
        this.addressesSubject.next(nextAddresses);
        this.selectedAddressIdSubject.next(newAddress.isDefault ? newAddress.id.toString() : this.getSelectedAddressId());
      })
    );
  }

  removeAddress(addressId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${addressId}`).pipe(
      switchMap(() => this.fetchAddresses()),
      map(() => void 0)
    );
  }

  setSelectedAddress(addressId: string | null): Observable<SavedAddress | null> {
    if (!addressId) {
      this.selectedAddressIdSubject.next(null);
      return of(null);
    }

    if (addressId && !this.getAddresses().some((address) => address.id.toString() === addressId)) {
      return of(null);
    }

    return this.http.put<ApiAddress>(`${this.apiUrl}/${addressId}/default`, {}).pipe(
      map((updatedAddress) => this.normalizeAddress(updatedAddress)),
      tap((updatedAddress) => {
        const updatedId = updatedAddress.id.toString();
        const nextAddresses = this.getAddresses().map((address) => ({
          ...address,
          isDefault: address.id.toString() === updatedId,
        }));
        this.addressesSubject.next(nextAddresses);
        this.selectedAddressIdSubject.next(updatedId);
      })
    );
  }

  private normalizeAddress(address: ApiAddress): SavedAddress {
    return {
      id: String(address.id),
      addressLine: String(address.addressLine ?? ''),
      city: String(address.city ?? ''),
      district: String(address.district ?? ''),
      phone: String(address.phone ?? ''),
      isDefault: Boolean(address.isDefault ?? address.default ?? false),
      createdAt: String(address.createdAt ?? ''),
    };
  }
}
