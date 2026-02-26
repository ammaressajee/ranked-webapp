import { Timestamp } from '@angular/fire/firestore';

export interface LeagueRequest {
  id?: string;
  requestedBy: string;
  requestedByName: string;
  leagueName: string;
  location: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  reviewedBy?: string;
  reviewedAt?: any;
}
