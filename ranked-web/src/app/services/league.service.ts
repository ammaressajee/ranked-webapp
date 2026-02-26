import { inject, Injectable } from '@angular/core';
import { addDoc, collection, collectionData, doc, docData, endAt, Firestore, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAt, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { combineLatest, firstValueFrom, map, Observable, of } from 'rxjs';
import { League } from '../models/League';
import { LeagueParticipant } from '../models/LeagueParticipant';
import { LeagueRequest } from '../models/LeagueRequest';
import { getAuth } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';
import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';
import { GeocodingService } from './geocoding.service';
import { environment } from '../../environments/environment';

/** Default radius in km for nearby league queries */
export const DEFAULT_LEAGUE_RADIUS_KM = 50;

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private fs = inject(Firestore);
  http = inject(HttpClient);
  private geocoding = inject(GeocodingService);

  private leaguesColl() { return collection(this.fs, 'leagues'); }
  private participantsColl() { return collection(this.fs, 'leagueParticipants'); }
  private matchesColl() { return collection(this.fs, 'leagueMatches'); }
  private leagueRequestsColl() { return collection(this.fs, 'leagueRequests'); }

  // --------------------------
  // League CRUD
  // --------------------------
  async createLeague(payload: { name: string; location: string; startAt?: any; endAt?: any; season?: number; maxPlayers?: number }) {
    const geo = await this.geocoding.geocode(payload.location);
    const docData: Record<string, unknown> = {
      ...payload,
      isActive: true,
      createdAt: serverTimestamp()
    };
    if (geo) {
      docData['lat'] = geo.lat;
      docData['lng'] = geo.lng;
      docData['geohash'] = geohashForLocation([geo.lat, geo.lng]);
    }
    const docRef = await addDoc(this.leaguesColl(), docData);
    return docRef.id;
  }

  getLeague(leagueId: string): Observable<League | null> {
    const ref = doc(this.fs, 'leagues', leagueId);
    return docData(ref, { idField: 'id' }) as Observable<League | null>;
  }

  listActiveLeagues(): Observable<League[]> {
    const q = query(this.leaguesColl(), where('isActive', '==', true), orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<League[]>;
  }

  /**
   * List leagues within radius of a point. Uses geohash queries.
   * Leagues without lat/lng/geohash are excluded.
   */
  listLeaguesNearby(lat: number, lng: number, radiusKm: number = DEFAULT_LEAGUE_RADIUS_KM): Observable<League[]> {
    const center: [number, number] = [lat, lng];
    const radiusM = radiusKm * 1000;
    const bounds = geohashQueryBounds(center, radiusM);

    const queries = bounds.map(([startHash, endHash]) => {
      const q = query(
        this.leaguesColl(),
        orderBy('geohash'),
        startAt(startHash),
        endAt(endHash)
      );
      return getDocs(q);
    });

    return new Observable(sub => {
      Promise.all(queries)
        .then(snapshots => {
          const seen = new Set<string>();
          const results: League[] = [];
          for (const snap of snapshots) {
            for (const d of snap.docs) {
              const data = d.data();
              const league = { id: d.id, ...data } as League;
              const isActive = league.isActive !== false;
              if (isActive && league.lat != null && league.lng != null && !seen.has(league.id!)) {
                const distKm = distanceBetween([league.lat, league.lng], center);
                if (distKm <= radiusKm) {
                  seen.add(league.id!);
                  results.push(league);
                }
              }
            }
          }
          results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
          sub.next(results);
          sub.complete();
        })
        .catch(err => {
          sub.error(err);
        });
    });
  }

  /** Distance in km between two points. */
  distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return distanceBetween([lat1, lng1], [lat2, lng2]);
  }

  listUserLeagues(uid: string): Observable<LeagueParticipant[]> {
    return collectionData(
      query(
        collection(this.fs, 'leagueParticipants'),
        where('userId', '==', uid),
        orderBy('currentRank', 'desc')
      ),
      { idField: 'id' }
    ) as Observable<LeagueParticipant[]>;
  }

  async joinLeague(leagueId: string, user: { uid: string; displayName: string; photoURL?: string; location?: string; rank?: number }, leagueName?: string) {
    const participantId = `${leagueId}_${user.uid}`;
    const ref = doc(this.fs, 'leagueParticipants', participantId);
    await setDoc(ref, {
      leagueId,
      ...(leagueName ? { leagueName } : {}),
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
  private readonly baseUrl = environment.functionsUrl;
  private get FIND_MATCH_URL() { return `${this.baseUrl}/find_match`; }
  private get SWEEP_MATCH_URL() { return `${this.baseUrl}/sweep_pending_matches`; }
  private get ACCEPT_MATCH_URL() { return `${this.baseUrl}/accept_match`; }
  private get DECLINE_MATCH_URL() { return `${this.baseUrl}/decline_match`; }

  // Call find_match
  async findMatchOnDemand(leagueId: string, userId: string, rank = 1000, location = '') {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error('Not authenticated');

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const body = { leagueId, userId, rank, location };

    return firstValueFrom(this.http.post(this.FIND_MATCH_URL, body, { headers })) as Promise<any>;
  }

  // Call sweep_pending_matches
  async sweepPendingMatches() {
    const headers = { 'Content-Type': 'application/json' };
    return firstValueFrom(this.http.post(this.SWEEP_MATCH_URL, {}, { headers })) as Promise<any>;
  }

  // Call accept_match (opponent accepts the match request)
  async acceptMatch(matchId: string) {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error('Not authenticated');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    return firstValueFrom(this.http.post(this.ACCEPT_MATCH_URL, { matchId }, { headers })) as Promise<any>;
  }

  // Call decline_match (opponent declines)
  async declineMatch(matchId: string) {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error('Not authenticated');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    return firstValueFrom(this.http.post(this.DECLINE_MATCH_URL, { matchId }, { headers })) as Promise<any>;
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

  /** Recent league matches for a user across all their leagues (for profile) */
  listRecentLeagueMatchesForUser(userId: string, limitCount = 10): Observable<any[]> {
    const qA = query(
      collection(this.fs, 'leagueMatches'),
      where('playerA', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const qB = query(
      collection(this.fs, 'leagueMatches'),
      where('playerB', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const matchesA$ = collectionData(qA, { idField: 'id' }) as Observable<any[]>;
    const matchesB$ = collectionData(qB, { idField: 'id' }) as Observable<any[]>;
    return combineLatest([matchesA$, matchesB$]).pipe(
      map(([a, b]) => {
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const m of [...a, ...b]) {
          if (m?.id && !seen.has(m.id)) {
            seen.add(m.id);
            merged.push(m);
          }
        }
        merged.sort((x, y) => {
          const tx = x.createdAt?.toMillis?.() ?? 0;
          const ty = y.createdAt?.toMillis?.() ?? 0;
          return ty - tx;
        });
        return merged.slice(0, limitCount);
      })
    );
  }

  listUserMatches(leagueId: string, userId: string): Observable<any[]> {
    const qA = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', leagueId),
      where('playerA', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const qB = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', leagueId),
      where('playerB', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const matchesA$ = collectionData(qA, { idField: 'id' }) as Observable<any[]>;
    const matchesB$ = collectionData(qB, { idField: 'id' }) as Observable<any[]>;

    return combineLatest([matchesA$, matchesB$]).pipe(
      map(([a, b]) => {
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const m of [...a, ...b]) {
          if (m?.id && !seen.has(m.id)) {
            seen.add(m.id);
            merged.push(m);
          }
        }
        merged.sort((x, y) => {
          const tx = x.createdAt?.toMillis?.() ?? 0;
          const ty = y.createdAt?.toMillis?.() ?? 0;
          return ty - tx;
        });
        return merged;
      })
    );
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

  // --------------------------
  // League Requests
  // --------------------------
  async createLeagueRequest(payload: { requestedBy: string; requestedByName: string; leagueName: string; location: string }) {
    const docRef = await addDoc(this.leagueRequestsColl(), {
      ...payload,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  listLeagueRequests(status?: 'pending' | 'approved' | 'rejected'): Observable<LeagueRequest[]> {
    let q = query(this.leagueRequestsColl(), orderBy('createdAt', 'desc'));
    if (status) {
      q = query(this.leagueRequestsColl(), where('status', '==', status), orderBy('createdAt', 'desc'));
    }
    return collectionData(q, { idField: 'id' }) as Observable<LeagueRequest[]>;
  }

  /** Distinct locations from leagues and pending requests (for suggested locations in request form) */
  getSuggestedLocations(): Observable<string[]> {
    return combineLatest([
      this.listActiveLeagues(),
      this.listLeagueRequests('pending')
    ]).pipe(
      map(([leagues, requests]) => {
        const seen = new Set<string>();
        const locations: string[] = [];
        for (const l of leagues) {
          const loc = (l.location || '').trim();
          if (loc && !seen.has(loc.toLowerCase())) {
            seen.add(loc.toLowerCase());
            locations.push(loc);
          }
        }
        for (const r of requests) {
          const loc = (r.location || '').trim();
          if (loc && !seen.has(loc.toLowerCase())) {
            seen.add(loc.toLowerCase());
            locations.push(loc);
          }
        }
        return locations.slice(0, 10);
      })
    );
  }

  /**
   * Approve a league request. Creates a new league from the request data, or uses existingLeagueId if provided.
   */
  async approveLeagueRequest(requestId: string, adminUid: string, existingLeagueId?: string): Promise<string> {
    const requestRef = doc(this.fs, 'leagueRequests', requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) throw new Error('Request not found');
    const data = requestSnap.data() as LeagueRequest;
    if (data.status !== 'pending') throw new Error('Request already processed');

    const leagueId = existingLeagueId ?? await this.createLeague({
      name: data.leagueName,
      location: data.location
    });

    await updateDoc(requestRef, {
      status: 'approved',
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp()
    });

    return leagueId;
  }

  async rejectLeagueRequest(requestId: string, adminUid: string) {
    const requestRef = doc(this.fs, 'leagueRequests', requestId);
    await updateDoc(requestRef, {
      status: 'rejected',
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp()
    });
  }
}