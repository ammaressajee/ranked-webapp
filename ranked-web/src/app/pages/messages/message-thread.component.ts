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
  newMessage = '';
  sending = false;
  loading = true;
  sendError = '';
  accepting = false;
  declining = false;
  sentActions = new Set<string>();

  reportDialogOpen = false;
  dialogWinnerUid: string | null = null;
  dialogScore = '';
  submittingReport = false;
  confirming = false;

  allMessages: MatchMessage[] = [];
  olderMessages: MatchMessage[] = [];
  hasOlderMessages = true;
  loadingOlder = false;

  private recentMessages: MatchMessage[] = [];
  private messages$: Observable<MatchMessage[]> = of([]);
  private sub = new Subscription();
  private messageCount = 0;

  get quickActions(): string[] {
    const status = this.match?.status;
    if (status === 'pending_acceptance' && this.shouldShowAccept()) {
      return ["I'm ready to play!", "Let's do this!"];
    }
    if ((status === 'reported' || status === 'pendingConfirm') && this.shouldShowConfirm()) {
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

  hasAccepted(match: LeagueMatch, uid?: string): boolean {
    const id = uid ?? this.uid;
    if (!id || !match.acceptances) return false;
    return match.acceptances[id] === true;
  }

  opponentHasAccepted(match: LeagueMatch): boolean {
    return this.opponentUid ? this.hasAccepted(match, this.opponentUid) : false;
  }

  shouldShowAccept(): boolean {
    if (!this.uid || !this.match) return false;
    if (this.match.status !== 'pending_acceptance') return false;
    if (this.match.playerA !== this.uid && this.match.playerB !== this.uid) return false;
    return !this.hasAccepted(this.match);
  }

  waitingForOpponentToAccept(): boolean {
    return !!this.match && this.match.status === 'pending_acceptance' &&
      this.hasAccepted(this.match) && !this.opponentHasAccepted(this.match);
  }

  shouldShowConfirm(): boolean {
    if (!this.uid || !this.match) return false;
    if (this.match.status !== 'reported' && this.match.status !== 'pendingConfirm') return false;
    return this.match.confirmations?.[this.uid] !== true;
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

        const [opponentName, leagueSnap] = await Promise.all([
          this.leagueService.getDisplayName(opponentUid, this.match.leagueId),
          getDoc(doc(this.fs, 'leagues', this.match.leagueId))
        ]);
        this.opponentName = opponentName;
        this.leagueName = leagueSnap.exists() ? (leagueSnap.data() as any).name || 'League' : 'League';
      }
    } catch (err) {
      console.error('Failed to load match:', err);
    }

    this.loading = false;
    this.chatService.markRead(this.matchId);

    this.sub.add(
      this.messages$.subscribe(msgs => {
        this.recentMessages = msgs;
        this.mergeMessages();
        const shouldScroll = this.allMessages.length > this.messageCount;
        this.messageCount = this.allMessages.length;
        if (shouldScroll) {
          setTimeout(() => this.scrollToBottom(), 50);
        }
        if (msgs.length < 50) {
          this.hasOlderMessages = false;
        }
      })
    );
  }

  private mergeMessages() {
    const olderIds = new Set(this.olderMessages.map(m => m.id));
    const dedupedRecent = this.recentMessages.filter(m => !olderIds.has(m.id));
    this.allMessages = [...this.olderMessages, ...dedupedRecent];
  }

  async loadOlderMessages() {
    if (this.loadingOlder || !this.hasOlderMessages || !this.matchId) return;
    const oldest = this.allMessages[0];
    if (!oldest?.createdAt) {
      this.hasOlderMessages = false;
      return;
    }
    this.loadingOlder = true;
    const el = this.messageList?.nativeElement;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    try {
      const older = await this.chatService.loadOlderMessages(this.matchId, oldest.createdAt);
      if (older.length < 50) {
        this.hasOlderMessages = false;
      }
      this.olderMessages = [...older, ...this.olderMessages];
      this.mergeMessages();
      if (el) {
        setTimeout(() => {
          el.scrollTop = el.scrollHeight - prevScrollHeight;
        }, 30);
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      this.loadingOlder = false;
    }
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

  openReportDialog() {
    this.dialogWinnerUid = null;
    this.dialogScore = '';
    this.reportDialogOpen = true;
  }

  closeReportDialog() {
    this.reportDialogOpen = false;
  }

  async confirmResult() {
    const user = this.auth.currentUser;
    if (!user || !this.match?.id || this.confirming) return;
    this.confirming = true;
    this.sendError = '';
    try {
      await this.leagueService.confirmMatchResult(this.match.id, user.uid);
      this.match = { ...this.match, status: 'completed', confirmations: { ...this.match.confirmations, [user.uid]: true } };
    } catch (err) {
      this.sendError = 'Failed to confirm result. Please try again.';
      console.error('Confirm failed:', err);
    } finally {
      this.confirming = false;
    }
  }

  async submitReport() {
    if (!this.match?.id || !this.match?.leagueId || !this.dialogWinnerUid || !this.dialogScore.trim()) {
      alert('Please fill out all fields.');
      return;
    }
    const user = this.auth.currentUser;
    if (!user) {
      alert('Please sign in first.');
      return;
    }
    this.submittingReport = true;
    try {
      await this.leagueService.reportMatchResult(
        this.match.id,
        this.match.leagueId,
        user.uid,
        this.dialogWinnerUid,
        this.dialogScore.trim()
      );
      await this.chatService.sendSystemMessage(this.match.id, `Score reported: ${this.dialogScore.trim()}`);
      this.closeReportDialog();
      this.match = { ...this.match, status: 'reported' };
      alert('Score reported! Your opponent has 48 hours to confirm. If they don\'t respond, the score will be accepted automatically.');
    } catch (err) {
      console.error(err);
      alert('Failed to report score.');
    } finally {
      this.submittingReport = false;
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  isMe(senderUid: string | undefined): boolean {
    return !!senderUid && senderUid === this.uid;
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
