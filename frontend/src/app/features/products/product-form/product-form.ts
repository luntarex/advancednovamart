import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../core/services/prodcut/product.service';

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
})
export class ProductForm {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);

  readonly isSubmitting = signal(false);
  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly editingProductId = signal<number | null>(null);

  readonly isEditMode = computed(() => this.editingProductId() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sku: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    stockQuantity: [0, [Validators.required, Validators.min(0)]],
    categoryId: [0, [Validators.min(0)]],
    storeId: [0, [Validators.min(0)]],
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const idParam = params.get('id');
      const parsedId = idParam ? Number(idParam) : NaN;

      if (Number.isFinite(parsedId) && parsedId > 0) {
        this.editingProductId.set(parsedId);
        this.loadProduct(parsedId);
      } else {
        this.editingProductId.set(null);
        this.form.reset({
          name: '',
          sku: '',
          description: '',
          unitPrice: 0,
          stockQuantity: 0,
          categoryId: 0,
          storeId: 0,
        });
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set('');

    const payload = this.form.getRawValue();
    const productId = this.editingProductId();

    if (productId) {
      this.productService.update(productId, payload).subscribe({
        next: () => {
          this.submitSuccess.set('Product updated successfully.');
          this.router.navigate(['/products', productId]);
        },
        error: () => {
          this.submitError.set('Update failed. Please try again.');
          this.isSubmitting.set(false);
        },
        complete: () => this.isSubmitting.set(false),
      });
      return;
    }

    this.productService.create(payload).subscribe({
      next: (created) => {
        this.submitSuccess.set('Product created successfully.');
        this.router.navigate(['/products', created.id]);
      },
      error: () => {
        this.submitError.set('Creation failed. Please try again.');
        this.isSubmitting.set(false);
      },
      complete: () => this.isSubmitting.set(false),
    });
  }

  private loadProduct(id: number): void {
    this.isLoading.set(true);
    this.submitError.set('');

    this.productService.getById(id).subscribe({
      next: (product) => {
        this.form.patchValue({
          name: product.name,
          sku: product.sku,
          description: product.description || '',
          unitPrice: product.unitPrice,
          stockQuantity: product.stockQuantity,
          categoryId: product.categoryId ?? 0,
          storeId: product.storeId ?? 0,
        });
        this.isLoading.set(false);
      },
      error: () => {
        this.submitError.set('Could not load product details.');
        this.isLoading.set(false);
      },
    });
  }
}
