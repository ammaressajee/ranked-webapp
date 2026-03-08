import { Component, inject, OnInit } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { BreadcrumbComponent, BreadcrumbItem } from '../breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-league-leaderboard',
  imports: [CommonModule, RouterLink, BreadcrumbComponent],
  templateUrl: './league-leaderboard.component.html',
  styleUrl: './league-leaderboard.component.scss',
})
export class LeagueLeaderboardComponent implements OnInit {
  ls = inject(LeagueService);
  route = inject(ActivatedRoute);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  participants: Observable<LeagueParticipant[]> = this.ls.listParticipants(this.leagueId);
  breadcrumbs: BreadcrumbItem[] = [
    { label: 'Leagues', route: '/leagues' },
    { label: '...', route: ['/leagues', this.leagueId] },
    { label: 'Leaderboard' }
  ];

  ngOnInit() {
    this.ls.getLeague(this.leagueId).subscribe(league => {
      if (league?.name) {
        this.breadcrumbs = [
          { label: 'Leagues', route: '/leagues' },
          { label: league.name, route: ['/leagues', this.leagueId] },
          { label: 'Leaderboard' }
        ];
      }
    });
  }

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
