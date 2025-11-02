import { Component, inject } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { League } from '../../models/League';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-league-list',
  imports: [CommonModule],
  templateUrl: './league-list.component.html',
  styleUrl: './league-list.component.scss',
})
export class LeagueListComponent {
  ls = inject(LeagueService);
  router = inject(Router);

  leagues: Observable<League[]> = this.ls.listActiveLeagues();

  async createTestLeague() {
    const id = await this.ls.createLeague({ name: 'Austin Pickleball League', location: 'Austin, TX' });
    this.router.navigate(['/leagues', id]);
  }

  openLeague(id: string) { this.router.navigate(['/leagues', id]); }

  joinLeague(id: string) {
    this.router.navigate(['/leagues', id, 'join']);
  }

}
