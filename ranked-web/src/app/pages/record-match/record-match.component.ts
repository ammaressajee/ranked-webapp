import { Component, computed, inject, signal } from '@angular/core';
import { Firestore, addDoc, collection, doc, getDoc, increment, serverTimestamp, updateDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PlayerData } from '../../models/PlayerData';

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
  // Property to hold fetched opponent data for display purposes
  opponentData = signal<PlayerData | null>(null); 

  games = signal([
    { game: 1, yourScore: 0, opponentScore: 0 },
    { game: 2, yourScore: 0, opponentScore: 0 },
    { game: 3, yourScore: 0, opponentScore: 0 },
  ]);

  // ------------------------------------------------------------------
  // ✨ UI/UX ADDITIONS: Avatar Properties and Methods
  // ------------------------------------------------------------------

  /** Generates a fallback RoboHash URL (used if real photoURL isn't available). */
  generateRoboHash(seed: string): string {
    const safeSeed = seed && seed.trim() !== '' ? seed : 'default_fallback';
    // Using set=set4 for a consistent robot style
    return `https://robohash.org/${safeSeed}.png?set=set4`;
  }
  
  // Computed property for the current user's UID (used for their RoboHash fallback)
  currentUserUid = computed(() => this.auth.currentUser?.uid || 'current_user_fallback');
  
  // Computed property for the current user's display name
  currentUserName = computed(() => this.auth.currentUser?.displayName || 'You');
  
  // Computed property for the current user's photo URL (Auth profile or RoboHash fallback)
  currentUserPhotoUrl = computed(() => this.auth.currentUser?.photoURL || this.generateRoboHash(this.currentUserUid()));

  // Computed property for the opponent's photo URL (Firestore data or RoboHash fallback)
  opponentAvatarUrl = computed(() => 
    this.opponentData()?.photoURL || this.generateRoboHash(this.opponentId())
  );
  
  // Computed property for the opponent's display name
  opponentNameDisplay = computed(() => 
    this.opponentData()?.displayName || (this.opponentId() ? 'Loading...' : 'Opponent Name')
  );

  /**
   * Fetches the opponent's profile data whenever the ID input changes.
   */
  async fetchOpponentData(): Promise<void> {
    const id = this.opponentId();
    if (id && id.length > 5) { // Only fetch if ID looks valid
      this.opponentData.set(null); // Clear previous data
      try {
        const docRef = doc(this.firestore, 'users', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          this.opponentData.set(docSnap.data() as PlayerData);
        } else {
          this.opponentData.set(null); // No user found
        }
      } catch (error) {
        console.error("Error fetching opponent data:", error);
        this.opponentData.set(null);
      }
    } else {
      this.opponentData.set(null); // Clear data if input is empty/short
    }
  }

  // ----------------------------------------------------
  // 💾 ORIGINAL recordMatch FUNCTION (Functionality UNCHANGED)
  // ----------------------------------------------------
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

    // Update player stats

    const playerARef = doc(this.firestore, 'users', user.uid);
    const playerBRef = doc(this.firestore, 'users', this.opponentId());

    // Fetch both players’ current stats
    const [playerASnap, playerBSnap] = await Promise.all([
      getDoc(playerARef),
      getDoc(playerBRef)
    ]);

    if (playerASnap.exists() && playerBSnap.exists()) {
      const playerAData = playerASnap.data() as PlayerData;
      const playerBData = playerBSnap.data() as PlayerData;

      const playerAWon = matchWinnerUid === user.uid;

      await Promise.all([
        updateDoc(playerARef, {
          wins: increment(playerAWon ? 1 : 0),
          losses: increment(playerAWon ? 0 : 1),
          matchesCount: increment(1),
          rank: playerAData.rank + (playerAWon ? 10 : -5)
        }),
        updateDoc(playerBRef, {
          wins: increment(playerAWon ? 0 : 1),
          losses: increment(playerAWon ? 1 : 0),
          matchesCount: increment(1),
          rank: playerBData.rank + (playerAWon ? -5 : 10)
        })
      ]);
    }

    alert(`✅ Match recorded. ${winsYou > winsOpponent ? 'You won!' : 'Opponent won!'}`);
    this.router.navigate(['/']);
  }
}