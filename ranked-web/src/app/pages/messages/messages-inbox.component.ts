import { Component, effect, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, combineLatest, map, switchMap, from, of } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
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
  private currentUid = '';

  showInactiveChats = false;
  inactiveThreads: ThreadItem[] = [];
  inactiveLoading = false;
  inactiveHasMore = true;
  inactiveCursor: Timestamp | null = null;
  private inactiveLoaded = false;

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
      this.currentUid = profile.uid;
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
        const opponentToLeague: Record<string, string> = {};
        for (const m of matches) {
          const ouid = m.playerA === uid ? m.playerB : m.playerA;
          if (!opponentToLeague[ouid]) opponentToLeague[ouid] = m.leagueId;
        }

        const names$ = opponentUids.length > 0
          ? combineLatest(opponentUids.map(ouid =>
              from(this.leagueService.getDisplayName(ouid, opponentToLeague[ouid]))
            ))
          : of([]);
        const leagues$ = leagueIds.length > 0
          ? combineLatest(leagueIds.map(lid => this.leagueService.getLeague(lid)))
          : of([]);

        return combineLatest([names$, leagues$]).pipe(
          map(([names, leagues]) => {
            const nameMap: Record<string, string> = {};
            (names as string[]).forEach((name: string, i: number) => { nameMap[opponentUids[i]] = name || 'Unknown'; });
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

  toggleInactiveChats() {
    this.showInactiveChats = !this.showInactiveChats;
    if (this.showInactiveChats && !this.inactiveLoaded) {
      this.loadInactivePage();
    }
  }

  async loadInactivePage() {
    if (!this.currentUid || this.inactiveLoading) return;
    this.inactiveLoading = true;
    try {
      const { matches, hasMore } = await this.leagueService.listInactiveUserMatches(
        this.currentUid,
        15,
        this.inactiveCursor ?? undefined
      );
      this.inactiveHasMore = hasMore;
      this.inactiveLoaded = true;

      if (matches.length > 0) {
        const last = matches[matches.length - 1];
        this.inactiveCursor = (last as any).completedAt ?? null;
      }

      const matchesWithMessages = matches.filter(m => m.lastMessageText);
      const newThreads = await Promise.all(
        matchesWithMessages.map(async m => {
          const opponentUid = m.playerA === this.currentUid ? m.playerB : m.playerA;
          const [opponentName, league] = await Promise.all([
            this.leagueService.getDisplayName(opponentUid, m.leagueId),
            new Promise<any>(resolve => this.leagueService.getLeague(m.leagueId).subscribe(l => resolve(l)))
          ]);
          const lastActivityMs = typeof m.lastActivityAt?.toMillis === 'function' ? m.lastActivityAt.toMillis()
            : typeof m.completedAt?.toMillis === 'function' ? m.completedAt.toMillis()
            : typeof m.createdAt?.toMillis === 'function' ? m.createdAt.toMillis()
            : Date.now();
          return {
            match: m,
            opponentName: opponentName || 'Unknown',
            opponentUid,
            leagueName: league?.name || 'League',
            lastMessagePreview: m.lastMessageText || 'No messages',
            lastActivityAgo: this.timeAgo(lastActivityMs),
            unread: false
          } as ThreadItem;
        })
      );
      this.inactiveThreads = [...this.inactiveThreads, ...newThreads];
    } catch (err) {
      console.error('Failed to load inactive chats:', err);
    } finally {
      this.inactiveLoading = false;
    }
  }

  loadMoreInactive() {
    this.loadInactivePage();
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
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  getActionHint(thread: ThreadItem): string {
    const status = thread.match.status;
    if (status === 'pending_acceptance') return 'Action needed: Accept this match';
    if (status === 'pending') return 'Coordinate a time to play';
    if (status === 'reported' || status === 'pendingConfirm') return 'Action needed: Confirm the score';
    return '';
  }

  ngOnDestroy() {
    this.threadsSub?.unsubscribe();
  }
}
