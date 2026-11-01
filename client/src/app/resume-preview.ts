import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

function isCloudinaryPdf(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.endsWith('.pdf');
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-resume-preview',
  templateUrl: './resume-preview.html',
})
export class ResumePreview {
  readonly url = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('previewDialog');
  protected readonly canPreview = computed(() => isCloudinaryPdf(this.url()));
  protected readonly safePreviewUrl = computed(() => this.canPreview()
    ? this.sanitizer.bypassSecurityTrustResourceUrl(this.url())
    : null);

  protected open(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}