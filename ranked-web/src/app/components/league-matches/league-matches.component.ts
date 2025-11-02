import { Component, inject } from '@angular/core';
import { LeagueMatch } from '../../models/LeagueMatch';
import { collection, collectionData, Firestore, orderBy, query, where } from '@angular/fire/firestore';
import { interval, map, Observable, startWith } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { LeagueService } from '../../services/league.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-league-matches',
  imports: [CommonModule],
  templateUrl: './league-matches.component.html',
  styleUrl: './league-matches.component.scss',
})
export class LeagueMatchesComponent {
  private fs = inject(Firestore);
  private route = inject(ActivatedRoute);
  auth = inject(Auth);
  private ls = inject(LeagueService);

  leagueId = this.route.snapshot.paramMap.get('id')!;

  // This Observable will hold ALL matches for the league initially
  allMatches$!: Observable<LeagueMatch[]>;

  // This Observable will hold only the matches relevant to the current user
  myMatches$!: Observable<LeagueMatch[]>;

  ngOnInit() {
    const q = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', this.leagueId),
      orderBy('createdAt', 'desc')
    );

    // 1. Fetch all matches for the league
    this.allMatches$ = collectionData(q, { idField: 'id' }) as Observable<LeagueMatch[]>;

    // 2. Filter the stream to only include matches where the current user is playerA or playerB
    this.myMatches$ = this.allMatches$.pipe(
      map(matches => {
        const currentUid = this.auth.currentUser?.uid;
        if (!currentUid) {
          // If no user is logged in, show an empty array or all matches, depending on preference.
          // Showing empty array is safer for 'my matches' view.
          return [];
        }

        return matches.filter(match =>
          match.playerA === currentUid || match.playerB === currentUid
        );
      })
    );
  }

  // ... rest of your existing code remains the same ...
  // (reportScore, confirmResult, isUser, timeRemaining methods)

  async reportScore(match: LeagueMatch, winnerUid: string, score: string) {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    await this.ls.reportMatchResult(match.id!, this.leagueId, user.uid, winnerUid, score);
    alert('✅ Score reported! Waiting for confirmation.');

  }

  async confirmResult(match: LeagueMatch) {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    await this.ls.confirmMatchResult(match.id!, user.uid);
    alert('👍 Result confirmed!');

  }

  isUser(uid: string | null) {
    return this.auth.currentUser?.uid === uid;
  }

  AUTO_FINALIZE_MINUTES = 3;

  timeRemaining(reportedAt: any) {
    if (!reportedAt) return null;

    const reportedDate =
      reportedAt.toDate ? reportedAt.toDate() : new Date(reportedAt);

    return interval(1000).pipe(
      startWith(0),
      map(() => {
        const now = new Date().getTime();
        const target = reportedDate.getTime() + this.AUTO_FINALIZE_MINUTES * 60 * 1000;
        const diff = Math.max(0, target - now);
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        return diff > 0 ? `${minutes}m ${seconds}s` : 'finalizing...';
      })
    );
  }
}