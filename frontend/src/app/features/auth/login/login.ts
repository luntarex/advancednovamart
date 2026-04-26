import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly submitError = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.submitError.set('');

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        const redirectTarget = this.auth.redirectUrl;
        this.auth.redirectUrl = '';

        if (redirectTarget) {
          this.router.navigateByUrl(redirectTarget);
          return;
        }

        const role = this.auth.getUserRole();
        if (role === 'ADMIN') {
          this.router.navigate(['/dashboard/admin']);
        } else if (role === 'CORPORATE') {
          this.router.navigate(['/dashboard/corporate']);
        } else {
          this.router.navigate(['/dashboard/individual']);
        }
      },
      error: (error) => {
        const apiMessage = error?.error?.message;
        this.submitError.set(apiMessage || 'Login failed. Please check your credentials.');
        this.isSubmitting.set(false);
      },
      complete: () => this.isSubmitting.set(false),
    });
  }
}
