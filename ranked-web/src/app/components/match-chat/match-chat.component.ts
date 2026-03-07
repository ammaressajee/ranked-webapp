import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Observable, Subscription, of } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { MatchMessage } from '../../models/MatchMessage';

@Component({
  selector: 'app-match-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './match-chat.component.html',
  styleUrl: './match-chat.component.scss'
})
export class MatchChatComponent implements OnChanges, OnDestroy {
  @Input() matchId!: string;
  @Input() lastReadBy: any;
  @Input() opponentName = 'Opponent';
  @ViewChild('messageList') messageList!: ElementRef<HTMLDivElement>;

  private auth = inject(Auth);
  private chatService = inject(ChatService);

  messages$: Observable<MatchMessage[]> = of([]);
  unreadCount$: Observable<number> = of(0);
  expanded = false;
  newMessage = '';
  sending = false;
  sendError = '';
  sentConfirmation = '';
  private sub = new Subscription();
  private messageCount = 0;
  private sentTimer: any;

  readonly quickActions = [
    'When works for you?',
    'How about tomorrow?',
    'Where should we play?'
  ];

  get uid(): string | undefined {
    return this.auth.currentUser?.uid;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchId'] && this.matchId) {
      this.messages$ = this.chatService.getMessages$(this.matchId);
      this.unreadCount$ = this.chatService.getUnreadCount$(this.matchId, this.messages$, this.lastReadBy);
      this.sub.unsubscribe();
      this.sub = this.messages$.subscribe(msgs => {
        const shouldScroll = msgs.length > this.messageCount;
        this.messageCount = msgs.length;
        if (shouldScroll && this.expanded) {
          setTimeout(() => this.scrollToBottom(), 50);
        }
      });
    }
  }

  toggleChat() {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.chatService.markRead(this.matchId);
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  private showSentConfirmation() {
    this.sentConfirmation = 'Sent!';
    clearTimeout(this.sentTimer);
    this.sentTimer = setTimeout(() => { this.sentConfirmation = ''; }, 2000);
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
      this.showSentConfirmation();
      if (!this.expanded) this.expanded = true;
      setTimeout(() => this.scrollToBottom(), 50);
    } catch (err) {
      this.sendError = 'Failed to send. Try again.';
      console.error('Chat send failed:', err);
    } finally {
      this.sending = false;
    }
  }

  async sendQuickAction(text: string) {
    if (this.sending) return;
    this.sending = true;
    this.sendError = '';
    try {
      await this.chatService.sendMessage(this.matchId, text);
      this.chatService.markRead(this.matchId);
      this.showSentConfirmation();
      if (!this.expanded) this.expanded = true;
      setTimeout(() => this.scrollToBottom(), 50);
    } catch (err) {
      this.sendError = 'Failed to send. Try again.';
      console.error('Chat send failed:', err);
    } finally {
      this.sending = false;
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

  private scrollToBottom() {
    const el = this.messageList?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    clearTimeout(this.sentTimer);
  }
}
