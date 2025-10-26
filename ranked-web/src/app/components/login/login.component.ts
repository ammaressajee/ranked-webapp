import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  // Inject the AuthService
  authService = inject(AuthService);
  router = inject(Router)

  constructor () {
    // // 💡 Auth State Router Guard Logic (Crucial for this structure)
    this.authService.user$.subscribe(user => {
      if (user) {
        // Logged In: Redirect away from /login if necessary
        if (this.router.url === '/login') {
             this.router.navigate(['/']); 
        }
      } else {
        // Logged Out: Redirect to login page
        this.router.navigate(['/login']);
      }
    });
  }

  // Local state for the login/signup form
  email = signal('');
  password = signal('');
  displayName = signal('');
  isSigningUp = signal(false); // Toggle to switch between Login and Sign Up views
  
  // Use the profile signal from the service to control the view
  profile = this.authService.profile;

  // ----------------------------------------------------
  // Form Submission Handler
  // ----------------------------------------------------
  async handleEmailSubmission(event: Event) {
    event.preventDefault(); // Stop the default form submission (page reload)
    
    const emailValue = this.email();
    const passwordValue = this.password();
    const nameValue = this.displayName();

    // Basic form validation
    if (!emailValue || !passwordValue) {
      alert('Please enter both email and password.');
      return;
    }

    try {
      if (this.isSigningUp()) {
        // Sign Up Mode: Check for display name
        if (!nameValue) {
          alert('Please enter a display name to sign up.');
          return;
        }
        await this.authService.signUpWithEmail(emailValue, passwordValue, nameValue);
      } else {
        // Login Mode
        await this.authService.signInWithEmail(emailValue, passwordValue);
      }
      
      // Clear form fields on successful authentication
      this.email.set('');
      this.password.set('');
      this.displayName.set('');
    } catch (error) {
      // 🚨 Handle specific Firebase errors (e.g., auth/wrong-password, auth/email-already-in-use)
      console.error('Authentication Error:', error);
      // Display a user-friendly error message
      alert('Authentication Error: ' + (error as any).message); 
    }
  }

  // Helper to switch modes
  toggleMode() {
    this.isSigningUp.set(!this.isSigningUp());
  }

}
