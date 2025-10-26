import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnInit, Output, signal, WritableSignal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NavItem } from '../../models/NavItem';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';


@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit {
  authService = inject(AuthService);
  private router = inject(Router);

  @Input() isSidebarOpen: boolean = false;

  // 💡 OUTPUT: Emit event back to parent to toggle
  @Output() toggleEvent = new EventEmitter<void>();

  // New method to call when button is clicked
  toggleMenu() {
    this.toggleEvent.emit();
  }

  // 💡 All items set to requiresAuth: false to be visible to all users
  navItems: WritableSignal<NavItem[]> = signal([
    { icon: '🏠', label: 'Home', route: '/', requiresAuth: false },
    { icon: '📊', label: 'Dashboard', route: '/dashboard', requiresAuth: false },
    { icon: '📦', label: 'Products', route: '/products', requiresAuth: false },
    { icon: '👥', label: 'Customers', route: '/customers', requiresAuth: false },
  ]);

  bottomNavItems: WritableSignal<NavItem[]> = signal([
    { icon: '⚙️', label: 'Settings', route: '/settings', requiresAuth: false }
  ]);

  ngOnInit() { }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  async logout() {
    await this.authService.logout();
  }
}