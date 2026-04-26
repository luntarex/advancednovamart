import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AnalyticsDashboard } from './analytics-dashboard/analytics-dashboard';
import { CustomerSegmentation } from './customer-segmentation/customer-segmentation';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: AnalyticsDashboard,
    canActivate: [RoleGuard],
    data: { roles: ['CORPORATE', 'ADMIN'] },
  },
  {
    path: 'customer-segmentation',
    component: CustomerSegmentation,
    canActivate: [RoleGuard],
    data: { roles: ['CORPORATE', 'ADMIN'] },
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AnalyticsRoutingModule { }
