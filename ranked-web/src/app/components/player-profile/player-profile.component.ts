import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { collection, collectionData, doc, Firestore, getDoc, limit, orderBy, query, where } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-player-profile',
  imports: [CommonModule],
  templateUrl: './player-profile.component.html',
  styleUrl: './player-profile.component.scss',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  player = signal<any>(null);
  recentMatches = signal<any[]>([]);

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid') || this.auth.currentUser?.uid;
    if (!uid) return;

    const userRef = doc(this.firestore, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      this.player.set(userSnap.data());
    }

    // Load recent matches (either as playerA or playerB)
    const matchesQuery = query(
      collection(this.firestore, 'matches'),
      where('sport', '==', 'pickleball'),
      where('playerA', 'in', [uid]),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    collectionData(matchesQuery, { idField: 'id' })
      .subscribe(data => this.recentMatches.set(data));
  }

  getTier(rank: number): string {
    if (rank >= 2200) return 'Champion 👑';
    if (rank >= 1900) return 'Diamond 🔷';
    if (rank >= 1600) return 'Platinum 💎';
    if (rank >= 1300) return 'Gold 🥇';
    if (rank >= 1000) return 'Silver 🥈';
    return 'Bronze 🥉';
  }

}
