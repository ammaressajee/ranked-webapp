import { Component, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest, map, switchMap, startWith, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LeagueService } from '../../services/league.service';
import { ChatService } from '../../services/chat.service';
import { LeagueMatch } from '../../models/LeagueMatch';

export interface ThreadItem {
  match: LeagueMatch;
  opponentName: string;
  opponentUid: string;
  leagueName: string;
  lastMessagePreview: string;
  lastActivityAgo: string;
  unread: boolean;
}

@Component({
  selector: 'app-messages-inbox',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './messages-inbox.component.html',
  styleUrl: './messages-inbox.component.scss'
})
export class MessagesInboxComponent implements OnDestroy {
  private authService = inject(AuthService);
  private leagueService = inject(LeagueService);
  private chatService = inject(ChatService);

  threads: ThreadItem[] = [];
  loading = true;
  private authInitDone = false;
  private threadsSub?: Subscription;

  constructor() {
    effect(() => {
      if (this.authInitDone) return;
      if (!this.authService.isAuthReady()) return;
      this.authInitDone = true;
      const profile = this.authService.profile();
      if (!profile?.uid) {
        this.loading = false;
        return;
      }
      this.initThreads(profile.uid);
    });
  }

  private initThreads(uid: string) {
    const matches$ = this.leagueService.listAllActiveUserMatches(uid);

    this.threadsSub = matches$.pipe(
      switchMap(matches => {
        if (!matches.length) {
          return of([]);
        }

        const opponentUids = [...new Set(matches.map(m => m.playerA === uid ? m.playerB : m.playerA))];
        const leagueIds = [...new Set(matches.map(m => m.leagueId))];

        const names$ = opponentUids.length > 0
          ? combineLatest(opponentUids.map(ouid =>
              this.leagueService.getUserProfile$(ouid).pipe(startWith(null))
            ))
          : of([]);
        const leagues$ = leagueIds.length > 0
          ? combineLatest(leagueIds.map(lid =>
              this.leagueService.getLeague(lid).pipe(startWith(null))
            ))
          : of([]);

        return combineLatest([names$, leagues$]).pipe(
          map(([users, leagues]) => {
            const nameMap: Record<string, string> = {};
            users.forEach((u: any, i: number) => { nameMap[opponentUids[i]] = u?.displayName || 'Unknown'; });
            const leagueMap: Record<string, string> = {};
            leagues.forEach((l: any, i: number) => { leagueMap[leagueIds[i]] = l?.name || 'League'; });

            return matches.map(m => {
              const opponentUid = m.playerA === uid ? m.playerB : m.playerA;
              const lastRead = m.lastReadBy?.[uid];
              const lastReadMs = typeof lastRead?.toMillis === 'function' ? lastRead.toMillis() : 0;
              const lastActivityMs = typeof m.lastActivityAt?.toMillis === 'function' ? m.lastActivityAt.toMillis() : 0;
              const unread = lastActivityMs > lastReadMs && m.lastMessageSenderUid !== uid;

              return {
                match: m,
                opponentName: nameMap[opponentUid] || 'Unknown',
                opponentUid,
                leagueName: leagueMap[m.leagueId] || 'League',
                lastMessagePreview: m.lastMessageText || 'No messages yet',
                lastActivityAgo: this.timeAgo(lastActivityMs || (typeof m.createdAt?.toMillis === 'function' ? m.createdAt.toMillis() : Date.now())),
                unread
              } as ThreadItem;
            });
          })
        );
      })
    ).subscribe({
      next: threads => {
        this.threads = threads;
        this.loading = false;
      },
      error: err => {
        console.error('Failed to load threads:', err);
        this.loading = false;
      }
    });
  }

  timeAgo(ms: number): string {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ms).toLocaleDateString();
  }

  getInitial(name: string): string {
    return (name?.charAt(0) || '?').toUpperCase();
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'pending_acceptance': return 'Awaiting acceptance';
      case 'pending': return 'Active';
      case 'reported':
      case 'pendingConfirm': return 'Awaiting confirmation';
      default: return status;
    }
  }

  ngOnDestroy() {
    this.threadsSub?.unsubscribe();
  }
}
