import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ManageAddresses } from './manage-addresses/manage-addresses';

const routes: Routes = [{ path: '', component: ManageAddresses }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddressesRoutingModule {}

