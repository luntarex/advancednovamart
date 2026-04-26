import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';

type UserRole = 'INDIVIDUAL' | 'CORPORATE' | 'ADMIN' | null;

type SidebarLink = {
  label: string;
  path: string;
};

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly currentUser = toSignal(this.auth.currentUser$, { initialValue: null as any });

  readonly isCollapsed = signal(false);

  readonly commonLinks: SidebarLink[] = [
    { label: 'Products', path: '/products' },
    { label: 'My Orders', path: '/orders' },
    { label: 'Profile', path: '/profile' },
    { label: 'Reviews', path: '/reviews' },
  ];

  readonly individualLinks: SidebarLink[] = [
    { label: 'My Dashboard', path: '/dashboard/individual' },
    { label: 'Chat Support', path: '/chatbot' },
  ];

  readonly corporateLinks: SidebarLink[] = [
    { label: 'Corporate Dashboard', path: '/dashboard/corporate' },
    { label: 'Analytics', path: '/analytics' },
    { label: 'Shipments', path: '/shipments' },
    { label: 'AI Chatbot', path: '/chatbot' },
  ];

  readonly adminLinks: SidebarLink[] = [
    { label: 'Admin Dashboard', path: '/dashboard/admin' },
    { label: 'Manage Users', path: '/admin/users' },
    { label: 'Manage Stores', path: '/admin/stores' },
    { label: 'Platform Analytics', path: '/analytics' },
    { label: 'AI Chatbot', path: '/chatbot' },
  ];

  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly role = computed<UserRole>(() => {
    const user = this.currentUser();
    return (user?.roleType ?? null) as UserRole;
  });

  toggleCollapsed(): void {
    this.isCollapsed.update((value) => !value);
  }
}
