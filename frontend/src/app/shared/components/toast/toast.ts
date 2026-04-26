import { Component, computed, effect, input, output } from '@angular/core';

@Component({
  selector: 'app-toast',
  imports: [],
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class Toast {
  readonly open = input(false);
  readonly title = input('');
  readonly message = input('Action completed successfully.');
  readonly type = input<'success' | 'info' | 'warning' | 'error'>('info');
  readonly dismissible = input(true);
  readonly autoClose = input(true);
  readonly durationMs = input(3000);

  readonly closed = output<void>();

  readonly toastClass = computed(() => `toast toast--${this.type()}`);

  constructor() {
    effect((onCleanup) => {
      if (!this.open() || !this.autoClose()) {
        return;
      }

      const timeoutId = setTimeout(() => {
        this.dismiss();
      }, this.durationMs());

      onCleanup(() => clearTimeout(timeoutId));
    });
  }

  dismiss(): void {
    this.closed.emit();
  }
}
