import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';

const routes: Routes = [
  { path: 'login',    loadComponent: () => import('./login/login').then(c => c.LoginComponent) },
  { path: 'register', loadComponent: () => import('./register/register').then(c => c.RegisterComponent) },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
