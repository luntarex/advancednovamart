import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProfileView } from './profile-view/profile-view';

const routes: Routes = [
  { path: '', component: ProfileView }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProfileRoutingModule { }
