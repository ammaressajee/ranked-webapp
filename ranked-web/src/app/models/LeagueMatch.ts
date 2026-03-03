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

  /** Each player must accept before match becomes "pending". acceptances[uid] === true when that player accepted. */
  acceptances?: {
    [uid: string]: boolean;
  };

  /** When true, playerA has shared their contact with playerB for this match. */
  sharedContactByPlayerA?: boolean;
  /** When true, playerB has shared their contact with playerA for this match. */
  sharedContactByPlayerB?: boolean;

  /** Availability: 10 days × morning/afternoon/evening. Player A's selected slots. */
  availabilityA?: AvailabilitySlot[];
  /** Player B's selected slots. */
  availabilityB?: AvailabilitySlot[];
  /** Agreed day + period (and optional exact time once chosen). */
  agreedSlot?: AgreedSlot;
}

export type PeriodLabel = 'morning' | 'afternoon' | 'evening';

export interface AvailabilitySlot {
  date: string; // YYYY-MM-DD
  period: PeriodLabel;
}

export interface AgreedSlot {
  date: string;
  period: PeriodLabel;
  /** Exact time e.g. "2:00 PM" (once one player picks from dropdown). */
  time?: string;
}
