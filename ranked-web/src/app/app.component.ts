import { Component, HostListener, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { AdSlotComponent } from './components/ad-slot/ad-slot.component';
import { environment } from '../environments/environment';

const MOBILE_BREAKPOINT = 768;

/** Routes where we do not show ads (login, league join, etc.) */
function shouldShowFooterAd(url: string): boolean {
  if (!environment.adsEnabled || !environment.adSlotFooter) return false;
  if (url.includes('/login')) return false;
  if (url.includes('/join')) return false; // league join
  return true;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, RouterLink, SidebarComponent, AdSlotComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  authService = inject(AuthService);
  router = inject(Router);

  isSidebarOpen = false;

  /** Show footer ad only when ads enabled and not on excluded routes */
  get showFooterAd(): boolean {
    return shouldShowFooterAd(this.router.url);
  }
  adSlotFooter = environment.adSlotFooter;

  ngOnInit() {
    this.updateBodyScrollLock();
  }

  @HostListener('window:resize')
  onResize() {
    this.updateBodyScrollLock();
  }

  /** On mobile, lock body scroll when sidebar is open so the background doesn’t move. */
  private updateBodyScrollLock() {
    if (typeof document === 'undefined') return;
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const shouldLock = isMobile && this.isSidebarOpen;
    document.body.classList.toggle('sidebar-open-mobile', shouldLock);
  }

  closeSidebar() {
    this.isSidebarOpen = false;
    this.updateBodyScrollLock();
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.updateBodyScrollLock();
  }

  async handleLogout() {
    this.isSidebarOpen = false;
    this.updateBodyScrollLock();
    await this.authService.logout();
  }
}
