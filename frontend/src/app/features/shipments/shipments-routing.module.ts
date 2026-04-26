import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShipmentTracking } from './shipment-tracking/shipment-tracking';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: ShipmentTracking,
    canActivate: [RoleGuard],
    data: { roles: ['INDIVIDUAL', 'CORPORATE', 'ADMIN'] },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ShipmentsRoutingModule { }
