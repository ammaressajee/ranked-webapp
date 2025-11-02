import { inject, Injectable } from '@angular/core';
import { addDoc, collection, collectionData, doc, Firestore, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { League } from '../models/League';
import { LeagueParticipant } from '../models/LeagueParticipant';

@Injectable({
  providedIn: 'root'
})
export class LeagueService {

  private fs = inject(Firestore);

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
  // Pairing & Scheduling
  // --------------------------
  async generatePairs(
    leagueId: string,
    round: number,
    location?: string,
    maxRecentToAvoid = 4
  ): Promise<{ pairs: Array<{ a: LeagueParticipant; b: LeagueParticipant }>; bye?: LeagueParticipant | null }> {
    const q = location
      ? query(this.participantsColl(), where('leagueId', '==', leagueId), where('location', '==', location))
      : query(this.participantsColl(), where('leagueId', '==', leagueId));

    const snap = await getDocs(q);
    const docs: LeagueParticipant[] = snap.docs.map(d => ({ ...(d.data() as LeagueParticipant), id: d.id }));

    docs.sort((x, y) => (y.currentRank ?? 1000) - (x.currentRank ?? 1000));

    const pool = [...docs];
    const pairs: Array<{ a: LeagueParticipant; b: LeagueParticipant }> = [];

    while (pool.length >= 2) {
      const a = pool.shift()!;
      let foundIdx = -1;
      for (let idx = 0; idx < pool.length; idx++) {
        const candidate = pool[idx];
        const mutualRecent =
          (a.recentOpponents ?? []).slice(-maxRecentToAvoid).includes(candidate.userId) ||
          (candidate.recentOpponents ?? []).slice(-maxRecentToAvoid).includes(a.userId);
        if (!mutualRecent) { foundIdx = idx; break; }
      }

      if (foundIdx === -1) {
        pairs.push({ a, b: pool.shift()! });
      } else {
        const b = pool.splice(foundIdx, 1)[0];
        pairs.push({ a, b });
      }
    }

    let bye: LeagueParticipant | null = null;
    if (pool.length === 1) bye = pool[0];

    return { pairs, bye };
  }

  async schedulePairs(
    leagueId: string,
    round: number,
    pairs: Array<{ a: LeagueParticipant; b: LeagueParticipant }>,
    bye?: LeagueParticipant | null
  ): Promise<string[]> {
    const batch = writeBatch(this.fs);
    const createdIds: string[] = [];

    function matchIdFor(aId: string, bId: string) {
      const [x, y] = [aId, bId].sort();
      return `${leagueId}_r${round}_${x}_${y}`;
    }

    for (const p of pairs) {
      const matchId = matchIdFor(p.a.userId, p.b.userId);
      const mRef = doc(this.fs, 'leagueMatches', matchId);
      batch.set(mRef, {
        leagueId,
        round,
        playerA: p.a.userId,
        playerB: p.b.userId,
        status: 'pending',
        type: 'standard',
        createdAt: serverTimestamp()
      }, { merge: false });
      createdIds.push(matchId);

      const aRef = doc(this.fs, 'leagueParticipants', `${leagueId}_${p.a.userId}`);
      const bRef = doc(this.fs, 'leagueParticipants', `${leagueId}_${p.b.userId}`);
      batch.set(aRef, { recentOpponents: (p.a.recentOpponents ?? []).concat(p.b.userId).slice(-10) }, { merge: true });
      batch.set(bRef, { recentOpponents: (p.b.recentOpponents ?? []).concat(p.a.userId).slice(-10) }, { merge: true });
    }

    if (bye) {
      const byeMatchId = `${leagueId}_r${round}_bye_${bye.userId}`;
      batch.set(doc(this.fs, 'leagueMatches', byeMatchId), {
        leagueId,
        round,
        playerA: bye.userId,
        playerB: null,
        status: 'completed',
        type: 'bye',
        createdAt: serverTimestamp(),
        result: { winner: bye.userId, score: 'bye' }
      }, { merge: false });
      createdIds.push(byeMatchId);
    }

    await batch.commit();
    return createdIds;
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