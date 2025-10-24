import { Component, inject, signal, WritableSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms'
import { CommonModule, } from '@angular/common';
import { addDoc, collection, Firestore } from '@angular/fire/firestore';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  // 1. Inject Firestore DIRECTLY as an injectable field initializer
  private firestore = inject(Firestore);

  email: WritableSignal<string> = signal('');
  success = signal(false);

  async submitEmail(event: Event) {
    event.preventDefault();

    // 4. Firestore is now guaranteed to be available and initialized on the client
    const colRef = collection(this.firestore, 'early_signups');
    await addDoc(colRef, { email: this.email(), createdAt: new Date() });

    this.success.set(true);
    this.email.set('');
  }
}
