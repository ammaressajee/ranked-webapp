import { inject, Injectable } from '@angular/core';
import { addDoc, collection, collectionData, doc, Firestore, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { firstValueFrom, Observable } from 'rxjs';
import { League } from '../models/League';
import { LeagueParticipant } from '../models/LeagueParticipant';
import { getAuth } from '@angular/fire/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class LeagueService {

  private fs = inject(Firestore);
  http = inject(HttpClient);

  private leaguesColl() { return collection(this.fs, 'leagues'); }
  private participantsColl() { return collection(this.fs, 'leagueParticipants'); }
  private matchesColl() { return collection(this.fs, 'leagueMatches'); }

  // --------------------------
  // League CRUD
  // --------------------------
  async createLeague(payload: { name: string; location: string; startAt?: any; endAt?: any; season?: number; maxPlayers?: number }) {
    const docRef = await addDoc(this.leaguesColl(), {
      ...payload,
      isActive: true,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  listActiveLeagues(): Observable<League[]> {
    const q = query(this.leaguesColl(), where('isActive', '==', true), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<League[]>;
  }

  listUserLeagues(uid: string) {
    return collectionData(
      query(
        collection(this.fs, 'leagueParticipants'),
        where('userId', '==', uid)
      ),
      { idField: 'id' }
    );
  }

  async joinLeague(leagueId: string, user: { uid: string; displayName: string; photoURL?: string; location?: string; rank?: number }) {
    const participantId = `${leagueId}_${user.uid}`;
    const ref = doc(this.fs, 'leagueParticipants', participantId);
    await setDoc(ref, {
      leagueId,
      userId: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL || '',
      location: user.location || '',
      currentRank: user.rank ?? 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      joinedAt: serverTimestamp(),
      provisional: true,           // ensure Cloud Function picks up provisional
      recentOpponents: []          // initialize empty array
    }, { merge: true });
    return participantId;
  }

  listParticipants(leagueId: string): Observable<LeagueParticipant[]> {
    const q = query(this.participantsColl(), where('leagueId', '==', leagueId), orderBy('currentRank', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<LeagueParticipant[]>;
  }

  // --------------------------
  // Find Match (On-demand)
  // --------------------------
  private readonly FIND_MATCH_URL = 'https://us-central1-ranked-app-9f746.cloudfunctions.net/find_match';
  private readonly SWEEP_MATCH_URL = 'https://us-central1-ranked-app-9f746.cloudfunctions.net/sweep_pending_matches';

  // Call find_match
  async findMatchOnDemand(leagueId: string, userId: string, rank = 1000, location = '') {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error('Not authenticated');

    const headers = { Authorization: `Bearer ${token}` };
    const body = { leagueId, userId, rank, location };

    return firstValueFrom(this.http.post(this.FIND_MATCH_URL, body, { headers })) as Promise<any>;
  }

  // Call sweep_pending_matches
  async sweepPendingMatches() {
    const headers = { 'Content-Type': 'application/json' };
    return firstValueFrom(this.http.post(this.SWEEP_MATCH_URL, {}, { headers })) as Promise<any>;
  }

  // --------------------------
  // Reporting & Confirming
  // --------------------------
  async reportMatchResult(matchId: string, leagueId: string, reporterUid: string, winnerUid: string, score?: string) {
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, {
      status: 'reported',
      result: { winner: winnerUid, score: score ?? null, reportedBy: reporterUid, reportedAt: serverTimestamp() },
      [`confirmations.${reporterUid}`]: true
    });
  }

  async confirmMatchResult(matchId: string, confirmerUid: string) {
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, { [`confirmations.${confirmerUid}`]: true });
  }

  listUserMatches(leagueId: string, userId: string): Observable<any[]> {
    const q = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', leagueId),
      where('playerA', '==', userId) // will also check playerB in a second query if needed
    );

    // Optional: fetch playerB matches separately or use Firestore OR workaround
    const q2 = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', leagueId),
      where('playerB', '==', userId)
    );

    // Combine both queries (for simplicity, just return collectionData for q, you can merge in component)
    return collectionData(q, { idField: 'id' }) as Observable<any[]>;
  }

  // Optional helper: report & confirm in one click
  async reportAndConfirm(matchId: string, leagueId: string, winnerUid: string, userId: string) {
    await this.reportMatchResult(matchId, leagueId, userId, winnerUid);
    await this.confirmMatchResult(matchId, userId);
  }

  collectionDataWithId<T>(collectionName: string, field: string, value: any, orderField?: string): Observable<T[]> {
    let q = query(collection(this.fs, collectionName), where(field, '==', value));
    if (orderField) {
      q = query(q, orderBy(orderField, 'desc'));
    }
    return collectionData(q, { idField: 'id' }) as Observable<T[]>;
  }

}