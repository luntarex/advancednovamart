import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CartView } from './cart-view/cart-view';

const routes: Routes = [{ path: '', component: CartView }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CartRoutingModule {}
