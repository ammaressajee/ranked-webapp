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

  result?: {
    winner?: string;
    score?: string;
    reportedAt?: any;
  };

  confirmations?: {
    [uid: string]: boolean;
  };
}
