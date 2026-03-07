import { Timestamp } from "@angular/fire/firestore";

export interface LeagueMatch {
  id?: string;
  leagueId: string;
  playerA: string;
  playerB: string;

  status: 
    | "pending_acceptance"
    | "pending"
    | "reported"
    | "pendingConfirm"
    | "disputed"
    | "completed"
    | "cancelled";

  createdAt?: any;
  scheduledAt?: any;
  completedAt?: any;
  acceptedAt?: any;

  result?: {
    winner?: string;
    score?: string;
    reportedBy?: string;
    reportedAt?: any;
  };

  confirmations?: {
    [uid: string]: boolean;
  };

  acceptances?: {
    [uid: string]: boolean;
  };

  /** Tracks when each player last read the match chat. Used for unread badge. */
  lastReadBy?: { [uid: string]: any };
  /** Updated on every chat message or state change; used for inactivity nudges. */
  lastActivityAt?: any;
  /** 7 days after both accept; match auto-cancels if no score reported by this time. */
  matchDeadline?: any;

  /** Denormalized from the latest chat message for inbox preview. */
  lastMessageText?: string;
  lastMessageSenderUid?: string;
}
