import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms'
import { CommonModule, } from '@angular/common';
import { AuthService } from './services/auth.service';
import { SidebarComponent } from './components/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule, RouterLink, SidebarComponent],
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

  isSidebarOpen = signal(false);

  toggleSidebar() {
    this.isSidebarOpen.update(current => !current);
  }

}
