import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  imports: [],
  templateUrl: './spinner.html',
  styleUrl: './spinner.css',
})
export class Spinner {
  readonly label = input('Loading...');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly visible = input(true);
  readonly fullScreen = input(false);

  readonly sizeClass = computed(() => `spinner--${this.size()}`);
}
