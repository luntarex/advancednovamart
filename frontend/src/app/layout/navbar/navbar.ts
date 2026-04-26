import { ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, inject, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AdminRoutingModule } from "../../features/admin/admin-routing.module";
import { SavedAddress } from '../../core/models/address.model';
import { AddressService } from '../../core/services/address/address.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { CartService } from '../../core/services/cart/cart.service';


@Component({
  selector: 'app-navbar',
  imports: [AdminRoutingModule, FormsModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit{
isUserDropdownOpen = false
isLocationDropdownOpen = false
cartCount = 0
searchQuery = ''
userRole: string | null = null
selectedCity = 'Select City'
savedAddresses: SavedAddress[] = []
selectedAddressId: string | null = null
@ViewChild('navbarRef') navbarRef!: ElementRef;

public auth = inject(AuthService);
private readonly destroyRef = inject(DestroyRef);
private readonly addressService = inject(AddressService);
private readonly cartService = inject(CartService);
private readonly cdr = inject(ChangeDetectorRef);
private router = inject(Router);

ngOnInit(): void {
  this.auth.currentUser$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(user => {
    if (user) {
      this.userRole = this.auth.getUserRole();
      if (this.userRole === 'INDIVIDUAL') {
        this.cartService.refreshCart().subscribe();
      }
    } else {
      this.userRole = null;
      this.cartCount = 0;
      this.selectedCity = 'Select City';
    }
    this.cdr.detectChanges();
  });

  this.addressService.addresses$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(addresses => {
      this.savedAddresses = addresses;
      this.updateSelectedCity();
      this.cdr.detectChanges();
    });

  this.addressService.selectedAddressId$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(addressId => {
      this.selectedAddressId = addressId;
      this.updateSelectedCity();
      this.cdr.detectChanges();
    });

  this.cartService.count$
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe((count) => {
      this.cartCount = count;
      this.cdr.detectChanges();
    });
}
toggleUserDropdown(): void {
  this.isUserDropdownOpen = !this.isUserDropdownOpen;
  this.isLocationDropdownOpen = false;
}
toggleLocationDropdown() : void{
  this.isLocationDropdownOpen = !this.isLocationDropdownOpen;
  this.isUserDropdownOpen = false;
}
selectLocationAddress(addressId: string | number): void {
  this.addressService.setSelectedAddress(this.normalizeAddressId(addressId)).subscribe({
    next: () => {
      this.isLocationDropdownOpen = false;
    },
    error: () => {
      this.isLocationDropdownOpen = false;
    },
  });
}

goToAddressManagement(): void {
  this.isLocationDropdownOpen = false;
  if (!this.auth.isLoggedIn()) {
    this.router.navigate(['/auth/login']);
    return;
  }

  this.router.navigate(['/addresses']);
}
onSearch() : void{
  if(this.searchQuery.trim().length === 0)
    return;

  this.router.navigate(['/products'], {
    queryParams: { search: this.searchQuery.trim() }
  });

  this.searchQuery = '';
}

onSearchKeyDown(event: KeyboardEvent) : void{
  if(event.key === 'Enter'){
    this.onSearch();
  }

  if(event.key === 'Escape'){
    this.searchQuery = '';
  }
}
goToCart() : void{
  if(!this.auth.isLoggedIn()){
    this.router.navigate(['/auth/login']);
    return;
  }

  if(this.auth.getUserRole() === 'INDIVIDUAL'){
    this.router.navigate(['/cart']);
    return;
  }

  this.router.navigate(['/products']);
}
logout() : void{
  this.auth.logout();
  this.isUserDropdownOpen = false;
  this.router.navigate(['/']);
}
closeDropdowns() : void{
  this.isUserDropdownOpen = false;
  this.isLocationDropdownOpen = false;
}
@HostListener('document:click', ['$event'])
onDocumentClick(event: Event) : void{
  if(!this.navbarRef.nativeElement.contains(event.target)){
    this.closeDropdowns();
  }
}

private updateSelectedCity(): void {
  const selected = this.savedAddresses.find(address => address.id.toString() === this.selectedAddressId);
  this.selectedCity = selected?.city ?? 'Select City';
}

isDefaultAddress(address: SavedAddress): boolean {
  return this.normalizeAddressId(address.id) === this.selectedAddressId;
}

private normalizeAddressId(addressId: string | number): string {
  return String(addressId);
}
}
