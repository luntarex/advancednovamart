import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrderList } from './order-list/order-list';
import { OrderDetail } from './order-detail/order-detail';
import { Checkout } from './checkout/checkout';
import { CheckoutSuccess } from './checkout/success/success';
import { CheckoutCancel } from './checkout/cancel/cancel';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  { path: '', component: OrderList },
  {
    path: 'checkout',
    component: Checkout,
    canActivate: [RoleGuard],
    data: { roles: ['INDIVIDUAL'] },
  },
  {
    path: 'checkout/success',
    component: CheckoutSuccess,
  },
  {
    path: 'checkout/cancel',
    component: CheckoutCancel,
  },
  { path: ':id', component: OrderDetail }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OrdersRoutingModule { }
