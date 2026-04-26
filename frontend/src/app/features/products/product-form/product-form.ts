import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Category } from '../../../core/models/category.model';
import { Store } from '../../../core/models/store.model';
import { CategoryService } from '../../../core/services/category/category.service';
import { ProductService } from '../../../core/services/prodcut/product.service';
import { StoreService } from '../../../core/services/store/store.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, DropdownComponent],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
})
export class ProductForm {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly storeService = inject(StoreService);

  readonly isSubmitting = signal(false);
  readonly isLoading = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');
  readonly editingProductId = signal<number | null>(null);
  readonly categoryOptions = signal<DropdownOption[]>([
    { label: 'Select category', value: 0 },
  ]);
  readonly storeOptions = signal<DropdownOption[]>([
    { label: 'Select store', value: 0 },
  ]);

  readonly isEditMode = computed(() => this.editingProductId() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sku: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    imageUrl: [''],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    stockQuantity: [0, [Validators.required, Validators.min(0)]],
    categoryId: [0, [Validators.min(0)]],
    storeId: [0, [Validators.min(0)]],
  });

  constructor() {
    this.loadCategoryOptions();
    this.loadStoreOptions();

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
          imageUrl: '',
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
          imageUrl: product.imageUrl || '',
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

  private loadCategoryOptions(): void {
    this.categoryService.getAll().subscribe({
      next: (categories) => {
        this.categoryOptions.set(this.toCategoryOptions(categories));
        this.refreshDropdownSelections();
      },
      error: () => {
        this.categoryOptions.set([{ label: 'Select category', value: 0 }]);
      },
    });
  }

  private loadStoreOptions(): void {
    this.storeService.getAll().subscribe({
      next: (stores) => {
        this.storeOptions.set(this.toStoreOptions(stores));
        this.refreshDropdownSelections();
      },
      error: () => {
        this.storeOptions.set([{ label: 'Select store', value: 0 }]);
      },
    });
  }

  private toCategoryOptions(categories: Category[]): DropdownOption[] {
    const mapped = categories.map((category) => ({
      label: category.name,
      value: Number(category.id),
    }));
    return [{ label: 'Select category', value: 0 }, ...mapped];
  }

  private toStoreOptions(stores: Store[]): DropdownOption[] {
    const mapped = stores.map((store) => ({
      label: `${store.name} (#${store.id})`,
      value: Number(store.id),
    }));
    return [{ label: 'Select store', value: 0 }, ...mapped];
  }

  private refreshDropdownSelections(): void {
    const categoryId = this.form.controls.categoryId.value;
    const storeId = this.form.controls.storeId.value;
    this.form.controls.categoryId.setValue(categoryId, { emitEvent: false });
    this.form.controls.storeId.setValue(storeId, { emitEvent: false });
  }
}
