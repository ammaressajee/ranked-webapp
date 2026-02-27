import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { LeagueService, DEFAULT_LEAGUE_RADIUS_KM, LEAGUE_RADIUS_MILES } from '../../services/league.service';
import { LocationService } from '../../services/location.service';
import { AdminService } from '../../services/admin.service';
import { Auth, authState } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { League } from '../../models/League';
import { Observable, of, switchMap, combineLatest, map } from 'rxjs';

@Component({
  selector: 'app-league-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './league-list.component.html',
  styleUrl: './league-list.component.scss',
})
export class LeagueListComponent {
  private ls = inject(LeagueService);
  private locationService = inject(LocationService);
  private cdr = inject(ChangeDetectorRef);
  adminService = inject(AdminService);
  auth = inject(Auth);
  router = inject(Router);

  userLocation$ = this.locationService.userLocation$;
  /** Nearby leagues (when location set) or all leagues (when no location). usedFallback=true when no nearby leagues. */
  leaguesResult$: Observable<{ leagues: League[]; usedFallback: boolean }> = this.locationService.userLocation$.pipe(
    switchMap(loc => loc
      ? this.ls.listLeaguesNearbyWithFallback(loc.lat, loc.lng, DEFAULT_LEAGUE_RADIUS_KM)
      : this.ls.listActiveLeagues().pipe(
          map(leagues => ({ leagues: leagues ?? [], usedFallback: false }))
        )
    )
  );
  /** Set of league IDs the current user has joined */
  joinedLeagueIds$: Observable<Set<string>> = authState(this.auth).pipe(
    switchMap(user => user
      ? this.ls.listUserLeagues(user.uid).pipe(
          map(parts => new Set(parts?.map(p => p.leagueId) ?? []))
        )
      : of(new Set<string>())
    )
  );
  /** User's joined leagues (to merge so they always see their leagues) */
  joinedLeagues$: Observable<League[]> = authState(this.auth).pipe(
    switchMap(user => !user ? of([]) : this.ls.listUserLeagues(user.uid).pipe(
      switchMap(parts => {
        if (!parts?.length) return of([]);
        const obs = parts.map(p => this.ls.getLeague(p.leagueId));
        return combineLatest(obs).pipe(
          map(leagues => leagues.filter((l): l is League => l != null))
        );
      })
    ))
  );
  /** Leagues with joined flag - merges nearby/all with user's joined leagues */
  leaguesWithJoined$: Observable<{ league: League; joined: boolean }[]> = combineLatest([
    this.leaguesResult$,
    this.joinedLeagueIds$,
    this.joinedLeagues$
  ]).pipe(
    map(([result, joinedIds, joinedLeagues]) => {
      const fromResult = result.leagues ?? [];
      const seen = new Set(fromResult.map(l => l.id));
      for (const l of joinedLeagues) {
        if (l?.id && !seen.has(l.id)) {
          seen.add(l.id);
          fromResult.push(l);
        }
      }
      return fromResult.map(league => ({
        league,
        joined: joinedIds.has(league.id ?? '')
      }));
    })
  );
  usedFallback$: Observable<boolean> = this.leaguesResult$.pipe(map(r => r.usedFallback));
  suggestedLocations$: Observable<string[]> = this.ls.getSuggestedLocations();
  selectableCities$: Observable<string[]> = this.ls.getSelectableCities();
  isAdmin$ = this.adminService.isAdmin$;

  locationError: string | null = null;
  locationLoading = false;
  readonly DEFAULT_LEAGUE_RADIUS_KM = DEFAULT_LEAGUE_RADIUS_KM;
  readonly LEAGUE_RADIUS_MILES = LEAGUE_RADIUS_MILES;

  showRequestForm = false;
  showCreateForm = false;
  requestSubmitted = false;
  createSuccess = false;
  createdLeagueId = '';

  requestLeagueName = '';
  requestLocation = '';
  createLeagueName = '';
  createLocation = '';

  async submitRequest() {
    const user = this.auth.currentUser;
    if (!user) return;
    if (!this.requestLeagueName.trim() || !this.requestLocation.trim()) return;
    try {
      await this.ls.createLeagueRequest({
        requestedBy: user.uid,
        requestedByName: user.displayName || 'Anonymous',
        leagueName: this.requestLeagueName.trim(),
        location: this.requestLocation.trim()
      });
      this.requestSubmitted = true;
    } catch (err) {
      console.error(err);
      alert('Failed to submit request.');
    }
  }

  createLeagueError: string | null = null;

  async createLeague() {
    this.createLeagueError = null;
    if (!this.createLeagueName.trim() || !this.createLocation.trim()) return;
    try {
      this.createdLeagueId = await this.ls.createLeague({
        name: this.createLeagueName.trim(),
        location: this.createLocation.trim()
      });
      this.createSuccess = true;
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || err?.code || String(err);
      this.createLeagueError = msg.includes('Permission') || msg.includes('permission')
        ? 'Only admins can create leagues. Add your UID to config/admins in Firestore.'
        : `Failed to create league: ${msg}`;
    }
  }

  openLeague(id: string) {
    this.router.navigate(['/leagues', id]);
  }

  joinLeague(id: string) {
    this.router.navigate(['/leagues', id, 'join']);
  }

  async useMyLocation() {
    this.locationError = null;
    this.locationLoading = true;
    try {
      await this.locationService.requestBrowserLocation();
      this.cdr.detectChanges();
      setTimeout(() => this.cdr.detectChanges(), 100);
    } catch (err) {
      this.locationError = 'Could not get your location. Enable location access or browse all leagues.';
    } finally {
      this.locationLoading = false;
      this.cdr.detectChanges();
    }
  }

  skipLocation() {
    this.locationError = null;
    this.locationService.clearLocation();
  }

  clearLocation() {
    this.locationService.clearLocation();
    this.locationError = null;
  }
}
