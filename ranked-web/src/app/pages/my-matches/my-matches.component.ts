import { Component, inject } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import { Auth } from '@angular/fire/auth';
import { LeagueMatch } from '../../models/LeagueMatch';
import { NgIf, NgFor, NgClass, NgStyle, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-my-matches',
  imports: [CommonModule, FormsModule],
  templateUrl: './my-matches.component.html',
  styleUrl: './my-matches.component.scss',
})
export class MyMatchesComponent {
  auth = inject(Auth);
  private ls = inject(LeagueService);

  userLeagues$!: Observable<any[]>;
  matches$!: Observable<LeagueMatch[]>;

  loading = true;
  error: string | null = null;

  selectedLeagueId: string | null = null;
  private sub = new Subscription();

  // Report dialog state
  reportDialogOpen = false;
  dialogMatch: LeagueMatch | null = null;
  dialogWinnerUid: string | null = null;
  dialogScore = '';

  // -------------------------------------
  //                INIT
  // -------------------------------------
  ngOnInit() {
    const user = this.auth.currentUser;
    if (!user) {
      this.error = 'You must be signed in.';
      this.loading = false;
      return;
    }

    // Step 1 — list leagues
    this.userLeagues$ = this.ls.listUserLeagues(user.uid);

    // Step 2 — subscribe to leagues
    this.sub.add(
      this.userLeagues$.subscribe({
        next: (leagues) => {
          if (!leagues || leagues.length === 0) {
            this.error = 'You are not in any active leagues yet.';
            this.loading = false;
            return;
          }

          // Auto-select first league
          this.selectedLeagueId = leagues[0].leagueId;

          // Step 3 — load matches
          this.loadMatches(this.selectedLeagueId!);

          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.error = 'Failed to load leagues.';
          this.loading = false;
        },
      })
    );
  }

  // -------------------------------------
  //         LOAD MATCHES FOR LEAGUE
  // -------------------------------------
  loadMatches(leagueId: string) {
    const user = this.auth.currentUser;
    if (!user) return;

    this.matches$ = this.ls.listUserMatches(leagueId, user.uid);
  }

  // -------------------------------------
  //          LEAGUE CHANGE EVENT
  // -------------------------------------
  onLeagueChange() {
    if (!this.selectedLeagueId) return;
    this.loadMatches(this.selectedLeagueId);
  }

  // -------------------------------------
  //               REPORTING
  // -------------------------------------
  openReportDialog(match: LeagueMatch) {
    this.dialogMatch = match;
    this.dialogWinnerUid = null;
    this.dialogScore = '';
    this.reportDialogOpen = true;
  }

  closeReportDialog() {
    this.reportDialogOpen = false;
  }

  async submitReport() {
    if (!this.dialogMatch || !this.dialogWinnerUid || !this.dialogScore) {
      alert('Please fill out all fields.');
      return;
    }

    await this.reportScore(this.dialogMatch, this.dialogWinnerUid, this.dialogScore);
    this.closeReportDialog();
  }

  isUser(uid: string | null | undefined): boolean {
    const user = this.auth.currentUser;
    if (!user || !uid) return false;
    return user.uid === uid;
  }


  // -------------------------------------
  //            ACTION HANDLERS
  // -------------------------------------
  async reportScore(match: LeagueMatch, winnerUid: string, score: string) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');

    try {
      await this.ls.reportMatchResult(match.id!, match.leagueId!, user.uid, winnerUid, score);
      alert('Score reported! Waiting for opponent to confirm.');
    } catch (err) {
      console.error(err);
      alert('Failed to report score.');
    }
  }

  async confirmResult(match: LeagueMatch) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');

    try {
      await this.ls.confirmMatchResult(match.id!, user.uid);
      alert('Result confirmed!');
    } catch (err) {
      console.error(err);
      alert('Failed to confirm result.');
    }
  }

  // -------------------------------------
  //        TEMPLATE HELPERS
  // -------------------------------------
  getStatusClass(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending':
        return 'status-waiting';
      case 'reported':
      case 'pendingConfirm':
        return 'status-report';
      case 'completed':
        return 'status-final';
      default:
        return 'status-waiting';
    }
  }

  getMatchStatus(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending':
        return 'Waiting to start';
      case 'reported':
      case 'pendingConfirm':
        return 'Awaiting confirmation';
      case 'completed':
        return 'Final';
      default:
        return match.status || 'Unknown';
    }
  }

  shouldShowReport(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return match.status === 'pending' && (match.playerA === uid || match.playerB === uid);
  }

  shouldShowConfirm(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;

    if (match.status !== 'pendingConfirm') return false;
    if (!match.confirmations) return true;

    return match.confirmations[uid] !== true;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}