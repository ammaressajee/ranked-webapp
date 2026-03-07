import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { ChatService } from '../../services/chat.service';
import { LeagueService } from '../../services/league.service';
import { MatchMessage } from '../../models/MatchMessage';
import { LeagueMatch } from '../../models/LeagueMatch';

@Component({
  selector: 'app-message-thread',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './message-thread.component.html',
  styleUrl: './message-thread.component.scss'
})
export class MessageThreadComponent implements OnInit, OnDestroy {
  @ViewChild('messageList') messageList!: ElementRef<HTMLDivElement>;

  private auth = inject(Auth);
  private fs = inject(Firestore);
  private route = inject(ActivatedRoute);
  private chatService = inject(ChatService);
  private leagueService = inject(LeagueService);

  matchId = '';
  match: LeagueMatch | null = null;
  opponentUid = '';
  opponentName = 'Opponent';
  leagueName = '';
  messages$: Observable<MatchMessage[]> = of([]);
  newMessage = '';
  sending = false;
  loading = true;
  sendError = '';
  accepting = false;
  declining = false;
  sentActions = new Set<string>();

  private sub = new Subscription();
  private messageCount = 0;

  get quickActions(): string[] {
    const status = this.match?.status;
    if (status === 'pending_acceptance') {
      return ["I'm ready to play!", "Let's do this!"];
    }
    if (status === 'reported' || status === 'pendingConfirm') {
      return ['I confirmed the score', 'The score looks correct'];
    }
    return [
      'When works for you?',
      'How about tomorrow?',
      'Where should we play?',
      'I reported the score'
    ];
  }

  get uid(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  async ngOnInit() {
    this.matchId = this.route.snapshot.paramMap.get('matchId') || '';
    if (!this.matchId) {
      this.loading = false;
      return;
    }

    this.messages$ = this.chatService.getMessages$(this.matchId);

    try {
      const matchSnap = await getDoc(doc(this.fs, 'leagueMatches', this.matchId));
      if (matchSnap.exists()) {
        this.match = { id: matchSnap.id, ...matchSnap.data() } as LeagueMatch;
        this.opponentUid = this.match.playerA === this.uid ? this.match.playerB : this.match.playerA;
        const opponentUid = this.opponentUid;

        const [userSnap, leagueSnap] = await Promise.all([
          getDoc(doc(this.fs, 'users', opponentUid)),
          getDoc(doc(this.fs, 'leagues', this.match.leagueId))
        ]);
        this.opponentName = userSnap.exists() ? (userSnap.data() as any).displayName || 'Unknown' : 'Unknown';
        this.leagueName = leagueSnap.exists() ? (leagueSnap.data() as any).name || 'League' : 'League';
      }
    } catch (err) {
      console.error('Failed to load match:', err);
    }

    this.loading = false;
    this.chatService.markRead(this.matchId);

    this.sub.add(
      this.messages$.subscribe(msgs => {
        const shouldScroll = msgs.length > this.messageCount;
        this.messageCount = msgs.length;
        if (shouldScroll) {
          setTimeout(() => this.scrollToBottom(), 50);
        }
      })
    );
  }

  async send() {
    if (!this.newMessage.trim() || this.sending) return;
    this.sending = true;
    this.sendError = '';
    const text = this.newMessage;
    try {
      await this.chatService.sendMessage(this.matchId, text);
      this.newMessage = '';
      this.chatService.markRead(this.matchId);
    } catch (err) {
      this.sendError = 'Failed to send. Please try again.';
      console.error('Send failed:', err);
    } finally {
      this.sending = false;
    }
  }

  async sendQuickAction(text: string) {
    if (this.sending || this.sentActions.has(text)) return;
    this.sending = true;
    this.sendError = '';
    try {
      await this.chatService.sendMessage(this.matchId, text);
      this.chatService.markRead(this.matchId);
      this.sentActions.add(text);
      setTimeout(() => this.scrollToBottom(), 50);
    } catch (err) {
      this.sendError = 'Failed to send. Please try again.';
      console.error('Send failed:', err);
    } finally {
      this.sending = false;
    }
  }

  async acceptMatch() {
    if (!this.match?.id || this.accepting) return;
    this.accepting = true;
    this.sendError = '';
    try {
      await this.leagueService.acceptMatch(this.match.id);
      this.match = { ...this.match, status: 'pending' };
    } catch (err) {
      this.sendError = 'Failed to accept match. Please try again.';
      console.error('Accept failed:', err);
    } finally {
      this.accepting = false;
    }
  }

  async declineMatch() {
    if (!this.match?.id || this.declining) return;
    this.declining = true;
    this.sendError = '';
    try {
      await this.leagueService.declineMatch(this.match.id);
      this.match = { ...this.match, status: 'cancelled' };
    } catch (err) {
      this.sendError = 'Failed to decline match. Please try again.';
      console.error('Decline failed:', err);
    } finally {
      this.declining = false;
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  isMe(senderUid: string): boolean {
    return senderUid === this.uid;
  }

  trackByMsg(_: number, msg: MatchMessage) {
    return msg.id;
  }

  formatTime(createdAt: any): string {
    if (!createdAt) return '';
    const ms = typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : 0;
    if (!ms) return '';
    const date = new Date(ms);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  private scrollToBottom() {
    const el = this.messageList?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
