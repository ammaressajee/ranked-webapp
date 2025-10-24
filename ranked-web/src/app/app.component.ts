import { Component, inject, signal, WritableSignal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms'
import { CommonModule, } from '@angular/common';
import { arrayUnion, collection, doc, Firestore, getDocs, limit, orderBy, query, setDoc, updateDoc } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  authService = inject(AuthService);
  private firestore = inject(Firestore); 
  
  // Cleaned up signals (only app state remains)
  leaderboard = signal<any[]>([]);

  constructor() {
    this.loadLeaderboard();
  }

  // The logic for joining the ladder remains here as it's application feature logic
  async joinLadder() {
    const user = this.authService.auth.currentUser; // Access Auth through the service
    if (!user) return;
    const ladderRef = doc(this.firestore, 'ladders', 'default');
    await updateDoc(ladderRef, { members: arrayUnion(user.uid) });
    this.authService.joined.set(true); // Update state via service
    this.loadLeaderboard();
  }

  async loadLeaderboard() {
    const q = query(collection(this.firestore, 'users'), orderBy('rank', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    this.leaderboard.set(snapshot.docs.map(d => d.data()));
  }
}
