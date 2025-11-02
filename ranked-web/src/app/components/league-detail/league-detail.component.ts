import { Component, inject } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { collection, Firestore, getDocs, query, where } from '@angular/fire/firestore';

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

  async generatePairsForRound() {
    this.generating = true;
    try {
      const { pairs, bye } = await this.ls.generatePairs(this.leagueId, this.round, this.filterCity);
      const ids = await this.ls.schedulePairs(this.leagueId, this.round, pairs, bye);
      this.generatedIds = ids;
      alert(`✅ Round ${this.round} matches generated!`);
    } catch (err) {
      console.error(err);
      alert('Error generating pairs');
    } finally {
      this.generating = false;
    }
  }

  openMatches() {
    this.router.navigate(['/leagues', this.leagueId, 'matches']);
  }

  async checkAndGenerateNextRound() {
    // Get total participants count
    const participantsSnap = await firstValueFrom(this.participants$);
    const totalParticipants = participantsSnap.length;
    const expectedMatchesCount = Math.floor(totalParticipants / 2);

    // Get number of completed matches in this league
    const q = query(
      collection(this.fs, 'leagueMatches'),
      where('leagueId', '==', this.leagueId),
      where('status', '==', 'completed')
    );
    const completedMatches = (await getDocs(q)).docs.length;

    console.log(`Completed matches: ${completedMatches}/${expectedMatchesCount}`);

    // If all matches in current round are done → start next round
    if (completedMatches >= expectedMatchesCount) {
      this.round++;
      await this.generatePairsForRound();
      alert(`🔥 All matches completed! Round ${this.round} has started.`);
    } else {
      alert('⏳ Not all matches are completed yet!');
    }
  }
}