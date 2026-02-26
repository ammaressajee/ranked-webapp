import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { LeagueService } from '../../services/league.service';
import { LeagueListComponent } from '../../components/league-list/league-list.component';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { take } from 'rxjs';

@Component({
  selector: 'app-league-hub',
  standalone: true,
  imports: [CommonModule, LeagueListComponent],
  templateUrl: './league-hub.component.html',
  styleUrl: './league-hub.component.scss'
})
export class LeagueHubComponent implements OnInit {
  private authService = inject(AuthService);
  private leagueService = inject(LeagueService);
  private router = inject(Router);

  loading = true;

  ngOnInit() {
    const uid = this.authService.profile()?.uid;
    if (!uid) {
      this.loading = false;
      return;
    }
    this.leagueService.listUserLeagues(uid).pipe(take(1)).subscribe((participants: LeagueParticipant[]) => {
      this.loading = false;
      const first = participants?.[0];
      if (first?.leagueId) {
        this.router.navigate(['/leagues', first.leagueId]);
      }
    });
  }
}
