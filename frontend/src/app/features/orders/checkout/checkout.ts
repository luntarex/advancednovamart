import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SavedAddress } from '../../../core/models/address.model';
import { CartItem } from '../../../core/models/cart.model';
import { AddressService } from '../../../core/services/address/address.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { CartService } from '../../../core/services/cart/cart.service';
import { OrderService } from '../../../core/services/order/order.service';
import { PaymentService } from '../../../core/services/payment.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-checkout',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DropdownComponent],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly addressService = inject(AddressService);
  private readonly cartService = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly paymentService = inject(PaymentService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly addressMessage = signal('');
  readonly savedAddresses = signal<SavedAddress[]>([]);
  readonly selectedAddressId = signal<string | null>(null);

  readonly paymentOptions: DropdownOption[] = [
    { label: 'Credit Card', value: 'CREDIT_CARD' },
    { label: 'Debit Card', value: 'DEBIT_CARD' },
    { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
    { label: 'Cash on Delivery', value: 'CASH_ON_DELIVERY' },
  ];

  readonly cartItems = signal<CartItem[]>([]);
  readonly role = computed(() => this.auth.getUserRole());
  readonly canCheckout = computed(() => this.role() === 'INDIVIDUAL');

  readonly subtotal = computed(() =>
    this.cartItems().reduce((total, item) => total + item.unitPrice * item.quantity, 0),
  );

  readonly shippingFee = computed(() => (this.subtotal() > 1500 ? 0 : 79));
  readonly grandTotal = computed(() => this.subtotal() + this.shippingFee());

  readonly form = this.fb.nonNullable.group({
    addressLine: ['', [Validators.required, Validators.minLength(10)]],
    city: ['', [Validators.required]],
    district: ['', [Validators.required]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    paymentMethod: ['CREDIT_CARD', [Validators.required]],
  });

  constructor() {
    this.cartService.items$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.cartItems.set(items));
    this.cartService.refreshCart().subscribe();

    this.addressService.addresses$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((addresses) => {
        this.savedAddresses.set(addresses);

        const currentSelectedId = this.selectedAddressId();
        if (currentSelectedId && addresses.some((address) => this.normalizeAddressId(address.id) === currentSelectedId)) {
          return;
        }

        const defaultAddress = addresses.find((address) => address.isDefault);
        if (!defaultAddress) {
          this.selectedAddressId.set(null);
          return;
        }

        this.selectedAddressId.set(this.normalizeAddressId(defaultAddress.id));
        this.applyAddressToForm(defaultAddress);
      });
  }

  removeItem(productId: number): void {
    this.cartService.removeItem(productId).subscribe();
  }

  onSubmit(): void {
    if (!this.canCheckout()) {
      this.submitError.set('Only individual users can complete checkout.');
      return;
    }

    if (this.cartItems().length === 0) {
      this.submitError.set('Your cart is empty.');
      return;
    }

    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set('');

    const payload = {
      storeId: 1,
      paymentMethod: this.form.controls.paymentMethod.value,
      items: this.cartItems().map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };

    this.orderService.create(payload).subscribe({
      next: (createdOrder) => {
        const id = createdOrder?.id ?? 1;
        this.submitSuccess.set('Order placed successfully.');
        this.cartService.clearCart().subscribe({
          next: () => {
            this.cartItems.set([]);
            if (payload.paymentMethod === 'CREDIT_CARD') {
              this.submitSuccess.set('Redirecting to secure payment...');
              this.paymentService.createCheckoutSession(id).subscribe({
                next: (res) => this.paymentService.redirectToStripe(res.url),
                error: () => this.submitError.set('Payment session failed. Please pay from your orders page.')
              });
            } else {
              this.router.navigate(['/orders', id]);
            }
          },
          error: () => {
            if (payload.paymentMethod === 'CREDIT_CARD') {
              this.paymentService.createCheckoutSession(id).subscribe({
                next: (res) => this.paymentService.redirectToStripe(res.url)
              });
            } else {
              this.router.navigate(['/orders', id]);
            }
          },
        });
      },
      error: () => {
        this.submitError.set('Checkout API is unavailable. Please try again later.');
        this.isSubmitting.set(false);
      },
      complete: () => this.isSubmitting.set(false),
    });
  }

  trackByProductId(_: number, item: CartItem): number {
    return item.productId;
  }

  trackBySavedAddress(_: number, address: SavedAddress): string {
    return this.normalizeAddressId(address.id);
  }

  saveCurrentAddress(): void {
    if (
      this.form.controls.addressLine.invalid ||
      this.form.controls.city.invalid ||
      this.form.controls.district.invalid ||
      this.form.controls.phone.invalid
    ) {
      this.form.controls.addressLine.markAsTouched();
      this.form.controls.city.markAsTouched();
      this.form.controls.district.markAsTouched();
      this.form.controls.phone.markAsTouched();
      this.addressMessage.set('Fill in a valid address before saving.');
      return;
    }

    const { addressLine, city, district, phone } = this.form.getRawValue();
    this.addressService.addAddress({
      addressLine,
      city,
      district,
      phone,
    }).subscribe({
      next: (created) => {
        this.selectedAddressId.set(this.normalizeAddressId(created.id));
        this.applyAddressToForm(created);
        this.addressMessage.set('Address saved.');
      },
      error: () => {
        this.addressMessage.set('Failed to save address. Please try again.');
      },
    });
  }

  chooseSavedAddress(addressId: string): void {
    const selectedAddress = this.savedAddresses().find(
      (address) => this.normalizeAddressId(address.id) === this.normalizeAddressId(addressId),
    );
    if (!selectedAddress) {
      this.addressMessage.set('Selected address could not be loaded.');
      return;
    }

    this.selectedAddressId.set(this.normalizeAddressId(selectedAddress.id));
    this.applyAddressToForm(selectedAddress);
    this.addressMessage.set('Saved address loaded into form.');
  }

  isSelectedAddress(address: SavedAddress): boolean {
    return this.normalizeAddressId(address.id) === this.selectedAddressId();
  }

  removeSavedAddress(addressId: string, event: Event): void {
    event.stopPropagation();
    this.addressService.removeAddress(addressId).subscribe({
      next: () => this.addressMessage.set('Saved address removed.'),
      error: () => this.addressMessage.set('Failed to remove address. Please try again.'),
    });
  }

  private applyAddressToForm(address: SavedAddress): void {
    this.form.patchValue({
      addressLine: address.addressLine,
      city: address.city,
      district: address.district,
      phone: address.phone,
    });
  }

  private normalizeAddressId(addressId: string | number): string {
    return String(addressId);
  }
}
