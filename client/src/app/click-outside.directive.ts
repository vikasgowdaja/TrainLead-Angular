import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

@Directive({
  selector: '[appClickOutside]',
  standalone: true,
})
export class ClickOutsideDirective {
  readonly appClickOutside = output<void>();
  private readonly element = inject(ElementRef<HTMLElement>);

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && !this.element.nativeElement.contains(target)) {
      this.appClickOutside.emit();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.appClickOutside.emit();
  }
}
