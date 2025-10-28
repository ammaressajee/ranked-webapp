import { Component, computed, inject, signal } from '@angular/core';
import { Firestore, addDoc, collection, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  imports: [FormsModule, CommonModule],
  selector: 'app-record-match',
  templateUrl: './record-match.component.html',
  styleUrls: ['./record-match.component.scss'],
})
export class RecordMatchComponent {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);

  opponentId = signal('');
  games = signal([
    { game: 1, yourScore: 0, opponentScore: 0 },
    { game: 2, yourScore: 0, opponentScore: 0 },
    { game: 3, yourScore: 0, opponentScore: 0 },
  ]);

  async recordMatch() {
    const user = this.auth.currentUser;
    if (!user) {
      alert('Please sign in to record a match.');
      return;
    }

    if (!this.opponentId()) {
      alert('Please enter your opponent ID.');
      return;
    }

    const filledGames = this.games();

    const winsYou = filledGames.filter(g => g.yourScore > g.opponentScore).length;
    const winsOpponent = filledGames.filter(g => g.opponentScore > g.yourScore).length;

    const matchWinnerUid = winsYou > winsOpponent ? user.uid : this.opponentId();

    await addDoc(collection(this.firestore, 'matches'), {
      sport: 'pickleball',
      playerA: user.uid,
      playerB: this.opponentId(),
      games: filledGames,
      matchWinner: matchWinnerUid,
      createdAt: serverTimestamp(),
    });

    alert(`✅ Match recorded. ${winsYou > winsOpponent ? 'You won!' : 'Opponent won!'}`);
    this.router.navigate(['/']);
  }
}