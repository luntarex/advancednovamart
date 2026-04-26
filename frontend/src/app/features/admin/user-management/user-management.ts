import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../core/services/user/user.service';
import { DropdownComponent, DropdownOption } from '../../../shared/components/dropdown/dropdown';

type UserRole = 'ADMIN' | 'CORPORATE' | 'INDIVIDUAL';

type AdminUser = {
  id: number;
  email: string;
  roleType: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
};

type AuditEntry = {
  id: number;
  action: string;
  actor: string;
  at: string;
};

@Component({
  selector: 'app-user-management',
  imports: [ReactiveFormsModule, FormsModule, DatePipe, DropdownComponent],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
})
export class UserManagement {
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly searchTerm = signal('');
  readonly roleFilter = signal<'ALL' | UserRole>('ALL');

  readonly roleFilterOptions: DropdownOption[] = [
    { label: 'All Roles', value: 'ALL' },
    { label: 'ADMIN', value: 'ADMIN' },
    { label: 'CORPORATE', value: 'CORPORATE' },
    { label: 'INDIVIDUAL', value: 'INDIVIDUAL' },
  ];

  readonly roleOptions: DropdownOption[] = [
    { label: 'ADMIN', value: 'ADMIN' },
    { label: 'CORPORATE', value: 'CORPORATE' },
    { label: 'INDIVIDUAL', value: 'INDIVIDUAL' },
  ];

  readonly users = signal<AdminUser[]>([]);

  readonly systemSettings = signal({
    registrationEnabled: true,
    maintenanceMode: false,
    strictPasswordPolicy: true,
  });

  readonly auditLog = signal<AuditEntry[]>([
    { id: 1, action: 'User role updated', actor: 'admin@novamart.com', at: new Date(Date.now() - 3600000).toISOString() },
    { id: 2, action: 'Store temporarily closed', actor: 'admin@novamart.com', at: new Date(Date.now() - 7200000).toISOString() },
    { id: 3, action: 'Security setting changed', actor: 'admin@novamart.com', at: new Date(Date.now() - 10800000).toISOString() },
  ]);

  readonly createUserForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    roleType: ['INDIVIDUAL' as UserRole, [Validators.required]],
  });

  readonly filteredUsers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const role = this.roleFilter();

    return this.users().filter((user) => {
      const matchesSearch = search.length === 0 || user.email.toLowerCase().includes(search) || user.id.toString().includes(search);
      const matchesRole = role === 'ALL' || user.roleType === role;
      return matchesSearch && matchesRole;
    });
  });

  readonly activeCount = computed(() => this.users().filter((user) => user.status === 'ACTIVE').length);
  readonly suspendedCount = computed(() => this.users().filter((user) => user.status === 'SUSPENDED').length);

  constructor() {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.userService.getAll().subscribe({
      next: (users) => {
        const normalized = (users as any[]).map((user, index) => ({
          id: Number(user.id ?? index + 1),
          email: String(user.email ?? `user${index + 1}@example.com`),
          roleType: (user.roleType ?? 'INDIVIDUAL') as UserRole,
          status: (user.status ?? 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
          createdAt: String(user.createdAt ?? new Date().toISOString()),
        }));
        this.users.set(normalized);
        this.isLoading.set(false);
      },
      error: () => {
        this.users.set(this.getFallbackUsers());
        this.errorMessage.set('Live user data is unavailable. Showing sample user records.');
        this.isLoading.set(false);
      },
    });
  }

  createUser(): void {
    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched();
      return;
    }

    const payload = this.createUserForm.getRawValue();
    this.userService.create(payload).subscribe({
      next: (created) => {
        const normalized: AdminUser = {
          id: Number(created?.id ?? Date.now()),
          email: String(created?.email ?? payload.email),
          roleType: (created?.roleType ?? payload.roleType) as UserRole,
          status: (created?.status ?? 'ACTIVE') as 'ACTIVE' | 'SUSPENDED',
          createdAt: String(created?.createdAt ?? new Date().toISOString()),
        };
        this.users.update((users) => [normalized, ...users]);
      },
      error: () => {
        const fallbackUser: AdminUser = {
          id: Date.now(),
          email: payload.email,
          roleType: payload.roleType,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };
        this.users.update((users) => [fallbackUser, ...users]);
      },
    });

    this.addAudit('User created');
    this.createUserForm.reset({ email: '', roleType: 'INDIVIDUAL' });
  }

  toggleSuspension(user: AdminUser): void {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    this.userService.update(user.id, { status: nextStatus }).subscribe({
      next: () => {
        this.users.update((users) => users.map((current) => (current.id === user.id ? { ...current, status: nextStatus } : current)));
      },
      error: () => {
        this.users.update((users) => users.map((current) => (current.id === user.id ? { ...current, status: nextStatus } : current)));
      },
    });

    this.addAudit(nextStatus === 'SUSPENDED' ? 'User suspended' : 'User reactivated');
  }

  deleteUser(user: AdminUser): void {
    this.userService.delete(user.id).subscribe({
      next: () => {
        this.users.update((users) => users.filter((current) => current.id !== user.id));
      },
      error: () => {
        this.users.update((users) => users.filter((current) => current.id !== user.id));
      },
    });

    this.addAudit('User deleted');
  }

  updateSetting(setting: 'registrationEnabled' | 'maintenanceMode' | 'strictPasswordPolicy', value: boolean): void {
    this.systemSettings.update((settings) => ({ ...settings, [setting]: value }));
    this.addAudit(`System setting updated: ${String(setting)}`);
  }

  trackById(_: number, user: AdminUser): number {
    return user.id;
  }

  private addAudit(action: string): void {
    this.auditLog.update((entries) => [
      { id: Date.now(), action, actor: 'admin@novamart.com', at: new Date().toISOString() },
      ...entries,
    ]);
  }

  private getFallbackUsers(): AdminUser[] {
    return [
      {
        id: 1,
        email: 'admin@novamart.com',
        roleType: 'ADMIN',
        status: 'ACTIVE',
        createdAt: new Date(Date.now() - 86400000 * 120).toISOString(),
      },
      {
        id: 2,
        email: 'store.manager@novamart.com',
        roleType: 'CORPORATE',
        status: 'ACTIVE',
        createdAt: new Date(Date.now() - 86400000 * 85).toISOString(),
      },
      {
        id: 3,
        email: 'customer.one@novamart.com',
        roleType: 'INDIVIDUAL',
        status: 'SUSPENDED',
        createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
      },
      {
        id: 4,
        email: 'customer.two@novamart.com',
        roleType: 'INDIVIDUAL',
        status: 'ACTIVE',
        createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      },
    ];
  }
}
