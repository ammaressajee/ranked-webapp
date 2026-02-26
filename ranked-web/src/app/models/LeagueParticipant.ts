import { Timestamp } from "@angular/fire/firestore";

export interface LeagueParticipant {
    id: string;
    leagueId: string;
    leagueName?: string;
    userId: string;
    displayName: string;
    photoURL?: string;
    location?: string;
    currentRank: number;
    wins: number;
    losses: number;
    matchesPlayed: number;
    joinedAt?: any;
    provisional?: boolean,        
    recentOpponents?: string[], 
    lastActiveAt?: Timestamp
}
