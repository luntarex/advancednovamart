import { Component, HostListener, Input, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface DropdownOption {
  label: string;
  value: any;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DropdownComponent),
      multi: true,
    },
  ],
})
export class DropdownComponent implements ControlValueAccessor {
  @Input() options: DropdownOption[] = [];
  @Input() placeholder: string = 'Select an option';
  @Input() label: string = '';

  isOpen = signal(false);
  selectedValue = signal<any>(null);
  selectedLabel = signal<string | null>(null);

  // ControlValueAccessor methods
  onChange: any = () => {};
  onTouched: any = () => {};

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  select(option: DropdownOption): void {
    this.selectedValue.set(option.value);
    this.selectedLabel.set(option.label);
    this.onChange(option.value);
    this.onTouched();
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Basic click-outside logic
    const path = event.composedPath();
    const isInside = path.some((el: any) => el.tagName === 'APP-DROPDOWN');
    if (!isInside) {
      this.isOpen.set(false);
    }
  }

  // CVA overrides
  writeValue(value: any): void {
    const found = this.options.find((o) => o.value === value);
    if (found) {
      this.selectedValue.set(found.value);
      this.selectedLabel.set(found.label);
    } else {
      this.selectedValue.set(null);
      this.selectedLabel.set(null);
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    // Handle disabled state if needed
  }
}
