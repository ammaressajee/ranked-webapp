import { Timestamp } from "@angular/fire/firestore";

export interface MatchMessage {
  id?: string;
  matchId: string;
  senderUid: string;
  text: string;
  createdAt?: any;
  /** 'text' for user messages, 'system' for automated events (match accepted, score reported, etc.) */
  type: 'text' | 'system';
}
