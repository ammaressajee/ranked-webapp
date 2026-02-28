import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';

const MOBILE_BREAKPOINT = 768;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, RouterLink, SidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  authService = inject(AuthService);

  isSidebarOpen = true;

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
