import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { RecordMatchComponent } from './pages/record-match/record-match.component';
import { PlayerProfileComponent } from './components/player-profile/player-profile.component';
import { LeagueListComponent } from './components/league-list/league-list.component';
import { LeagueJoinComponent } from './components/league-join/league-join.component';
import { LeagueDetailComponent } from './components/league-detail/league-detail.component';
import { LeagueMatchesComponent } from './components/league-matches/league-matches.component';
import { LeagueLeaderboardComponent } from './components/league-leaderboard/league-leaderboard.component';

export const routes: Routes = [
    { path: '', component: LeaderboardComponent },
    // Define a path for your login screen

    { path: 'login', component: LoginComponent },
    { path: 'leaderboard', component: LeaderboardComponent },
    { path: 'record-match', component: RecordMatchComponent },
    { path: 'profile/:uid', component: PlayerProfileComponent },
    { path: 'leagues/:id/join', component: LeagueJoinComponent },
    { path: 'leagues', component: LeagueListComponent },
    { path: 'leagues/:id', component: LeagueDetailComponent },
    { path: 'leagues/:id/matches', component: LeagueMatchesComponent },
    { path: 'leagues/:id/leaderboard', component: LeagueLeaderboardComponent },
    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
