import { Component, inject } from '@angular/core';
import { LeagueService, DEFAULT_LEAGUE_RADIUS_KM } from '../../services/league.service';
import { LocationService } from '../../services/location.service';
import { AdminService } from '../../services/admin.service';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { League } from '../../models/League';
import { Observable, of, switchMap } from 'rxjs';

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
  adminService = inject(AdminService);
  auth = inject(Auth);
  router = inject(Router);

  userLocation$ = this.locationService.userLocation$;
  leagues: Observable<League[]> = this.locationService.userLocation$.pipe(
    switchMap(loc => loc
      ? this.ls.listLeaguesNearby(loc.lat, loc.lng, DEFAULT_LEAGUE_RADIUS_KM)
      : this.ls.listActiveLeagues()
    )
  );
  suggestedLocations$: Observable<string[]> = this.ls.getSuggestedLocations();
  isAdmin$ = this.adminService.isAdmin$;

  locationPromptCity = '';
  locationError: string | null = null;
  readonly DEFAULT_LEAGUE_RADIUS_KM = DEFAULT_LEAGUE_RADIUS_KM;

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

  async createLeague() {
    if (!this.createLeagueName.trim() || !this.createLocation.trim()) return;
    try {
      this.createdLeagueId = await this.ls.createLeague({
        name: this.createLeagueName.trim(),
        location: this.createLocation.trim()
      });
      this.createSuccess = true;
    } catch (err) {
      console.error(err);
      alert('Failed to create league. You may need admin access.');
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
    try {
      await this.locationService.requestBrowserLocation();
    } catch (err) {
      this.locationError = 'Could not get your location. Try entering your city instead.';
    }
  }

  async setLocationFromCity() {
    this.locationError = null;
    const city = this.locationPromptCity.trim();
    if (!city) return;
    const ok = await this.locationService.setLocationFromCity(city);
    if (!ok) this.locationError = 'Could not find that location.';
  }

  clearLocation() {
    this.locationService.clearLocation();
    this.locationPromptCity = '';
    this.locationError = null;
  }
}
