import { Component, inject, PLATFORM_ID, signal, WritableSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc } from 'firebase/firestore';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
 // Inject platform info
  private platformId = inject(PLATFORM_ID);
  
  // Conditionally inject Firestore
  private firestore: Firestore | null = null;
  
  email: WritableSignal<string> = signal('');
  success = signal(false);

  constructor() {
    // 💡 FIX: Only inject Firestore if we are running in the browser.
    if (isPlatformBrowser(this.platformId)) {
      this.firestore = inject(Firestore);
    }
  }

  async submitEmail(event: Event) {
    event.preventDefault();

    // 💡 FIX: Check if Firestore is available before using it
    if (!this.firestore) {
      console.error('Firestore is not available on the server during prerender.');
      return;
    }
    
    const colRef = collection(this.firestore, 'early_signups');
    await addDoc(colRef, { email: this.email(), createdAt: new Date() });
    this.success.set(true);
    this.email.set('');
  }
}
