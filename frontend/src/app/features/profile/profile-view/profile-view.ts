import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { UserService } from '../../../core/services/user/user.service';

type UserPreferences = {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingOptIn: boolean;
  darkMode: boolean;
};

@Component({
  selector: 'app-profile-view',
  imports: [DatePipe],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.css',
})
export class ProfileView {
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly user = signal<User | null>(null);
  readonly role = computed(() => this.auth.getUserRole());
  readonly userId = computed(() => Number(this.auth.getUserId() ?? 0));

  readonly preferences = signal<UserPreferences>({
    emailNotifications: true,
    smsNotifications: false,
    marketingOptIn: true,
    darkMode: false,
  });

  constructor() {
    this.loadPreferences();
    this.loadProfile();
  }

  savePreferences(): void {
    localStorage.setItem('profilePreferences', JSON.stringify(this.preferences()));
    
    // Apply dark mode immediately across the app
    if (this.preferences().darkMode) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
    
    this.successMessage.set('Preferences saved.');
    setTimeout(() => this.successMessage.set(''), 3000);
  }

  updatePreference(key: keyof UserPreferences, value: boolean): void {
    this.preferences.update((prefs) => ({ ...prefs, [key]: value }));
  }

  private loadProfile(): void {
    const id = this.userId();
    if (!id) {
      this.errorMessage.set('No user id found. Please sign in again.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.userService.getById(id).subscribe({
      next: (data) => {
        const roleType = this.role() as User['roleType'];
        const normalized: User = {
          id: Number(data?.id ?? id),
          email: String(data?.email ?? `user${id}@novamart.com`),
          roleType: (data?.roleType ?? roleType ?? 'INDIVIDUAL') as User['roleType'],
          gender: String(data?.gender ?? ''),
          createdAt: String(data?.createdAt ?? new Date().toISOString()),
        };
        this.user.set(normalized);
        this.isLoading.set(false);
      },
      error: () => {
        const fallback = this.getFallbackProfile(id);
        this.user.set(fallback);
        this.errorMessage.set('Live profile data is unavailable. Showing sample profile data.');
        this.isLoading.set(false);
      },
    });
  }

  private loadPreferences(): void {
    const raw = localStorage.getItem('profilePreferences');
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.preferences.set({
        emailNotifications: !!parsed.emailNotifications,
        smsNotifications: !!parsed.smsNotifications,
        marketingOptIn: !!parsed.marketingOptIn,
        darkMode: !!parsed.darkMode,
      });
    } catch {
      this.preferences.set({
        emailNotifications: true,
        smsNotifications: false,
        marketingOptIn: true,
        darkMode: false,
      });
    }
  }

  private getFallbackProfile(id: number): User {
    return {
      id,
      email: `user${id}@novamart.com`,
      roleType: (this.role() as User['roleType']) || 'INDIVIDUAL',
      gender: 'UNSPECIFIED',
      createdAt: new Date(Date.now() - 86400000 * 120).toISOString(),
    };
  }

  getAccountTypeLabel(roleType: User['roleType'] | null | undefined): string {
    switch (roleType) {
      case 'ADMIN':
        return 'Administrator';
      case 'CORPORATE':
        return 'Business Account';
      case 'INDIVIDUAL':
      default:
        return 'Personal Account';
    }
  }
}
