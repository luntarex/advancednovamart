import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { CorporateDashboard } from './corporate-dashboard/corporate-dashboard';
import { IndividualDashboard } from './individual-dashboard/individual-dashboard';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  { path: 'admin', component: AdminDashboard, canActivate: [RoleGuard], data: { roles: ['ADMIN'] } },
  { path: 'corporate', component: CorporateDashboard, canActivate: [RoleGuard], data: { roles: ['CORPORATE'] } },
  { path: 'individual', component: IndividualDashboard, canActivate: [RoleGuard], data: { roles: ['INDIVIDUAL'] } },
  { path: '', redirectTo: 'individual', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DashboardRoutingModule { }
