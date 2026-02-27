import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LeagueService, DEFAULT_LEAGUE_RADIUS_KM, LEAGUE_RADIUS_MILES } from '../../services/league.service';
import { LocationService } from '../../services/location.service';
import { Auth } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { combineLatest, firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-league-join',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './league-join.component.html',
  styleUrl: './league-join.component.scss',
})
export class LeagueJoinComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ls = inject(LeagueService);
  private locationService = inject(LocationService);
  private auth = inject(Auth);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  league$ = this.ls.getLeague(this.leagueId);
  userLocation$ = this.locationService.userLocation$;
  joinBlockedReason: string | null = null;
  joining = false;
  readonly LEAGUE_RADIUS_MILES = LEAGUE_RADIUS_MILES;

  ngOnInit() {
    combineLatest([this.league$, this.userLocation$]).subscribe(([league, userLoc]) => {
      if (!league) return;
      // League must have coordinates (set when created from city dropdown)
      if (league.lat == null || league.lng == null) {
        this.joinBlockedReason = 'This league doesn\'t have a valid location set. An admin can update it.';
        return;
      }
      if (!userLoc) return;
      const distKm = this.ls.distanceKm(league.lat, league.lng, userLoc.lat, userLoc.lng);
      if (distKm > DEFAULT_LEAGUE_RADIUS_KM) {
        this.joinBlockedReason = `This league is ${Math.round(distKm)} km away. You must be within ${LEAGUE_RADIUS_MILES} miles to join (players meet in person).`;
        return;
      }
      this.joinBlockedReason = null;
    });
  }

  private async doJoin(userLoc: { lat: number; lng: number; displayName?: string } | null, locationLabel: string) {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    const league = await firstValueFrom(this.ls.getLeague(this.leagueId));
    if (!league) {
      this.joinBlockedReason = 'League not found.';
      return;
    }
    if (league.lat == null || league.lng == null) {
      this.joinBlockedReason = 'This league doesn\'t have a valid location set. An admin can update it.';
      return;
    }
    if (userLoc) {
      const distKm = this.ls.distanceKm(league.lat, league.lng, userLoc.lat, userLoc.lng);
      if (distKm > DEFAULT_LEAGUE_RADIUS_KM) {
        this.joinBlockedReason = `This league is ${Math.round(distKm)} km away. Players must meet in person to play.`;
        return;
      }
    }
    this.joinBlockedReason = null;

    await this.ls.joinLeague(this.leagueId, {
      uid: user.uid,
      displayName: user.displayName || 'Player',
      photoURL: (user as any)?.photoURL || '',
      location: locationLabel,
      rank: (user as any)?.rank
    }, league.name ?? undefined);

    this.router.navigate(['/leagues', this.leagueId]);
  }

  async joinWithLocation() {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }
    this.joining = true;
    this.joinBlockedReason = null;
    try {
      const loc = await this.locationService.requestBrowserLocation();
      await this.doJoin(loc, loc.displayName ?? 'Current location');
    } catch (err) {
      this.joinBlockedReason = 'Could not get your location. Please allow location access to join.';
    } finally {
      this.joining = false;
    }
  }

}