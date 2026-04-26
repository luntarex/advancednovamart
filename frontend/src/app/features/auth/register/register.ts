import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DropdownComponent],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly submitError = signal('');
  readonly submitSuccess = signal('');

  readonly roleOptions: DropdownOption[] = [
    { label: 'Individual', value: 'INDIVIDUAL' },
    { label: 'Corporate', value: 'CORPORATE' },
  ];

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    roleType: ['INDIVIDUAL', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  get passwordMismatch(): boolean {
    const password = this.form.controls.password.value;
    const confirmPassword = this.form.controls.confirmPassword.value;
    return confirmPassword.length > 0 && password !== confirmPassword;
  }

  onSubmit(): void {
    if (this.form.invalid || this.passwordMismatch || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set('');

    const { fullName, email, password, roleType } = this.form.getRawValue();

    this.auth
      .register({
        fullName,
        email,
        password,
        roleType,
      })
      .subscribe({
        next: () => {
          if (roleType === 'INDIVIDUAL') {
            this.auth.login(email, password).subscribe({
              next: () => {
                this.submitSuccess.set('Account created. Complete your profile to continue.');
                this.router.navigate(['/auth/complete-profile']);
              },
              error: () => {
                this.submitSuccess.set('Account created. Please sign in to continue.');
                setTimeout(() => this.router.navigate(['/auth/login']), 1200);
              },
              complete: () => this.isSubmitting.set(false),
            });
            return;
          }

          this.submitSuccess.set('Your account was created. You can sign in now.');
          this.form.reset({
            fullName: '',
            email: '',
            roleType: 'INDIVIDUAL',
            password: '',
            confirmPassword: '',
          });
          setTimeout(() => this.router.navigate(['/auth/login']), 1200);
        },
        error: (error) => {
          const apiMessage = error?.error?.message;
          this.submitError.set(apiMessage || 'Registration failed. Please try again.');
          this.isSubmitting.set(false);
        },
        complete: () => this.isSubmitting.set(false),
      });
  }
}
