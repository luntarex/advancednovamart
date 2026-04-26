import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UserManagement } from './user-management/user-management';
import { StoreManagement } from './store-management/store-management';
import { CategoryManagement } from './category-management/category-management';
import { SystemConfig } from './system-config/system-config';
import { AuditLogs } from './audit-logs/audit-logs';
import { CrossStoreComparison } from './cross-store-comparison/cross-store-comparison';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    canActivateChild: [RoleGuard],
    data: { roles: ['ADMIN'] },
    children: [
      { path: 'users', component: UserManagement },
      { path: 'stores', component: StoreManagement },
      { path: 'categories', component: CategoryManagement },
      { path: 'system-config', component: SystemConfig },
      { path: 'audit-logs', component: AuditLogs },
      { path: 'cross-store-comparison', component: CrossStoreComparison },
      { path: '', redirectTo: 'users', pathMatch: 'full' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule { }
