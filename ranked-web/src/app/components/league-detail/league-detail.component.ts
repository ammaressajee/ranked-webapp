import { Component, inject } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';
import { getAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-league-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './league-detail.component.html',
  styleUrl: './league-detail.component.scss',
})
export class LeagueDetailComponent {
  ls = inject(LeagueService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  fs = inject(Firestore);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  participants$: Observable<LeagueParticipant[]> = this.ls.listParticipants(this.leagueId);

  filterCity = '';
  round = 1;
  generating = false;
  generatedIds: string[] = [];
  auth = getAuth();

  async findMatch() {
    const user = this.auth.currentUser;
    if (!user) { alert('Sign in first'); return; }

    try {
      const resp = await this.ls.findMatchOnDemand(this.leagueId, user.uid, 1000, '');
      if (resp.status === 'queued') {
        alert('🔎 Looking for an opponent...');
      } else if (resp.status === 'matched') {
        alert(`✅ Matched! Opponent: ${resp.opponentUid}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error finding match.');
    }
  }

  async sweepMatches() {
    try {
      const resp = await this.ls.sweepPendingMatches();
      alert(`✅ Cancelled ${resp.count} pending matches`);
    } catch (err) {
      console.error(err);
      alert('Error sweeping matches.');
    }
  }


  openMatches() {
    this.router.navigate(['/leagues', this.leagueId, 'matches']);
  }

}