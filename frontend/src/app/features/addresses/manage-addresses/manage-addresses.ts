import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SavedAddress } from '../../../core/models/address.model';
import { AddressService } from '../../../core/services/address/address.service';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-manage-addresses',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './manage-addresses.html',
  styleUrl: './manage-addresses.css',
})
export class ManageAddresses {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly addressService = inject(AddressService);

  readonly role = computed(() => this.auth.getUserRole());
  readonly savedAddresses = signal<SavedAddress[]>([]);
  readonly selectedAddressId = signal<string | null>(null);
  readonly message = signal('');

  readonly form = this.fb.nonNullable.group({
    addressLine: ['', [Validators.required, Validators.minLength(10)]],
    city: ['', [Validators.required]],
    district: ['', [Validators.required]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.addressService.addresses$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((addresses) => this.savedAddresses.set(addresses));

    this.addressService.selectedAddressId$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((addressId) => this.selectedAddressId.set(addressId));
  }

  saveAddress(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.message.set('Please fill all address fields correctly.');
      return;
    }

    const { addressLine, city, district, phone } = this.form.getRawValue();
    this.addressService.addAddress({ addressLine, city, district, phone }).subscribe({
      next: (created) => {
        this.form.reset({
          addressLine: '',
          city: created.city,
          district: '',
          phone: '',
        });
        this.message.set('Address saved.');
      },
      error: () => this.message.set('Failed to save address. Please try again.')
    });
  }

  chooseAddress(addressId: string | number): void {
    this.addressService.setSelectedAddress(this.normalizeAddressId(addressId)).subscribe({
      next: () => this.message.set('Default delivery address updated.'),
      error: () => this.message.set('Failed to update default address. Please try again.'),
    });
  }

  removeAddress(addressId: string | number): void {
    this.addressService.removeAddress(this.normalizeAddressId(addressId)).subscribe({
      next: () => this.message.set('Address removed.'),
      error: () => this.message.set('Failed to remove address. Please try again.')
    });
  }

  trackById(_: number, address: SavedAddress): string {
    return this.normalizeAddressId(address.id);
  }

  isDefaultAddress(address: SavedAddress): boolean {
    return this.normalizeAddressId(address.id) === this.selectedAddressId();
  }

  private normalizeAddressId(addressId: string | number): string {
    return String(addressId);
  }
}
