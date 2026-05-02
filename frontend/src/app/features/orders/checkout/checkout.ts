import { CurrencyPipe } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { StripeCardCvcElement, StripeCardExpiryElement, StripeCardNumberElement, StripeElements } from '@stripe/stripe-js';
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
export class Checkout implements AfterViewInit {
  @ViewChild('cardNumberElementContainer') private cardNumberElementContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cardExpiryElementContainer') private cardExpiryElementContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cardCvcElementContainer') private cardCvcElementContainer?: ElementRef<HTMLDivElement>;

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
  readonly cardError = signal('');
  readonly isCardReady = signal(false);
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
  readonly selectedPaymentMethod = signal('CREDIT_CARD');
  readonly isCardPayment = computed(() => this.isCreditCardMethod(this.selectedPaymentMethod()));
  readonly isBankTransfer = computed(() => this.normalizePaymentMethod(this.selectedPaymentMethod()) === 'BANK_TRANSFER');

  readonly form = this.fb.nonNullable.group({
    addressLine: ['', [Validators.required, Validators.minLength(10)]],
    city: ['', [Validators.required]],
    district: ['', [Validators.required]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    paymentMethod: ['CREDIT_CARD', [Validators.required]],
    payerFullName: ['', [Validators.required, Validators.minLength(3)]],
    payerEmail: ['', [Validators.required, Validators.email]],
    transferReference: [''],
    deliveryNote: [''],
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

    this.form.controls.paymentMethod.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const paymentMethod = value ?? '';
        this.selectedPaymentMethod.set(paymentMethod);
        this.syncPaymentValidators(paymentMethod);
        window.setTimeout(() => this.syncStripeCardElement());
      });

    this.selectedPaymentMethod.set(this.form.controls.paymentMethod.value);
    this.syncPaymentValidators(this.form.controls.paymentMethod.value);
  }

  ngAfterViewInit(): void {
    window.setTimeout(() => this.syncStripeCardElement());
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
        if (this.isCreditCardMethod(payload.paymentMethod)) {
          this.finishCheckout(id, payload.paymentMethod);
          return;
        }

        this.submitSuccess.set('Order placed successfully.');
        this.cartService.clearCart().subscribe({
          next: () => {
            this.cartItems.set([]);
            this.finishCheckout(id, payload.paymentMethod);
          },
          error: () => {
            this.finishCheckout(id, payload.paymentMethod);
          },
        });
      },
      error: () => {
        this.submitError.set('Checkout API is unavailable. Please try again later.');
        this.isSubmitting.set(false);
      },
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

  private syncPaymentValidators(paymentMethod: string): void {
    const isCard = this.isCreditCardMethod(paymentMethod);
    const fullNameControl = this.form.controls.payerFullName;
    const emailControl = this.form.controls.payerEmail;

    if (isCard) {
      fullNameControl.clearValidators();
      emailControl.clearValidators();
    } else {
      fullNameControl.setValidators([Validators.required, Validators.minLength(3)]);
      emailControl.setValidators([Validators.required, Validators.email]);
    }

    fullNameControl.updateValueAndValidity({ emitEvent: false });
    emailControl.updateValueAndValidity({ emitEvent: false });
  }

  private finishCheckout(orderId: number, paymentMethod: string): void {
    if (this.isCreditCardMethod(paymentMethod)) {
      this.confirmInlineCardPayment(orderId);
      return;
    }

    this.router.navigate(['/orders', orderId], { queryParams: { placed: 'true' } });
  }

  private confirmInlineCardPayment(orderId: number): void {
    if (!this.cardNumberElement) {
      this.submitError.set('Card form is not ready yet. Please wait a moment and try again.');
      this.isSubmitting.set(false);
      return;
    }

    this.submitSuccess.set('Processing secure card payment...');
    this.paymentService.createPaymentIntent(orderId).subscribe({
      next: async (res) => {
        const stripe = await this.paymentService.stripePromise;
        if (!stripe || !res?.clientSecret || !this.cardNumberElement) {
          this.submitError.set('Stripe payment form could not be initialized.');
          this.isSubmitting.set(false);
          return;
        }

        const result = await stripe.confirmCardPayment(res.clientSecret, {
          payment_method: {
            card: this.cardNumberElement,
            billing_details: {
              name: this.form.controls.payerFullName.value || undefined,
              email: this.form.controls.payerEmail.value || undefined,
            },
          },
        });

        if (result.error) {
          this.submitError.set(result.error.message ?? 'Card payment failed. Please check your card details.');
          this.isSubmitting.set(false);
          return;
        }

        this.cartService.clearCart().subscribe({
          next: () => this.cartItems.set([]),
          error: () => undefined,
        });
        this.router.navigate(['/orders', orderId], { queryParams: { placed: 'true', payment: 'success' } });
      },
      error: () => {
        this.submitError.set('Payment setup failed. Please try again later.');
        this.isSubmitting.set(false);
      },
    });
  }

  private stripeElements?: StripeElements;
  private cardNumberElement?: StripeCardNumberElement;
  private cardExpiryElement?: StripeCardExpiryElement;
  private cardCvcElement?: StripeCardCvcElement;
  private readonly cardFieldCompletion = {
    number: false,
    expiry: false,
    cvc: false,
  };

  private async syncStripeCardElement(): Promise<void> {
    if (!this.isCardPayment()) {
      this.destroyStripeCardElements();
      this.stripeElements = undefined;
      this.isCardReady.set(false);
      this.cardError.set('');
      return;
    }

    if (
      !this.cardNumberElementContainer ||
      !this.cardExpiryElementContainer ||
      !this.cardCvcElementContainer ||
      this.cardNumberElement
    ) {
      return;
    }

    const stripe = await this.paymentService.stripePromise;
    if (!stripe) {
      this.cardError.set('Stripe could not be loaded. Check the public key and network connection.');
      return;
    }

    this.stripeElements = stripe.elements();
    const cardStyle = {
      base: {
        color: '#111827',
        fontSize: '15px',
        fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
        '::placeholder': {
          color: '#9ca3af',
        },
      },
    };

    this.cardNumberElement = this.stripeElements.create('cardNumber', {
      showIcon: true,
      disableLink: true,
      placeholder: 'Card number',
      style: cardStyle,
    });
    this.cardExpiryElement = this.stripeElements.create('cardExpiry', {
      placeholder: 'MM / YY',
      style: cardStyle,
    });
    this.cardCvcElement = this.stripeElements.create('cardCvc', {
      placeholder: 'CVC',
      style: cardStyle,
    });

    this.cardNumberElement.on('change', (event) => {
      this.cardFieldCompletion.number = event.complete;
      this.cardError.set(event.error?.message ?? '');
      this.updateCardReadyState();
    });
    this.cardExpiryElement.on('change', (event) => {
      this.cardFieldCompletion.expiry = event.complete;
      this.cardError.set(event.error?.message ?? '');
      this.updateCardReadyState();
    });
    this.cardCvcElement.on('change', (event) => {
      this.cardFieldCompletion.cvc = event.complete;
      this.cardError.set(event.error?.message ?? '');
      this.updateCardReadyState();
    });

    this.cardNumberElement.mount(this.cardNumberElementContainer.nativeElement);
    this.cardExpiryElement.mount(this.cardExpiryElementContainer.nativeElement);
    this.cardCvcElement.mount(this.cardCvcElementContainer.nativeElement);
  }

  private destroyStripeCardElements(): void {
    this.cardNumberElement?.destroy();
    this.cardExpiryElement?.destroy();
    this.cardCvcElement?.destroy();
    this.cardNumberElement = undefined;
    this.cardExpiryElement = undefined;
    this.cardCvcElement = undefined;
    this.cardFieldCompletion.number = false;
    this.cardFieldCompletion.expiry = false;
    this.cardFieldCompletion.cvc = false;
  }

  private updateCardReadyState(): void {
    this.isCardReady.set(
      this.cardFieldCompletion.number &&
      this.cardFieldCompletion.expiry &&
      this.cardFieldCompletion.cvc,
    );
  }

  private redirectToHostedCheckout(orderId: number): void {
    this.submitSuccess.set('Redirecting to secure payment...');
    this.paymentService.createCheckoutSession(orderId).subscribe({
        next: (res) => {
          if (res?.url) {
            this.paymentService.redirectToStripe(res.url);
            return;
          }

          this.submitError.set('Payment session did not return a Stripe checkout URL.');
        },
        error: () => {
          this.submitError.set('Payment session failed. You can review the order and try again later.');
          this.router.navigate(['/orders', orderId], { queryParams: { placed: 'true' } });
        },
      });
  }

  private normalizePaymentMethod(value: string): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();
  }

  private isCreditCardMethod(value: string): boolean {
    const normalized = this.normalizePaymentMethod(value);
    return normalized === 'CREDIT_CARD' || normalized === 'DEBIT_CARD' || normalized === 'CARD';
  }
}
