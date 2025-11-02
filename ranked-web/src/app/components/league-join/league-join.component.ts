import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LeagueService } from '../../services/league.service';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-league-join',
  imports: [CommonModule, FormsModule],
  templateUrl: './league-join.component.html',
  styleUrl: './league-join.component.scss',
})
export class LeagueJoinComponent {
  route = inject(ActivatedRoute);
  router = inject(Router);
  ls = inject(LeagueService);
  auth = inject(Auth);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  city = '';

  async join() {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    await this.ls.joinLeague(this.leagueId, {
      uid: user.uid,
      displayName: user.displayName || 'Player',
      photoURL: (user as any)?.photoURL || '',
      location: this.city,
      rank: (user as any)?.rank // optional; safer to read users/{uid} later
    });

    this.router.navigate(['/leagues', this.leagueId]);
  }
}