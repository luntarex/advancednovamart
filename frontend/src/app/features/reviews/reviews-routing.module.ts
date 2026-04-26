import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReviewList } from './review-list/review-list';
import { RoleGuard } from '../../core/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: ReviewList,
    canActivate: [RoleGuard],
    data: { roles: ['INDIVIDUAL', 'CORPORATE', 'ADMIN'] },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReviewsRoutingModule { }
