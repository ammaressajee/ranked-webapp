import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LeagueService, DEFAULT_LEAGUE_RADIUS_KM } from '../../services/league.service';
import { LocationService } from '../../services/location.service';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { combineLatest, firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-league-join',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  city = '';
  joinBlockedReason: string | null = null;

  ngOnInit() {
    combineLatest([this.league$, this.userLocation$]).subscribe(([league, userLoc]) => {
      if (league?.lat != null && league?.lng != null && userLoc) {
        const distKm = this.ls.distanceKm(league.lat, league.lng, userLoc.lat, userLoc.lng);
        if (distKm > DEFAULT_LEAGUE_RADIUS_KM) {
          this.joinBlockedReason = `This league is ${Math.round(distKm)} km away. Players must meet in person to play.`;
          return;
        }
      }
      this.joinBlockedReason = null;
    });
  }

  async join() {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    const league = await firstValueFrom(this.ls.getLeague(this.leagueId));
    const userLoc = this.locationService.userLocation;

    if (league?.lat != null && league?.lng != null && userLoc) {
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
      location: this.city,
      rank: (user as any)?.rank // optional; safer to read users/{uid} later
    }, league?.name ?? undefined);

    this.router.navigate(['/league']);
  }
}