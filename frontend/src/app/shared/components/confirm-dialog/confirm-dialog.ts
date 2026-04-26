import { Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  imports: [],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly title = input('Please Confirm');
  readonly message = input('Are you sure you want to continue?');
  readonly confirmText = input('Confirm');
  readonly cancelText = input('Cancel');
  readonly destructive = input(false);
  readonly loading = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  confirm(): void {
    if (this.loading()) {
      return;
    }

    this.confirmed.emit();
  }

  cancel(): void {
    if (this.loading()) {
      return;
    }

    this.cancelled.emit();
  }

  onBackdropClick(): void {
    this.cancel();
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.open()) {
      this.cancel();
    }
  }
}
