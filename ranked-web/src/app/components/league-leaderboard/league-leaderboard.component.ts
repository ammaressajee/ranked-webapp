import { Component, inject } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { ActivatedRoute } from '@angular/router';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-league-leaderboard',
  imports: [CommonModule],
  templateUrl: './league-leaderboard.component.html',
  styleUrl: './league-leaderboard.component.scss',
})
export class LeagueLeaderboardComponent {
  ls = inject(LeagueService);
  route = inject(ActivatedRoute);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  participants: Observable<LeagueParticipant[]> = this.ls.listParticipants(this.leagueId);

  async shareLeague() {
    const shareUrl = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: 'Join my League!',
        text: 'Think you can beat me? Join this league and prove it 💪',
        url: shareUrl
      });
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copied! Share it with your friends!');
    }
  }

}
