import { inject, Injectable, NgZone } from '@angular/core';
import { addDoc, collection, collectionData, deleteDoc, doc, docData, endAt, Firestore, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAt, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { combineLatest, firstValueFrom, from, map, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { League } from '../models/League';
import { AgreedSlot, AvailabilitySlot, LeagueMatch } from '../models/LeagueMatch';
import { LeagueParticipant } from '../models/LeagueParticipant';
import { LeagueRequest } from '../models/LeagueRequest';
import { SharedContactDisplay, UserContactPreferences } from '../models/UserContactPreferences';
import { getAuth } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';
import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';
import { GeocodingService } from './geocoding.service';
import { environment } from '../../environments/environment';

/** Minutes after match creation by which both players must accept (must match backend MATCH_NO_SHOW_MINUTES). */
export const ACCEPT_DEADLINE_MINUTES = 10;

/** 50 miles in km - leagues within this radius of user's location */
export const LEAGUE_RADIUS_MILES = 50;
export const DEFAULT_LEAGUE_RADIUS_KM = LEAGUE_RADIUS_MILES * 1.60934;

/** Normalized city list so "austin" and "austin tx" match the same option */
export const DEFAULT_CITIES: string[] = [
  'Austin, TX', 'Houston, TX', 'San Antonio, TX', 'Dallas, TX', 'Fort Worth, TX',
  'Los Angeles, CA', 'San Diego, CA', 'San Francisco, CA', 'San Jose, CA',
  'Phoenix, AZ', 'Tucson, AZ', 'Denver, CO', 'Chicago, IL', 'Seattle, WA',
  'Portland, OR', 'Atlanta, GA', 'Miami, FL', 'Orlando, FL', 'Tampa, FL',
  'Boston, MA', 'New York, NY', 'Philadelphia, PA', 'Washington, DC',
  'Las Vegas, NV', 'Nashville, TN', 'Charlotte, NC', 'Minneapolis, MN',
  'Detroit, MI', 'Columbus, OH', 'Indianapolis, IN', 'New Orleans, LA'
];

/**
 * Location matching: leagues and users use the same normalized city list (dropdown only).
 * - League: created with a city from getSelectableCities() → geocoded to lat/lng at create time.
 * - User: "Use current location" (browser geolocation) or select city from same dropdown → lat/lng.
 * - Join / nearby: always compare coordinates; allow only if distance <= LEAGUE_RADIUS_MILES.
 * No free-text location input anywhere (avoids bogus geocodes like "test" → 12127 km).
 */

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private fs = inject(Firestore);
  http = inject(HttpClient);
  private geocoding = inject(GeocodingService);
  private ngZone = inject(NgZone);

  private leaguesColl() { return collection(this.fs, 'leagues'); }
  private participantsColl() { return collection(this.fs, 'leagueParticipants'); }
  private matchesColl() { return collection(this.fs, 'leagueMatches'); }
  private leagueRequestsColl() { return collection(this.fs, 'leagueRequests'); }
  private searchRequestsColl() { return collection(this.fs, 'searchRequests'); }

  // --------------------------
  // League CRUD
  // --------------------------
  async createLeague(payload: { name: string; location: string; startAt?: any; endAt?: any; season?: number; maxPlayers?: number }) {
    const docData: Record<string, unknown> = {
      ...payload,
      isActive: true,
      createdAt: serverTimestamp()
    };
    try {
      const geo = await this.geocoding.geocode(payload.location);
      if (geo) {
        docData['lat'] = geo.lat;
        docData['lng'] = geo.lng;
        docData['geohash'] = geohashForLocation([geo.lat, geo.lng]);
      }
    } catch (_) {
      // League still created; will show in "all leagues" but not in nearby search
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
   * List leagues within radius. If none found, falls back to all active leagues.
   * Always includes leagues the user has joined (via merge in component).
   */
  listLeaguesNearbyWithFallback(lat: number, lng: number, radiusKm: number = DEFAULT_LEAGUE_RADIUS_KM): Observable<{ leagues: League[]; usedFallback: boolean }> {
    return new Observable(sub => {
      this.listLeaguesNearby(lat, lng, radiusKm).subscribe({
        next: nearby => {
          const emit = (leagues: League[], usedFallback: boolean) => {
            this.ngZone.run(() => {
              sub.next({ leagues, usedFallback });
              sub.complete();
            });
          };
          if (nearby.length > 0) {
            emit(nearby, false);
          } else {
            this.listActiveLeagues().subscribe(all => {
              emit(all ?? [], true);
            });
          }
        },
        error: () => {
          this.listActiveLeagues().subscribe(all => {
            this.ngZone.run(() => {
              sub.next({ leagues: all ?? [], usedFallback: true });
              sub.complete();
            });
          });
        }
      });
    });
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
          this.ngZone.run(() => {
            sub.next(results);
            sub.complete();
          });
        })
        .catch(err => {
          this.ngZone.run(() => sub.error(err));
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

  /** Remove the current user from a league (deletes their participant doc). */
  async leaveLeague(leagueId: string, userId: string): Promise<void> {
    const participantId = `${leagueId}_${userId}`;
    const ref = doc(this.fs, 'leagueParticipants', participantId);
    await deleteDoc(ref);
  }

  /** Admin only: delete a league and all its participants and matches. */
  async deleteLeague(leagueId: string): Promise<void> {
    const participantsQ = query(this.participantsColl(), where('leagueId', '==', leagueId));
    const participantsSnap = await getDocs(participantsQ);
    for (const d of participantsSnap.docs) {
      await deleteDoc(d.ref);
    }
    const matchesQ = query(this.matchesColl(), where('leagueId', '==', leagueId));
    const matchesSnap = await getDocs(matchesQ);
    for (const d of matchesSnap.docs) {
      await deleteDoc(d.ref);
    }
    const leagueRef = doc(this.fs, 'leagues', leagueId);
    await deleteDoc(leagueRef);
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
  private get LEAVE_QUEUE_URL() { return `${this.baseUrl}/leave_queue`; }
  private get QUEUE_COUNT_URL() { return `${this.baseUrl}/queue_count`; }

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

  /** Whether this user is currently in the matchmaking queue for this league (seeking). */
  getSearchRequest(leagueId: string, userId: string): Observable<{ seeking: boolean } | null> {
    const docId = `${leagueId}_${userId}`;
    const ref = doc(this.fs, 'searchRequests', docId);
    return docData(ref).pipe(
      map(data => (data != null && typeof data === 'object') ? { seeking: !!data['seeking'] } : null),
      catchError(() => of(null))
    );
  }

  /** Top participants across all leagues by currentRank (for global leaderboard). Dedupe by userId in consumer. */
  getTopParticipantsGlobally(limitCount = 50): Observable<LeagueParticipant[]> {
    const q = query(
      this.participantsColl(),
      orderBy('currentRank', 'desc'),
      limit(limitCount)
    );
    return collectionData(q, { idField: 'id' }) as Observable<LeagueParticipant[]>;
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

  /** Leave the matchmaking queue for a league. */
  async leaveMatchQueue(leagueId: string) {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error('Not authenticated');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    return firstValueFrom(this.http.post(this.LEAVE_QUEUE_URL, { leagueId }, { headers })) as Promise<{ status: string }>;
  }

  /** Number of users currently in the matchmaking queue for a league (including current user if seeking). */
  getQueueCount(leagueId: string): Observable<number> {
    const user = getAuth().currentUser;
    const tokenPromise = user ? user.getIdToken(true) : Promise.reject(new Error('Not authenticated'));
    return from(tokenPromise).pipe(
      switchMap(token =>
        this.http.get<{ count: number }>(this.QUEUE_COUNT_URL, {
          headers: { Authorization: `Bearer ${token}` },
          params: { leagueId }
        })
      ),
      map(res => res?.count ?? 0),
      catchError(() => of(0))
    );
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

  /** Set current user's availability for a pending match (availabilityA or availabilityB). */
  async setMatchAvailability(matchId: string, isPlayerA: boolean, slots: AvailabilitySlot[]) {
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, { [isPlayerA ? 'availabilityA' : 'availabilityB']: slots });
  }

  /** Set agreed slot (date + period, and optionally time) for a pending match. */
  async setAgreedSlot(matchId: string, agreed: AgreedSlot) {
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, { agreedSlot: agreed });
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

  // --------------------------
  // Opponent contact (coordination)
  // --------------------------

  /** Get contact preferences for a user (for own profile edit). */
  getUserContactPreferences(uid: string): Observable<UserContactPreferences | null> {
    const ref = doc(this.fs, 'users', uid);
    return (docData(ref).pipe(
      map(data => data as UserContactPreferences | null),
      catchError(() => of(null))
    ) as Observable<UserContactPreferences | null>);
  }

  /**
   * Get shared contact for an opponent to display on a match card.
   * Returns contact only if they've opted in (global share or per-match share for this match).
   */
  getSharedContactForUser(
    opponentUid: string,
    context: { match?: LeagueMatch; viewerUid: string }
  ): Observable<SharedContactDisplay | null> {
    const ref = doc(this.fs, 'users', opponentUid);
    return (docData(ref).pipe(
      map(data => {
        if (!data || typeof data !== 'object') return null;
        const d = data as Record<string, unknown>;
        const match = context.match;
        const viewerUid = context.viewerUid;
        const isOpponentA = match?.playerA === opponentUid;
        const isOpponentB = match?.playerB === opponentUid;
        const sharedForThisMatch =
          (isOpponentA && match?.sharedContactByPlayerA) || (isOpponentB && match?.sharedContactByPlayerB);
        const shareWithOpponents = !!d['shareContactWithOpponents'];

        const out: SharedContactDisplay = {};
        if (sharedForThisMatch) {
          if (d['contactEmail']) out.contactEmail = String(d['contactEmail']);
          if (d['contactPhone']) out.contactPhone = String(d['contactPhone']);
          if (d['contactHandle']) out.contactHandle = String(d['contactHandle']);
        } else if (shareWithOpponents) {
          if (d['shareContactEmail'] && d['contactEmail']) out.contactEmail = String(d['contactEmail']);
          if (d['shareContactPhone'] && d['contactPhone']) out.contactPhone = String(d['contactPhone']);
          if (d['shareContactHandle'] && d['contactHandle']) out.contactHandle = String(d['contactHandle']);
        }
        const hasAny = out.contactEmail || out.contactPhone || out.contactHandle;
        return hasAny ? out : null;
      }),
      catchError(() => of(null))
    ) as Observable<SharedContactDisplay | null>);
  }

  async updateUserContactPreferences(uid: string, prefs: Partial<UserContactPreferences>): Promise<void> {
    const ref = doc(this.fs, 'users', uid);
    await updateDoc(ref, prefs as Record<string, unknown>);
  }

  /** Mark that the current user has shared their contact with the opponent for this match. */
  async setMatchSharedContact(matchId: string, isPlayerA: boolean): Promise<void> {
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, isPlayerA ? { sharedContactByPlayerA: true } : { sharedContactByPlayerB: true });
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

  /** Cities for dropdown: default list + any from leagues/requests, normalized and sorted */
  getSelectableCities(): Observable<string[]> {
    return combineLatest([
      this.listActiveLeagues(),
      this.listLeagueRequests('pending')
    ]).pipe(
      map(([leagues, requests]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const city of DEFAULT_CITIES) {
          const key = city.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(city);
          }
        }
        for (const l of leagues) {
          const loc = (l.location || '').trim();
          if (loc && !seen.has(loc.toLowerCase())) {
            seen.add(loc.toLowerCase());
            out.push(loc);
          }
        }
        for (const r of requests) {
          const loc = (r.location || '').trim();
          if (loc && !seen.has(loc.toLowerCase())) {
            seen.add(loc.toLowerCase());
            out.push(loc);
          }
        }
        return out.sort((a, b) => a.localeCompare(b));
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