import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, inject, Input, OnInit, Output, Signal, signal, WritableSignal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { NavItem } from '../../models/NavItem';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit {
  authService = inject(AuthService);
  adminService = inject(AdminService);
  private router = inject(Router);

  isAdmin$ = this.adminService.isAdmin$;

  @Input() isSidebarOpen: boolean = true;
  @Output() toggleEvent = new EventEmitter<void>();


  // --- TOP NAVIGATION ITEMS ---

  navItems: Signal<NavItem[]> = computed(() => {
    const user = this.authService.profile();
    const uid = user?.uid || '';

    return [
      {
        icon: 'home',
        label: 'Home',
        route: '/',
        requiresAuth: false
      },
      {
        icon: 'sports_soccer',
        label: 'League',
        route: '/league',
        requiresAuth: false
      },
      {
        icon: 'account_circle',
        label: 'Profile',
        route: uid ? `/profile/${uid}` : '/login',
        requiresAuth: false
      }
    ];
  });


  bottomNavItems: Signal<NavItem[]> = computed(() => []);

  ngOnInit() { }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  async logout() {
    await this.authService.logout();
  }

  handleNavClick() {
    this.toggleEvent.emit(); // tells the parent to toggle sidebar
  }

}