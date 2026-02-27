import { Component, inject } from '@angular/core';
import { LeagueMatch } from '../../models/LeagueMatch';
import { SharedContactDisplay } from '../../models/UserContactPreferences';
import { collection, collectionData, Firestore, orderBy, query, where } from '@angular/fire/firestore';
import { interval, map, Observable, of, startWith } from 'rxjs';
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

  getOpponentUid(match: LeagueMatch): string | null {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return null;
    return match.playerA === uid ? match.playerB ?? null : match.playerA;
  }

  private opponentContactCache = new Map<string, Observable<SharedContactDisplay | null>>();

  getOpponentContact(match: LeagueMatch): Observable<SharedContactDisplay | null> {
    const id = match.id;
    if (!id) return of(null);
    if (this.opponentContactCache.has(id)) return this.opponentContactCache.get(id)!;
    const uid = this.auth.currentUser?.uid;
    const opp = this.getOpponentUid(match);
    if (!uid || !opp) return of(null);
    const obs = this.ls.getSharedContactForUser(opp, { match, viewerUid: uid });
    this.opponentContactCache.set(id, obs);
    return obs;
  }

  hasSharedMyContact(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return !!((match.playerA === uid && match.sharedContactByPlayerA) || (match.playerB === uid && match.sharedContactByPlayerB));
  }

  sharingContactMatchId: string | null = null;

  async shareMyContactWithOpponent(match: LeagueMatch) {
    if (!match.id) return;
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    this.sharingContactMatchId = match.id;
    try {
      const isPlayerA = match.playerA === uid;
      await this.ls.setMatchSharedContact(match.id, isPlayerA);
    } finally {
      this.sharingContactMatchId = null;
    }
  }
}