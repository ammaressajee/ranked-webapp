import { Timestamp } from "@angular/fire/firestore";

export interface LeagueMatch {
  id?: string;
  leagueId: string;
  round?: number;
  playerA: string | null;   // userId or null for bye
  playerB: string | null;   // userId or null for bye
  status: 'pending' | 'reported' | 'disputed' | 'completed' | 'cancelled';
  type?: 'standard' | 'bye';
  createdAt?: any;
  scheduledAt?: Timestamp | null;
  result?: {
    winner?: string | null;      // userId
    score?: string | null;
    reportedBy?: string | null;  // userId of who reported
    reportedAt?: any | null;
  };
  confirmations?: { [uid: string]: boolean }; // who has confirmed the reported result
  completedAt?: any | null;
}
