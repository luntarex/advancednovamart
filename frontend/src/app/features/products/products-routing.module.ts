import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProductList } from './product-list/product-list';
import { ProductDetail } from './product-detail/product-detail';
import { ProductForm } from './product-form/product-form';
import { AuthGuard } from '../../core/guards/auth.guard';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  { path: '', component: ProductList },
  {
    path: 'new',
    component: ProductForm,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CORPORATE', 'ADMIN'] },
  },
  {
    path: ':id/edit',
    component: ProductForm,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CORPORATE', 'ADMIN'] },
  },
  { path: ':id', component: ProductDetail }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductsRoutingModule { }
