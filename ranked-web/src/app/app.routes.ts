import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { PlayerProfileComponent } from './components/player-profile/player-profile.component';
import { LeagueListComponent } from './components/league-list/league-list.component';
import { LeagueJoinComponent } from './components/league-join/league-join.component';
import { LeagueDetailComponent } from './components/league-detail/league-detail.component';
import { LeagueMatchesComponent } from './components/league-matches/league-matches.component';
import { LeagueLeaderboardComponent } from './components/league-leaderboard/league-leaderboard.component';
import { MyMatchesComponent } from './pages/my-matches/my-matches.component';
import { AdminComponent } from './pages/admin/admin.component';
import { HelpComponent } from './pages/help/help.component';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'league', redirectTo: 'leagues', pathMatch: 'full' },
    // Define a path for your login screen

    { path: 'login', component: LoginComponent },
    { path: 'leaderboard', component: LeaderboardComponent },
    { path: 'profile/:uid', component: PlayerProfileComponent },
    { path: 'leagues/:id/join', component: LeagueJoinComponent },
    { path: 'leagues', component: LeagueListComponent },
    { path: 'leagues/:id', component: LeagueDetailComponent },
    { path: 'leagues/:id/matches', component: LeagueMatchesComponent },
    { path: 'leagues/:id/leaderboard', component: LeagueLeaderboardComponent },
    { path: 'my-matches', component: MyMatchesComponent },
    { path: 'help', component: HelpComponent },
    { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
