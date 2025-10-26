import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms'
import { CommonModule, } from '@angular/common';
import { AuthService } from './services/auth.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { TopbarComponent } from './components/topbar/topbar.component';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule, RouterLink, SidebarComponent, TopbarComponent, MatIconModule, MatToolbarModule, MatButtonModule, MatMenuModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  authService = inject(AuthService);
  private router = inject(Router);

  constructor() {

    // // 💡 Auth State Router Guard Logic (Crucial for this structure)
    // this.authService.user$.subscribe(user => {
    //   if (user) {
    //     // Logged In: Redirect away from /login if necessary
    //     if (this.router.url === '/login') {
    //          this.router.navigate(['/']); 
    //     }
    //   } else {
    //     // Logged Out: Redirect to login page
    //     this.router.navigate(['/login']);
    //   }
    // });
  }


  isSidebarOpen = true;
  isMobile = false;

  ngOnInit() {
    this.checkScreenSize();
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar() {
    if (this.isMobile) this.isSidebarOpen = false;
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    this.isMobile = window.innerWidth <= 768;
    if (this.isMobile) {
      this.isSidebarOpen = false; // start closed on mobile
    }
  }
}
