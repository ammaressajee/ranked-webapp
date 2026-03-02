import { Component, Input, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

@Component({
  selector: 'app-ad-slot',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ad-slot.component.html',
  styleUrl: './ad-slot.component.scss'
})
export class AdSlotComponent implements AfterViewInit {
  @Input() adSlotId: string = '';
  @Input() placement: 'footer' | 'card' = 'card';

  get showSlot(): boolean {
    return !!environment.adsEnabled && !!environment.adClient && !!this.adSlotId?.trim();
  }

  get adClient(): string {
    return environment.adClient || '';
  }

  ngAfterViewInit() {
    if (!this.showSlot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense push failed', e);
    }
  }
}
