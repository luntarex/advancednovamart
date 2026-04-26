import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { UserService } from '../../../core/services/user/user.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DropdownComponent],
  templateUrl: './complete-profile.html',
  styleUrl: './complete-profile.css',
})
export class CompleteProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');

  readonly membershipOptions: DropdownOption[] = [
    { label: 'Standard', value: 'STANDARD' },
    { label: 'Silver', value: 'SILVER' },
    { label: 'Gold', value: 'GOLD' },
    { label: 'Platinum', value: 'PLATINUM' },
  ];

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    city: ['', [Validators.required]],
    gender: [''],
    membershipType: ['STANDARD'],
  });

  constructor() {
    if (this.auth.getUserRole() !== 'INDIVIDUAL') {
      this.router.navigate(['/products']);
      return;
    }

    this.loadProfileDraft();
  }

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const userId = Number(this.auth.getUserId() ?? 0);
    if (!userId) {
      this.submitError.set('Session expired. Please sign in again.');
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set('');

    this.userService.update(userId, this.form.getRawValue()).subscribe({
      next: () => {
        this.submitSuccess.set('Profile completed successfully.');
        setTimeout(() => this.router.navigate(['/dashboard/individual']), 900);
      },
      error: () => {
        this.submitError.set('Could not save profile right now. Please try again.');
      },
      complete: () => this.isSubmitting.set(false),
    });
  }

  skipForNow(): void {
    this.router.navigate(['/dashboard/individual']);
  }

  private loadProfileDraft(): void {
    const userId = Number(this.auth.getUserId() ?? 0);
    if (!userId) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.isLoading.set(true);
    this.userService.getById(userId).subscribe({
      next: (profile) => {
        this.form.patchValue({
          fullName: String(profile?.fullName ?? profile?.name ?? 'NovaMart User'),
          email: String(profile?.email ?? ''),
          phone: String(profile?.phone ?? ''),
          city: String(profile?.city ?? ''),
          gender: String(profile?.gender ?? ''),
          membershipType: String(profile?.membershipType ?? 'STANDARD'),
        });
      },
      error: () => {
        this.form.patchValue({
          fullName: 'NovaMart User',
          email: '',
          phone: '',
          city: '',
          gender: '',
          membershipType: 'STANDARD',
        });
      },
      complete: () => this.isLoading.set(false),
    });
  }
}
