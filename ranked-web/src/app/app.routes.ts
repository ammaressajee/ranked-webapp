import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
    { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
    { path: 'league', redirectTo: 'leagues', pathMatch: 'full' },
    { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
    { path: 'leaderboard', loadComponent: () => import('./components/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent) },
    { path: 'profile/:uid', loadComponent: () => import('./components/player-profile/player-profile.component').then(m => m.PlayerProfileComponent) },
    { path: 'leagues/:id/join', loadComponent: () => import('./components/league-join/league-join.component').then(m => m.LeagueJoinComponent) },
    { path: 'leagues', loadComponent: () => import('./components/league-list/league-list.component').then(m => m.LeagueListComponent) },
    { path: 'leagues/:id', loadComponent: () => import('./components/league-detail/league-detail.component').then(m => m.LeagueDetailComponent) },
    { path: 'leagues/:id/matches', loadComponent: () => import('./components/league-matches/league-matches.component').then(m => m.LeagueMatchesComponent) },
    { path: 'leagues/:id/leaderboard', loadComponent: () => import('./components/league-leaderboard/league-leaderboard.component').then(m => m.LeagueLeaderboardComponent) },
    { path: 'my-matches', loadComponent: () => import('./pages/my-matches/my-matches.component').then(m => m.MyMatchesComponent) },
    { path: 'messages', loadComponent: () => import('./pages/messages/messages-inbox.component').then(m => m.MessagesInboxComponent) },
    { path: 'messages/:matchId', loadComponent: () => import('./pages/messages/message-thread.component').then(m => m.MessageThreadComponent) },
    { path: 'help', loadComponent: () => import('./pages/help/help.component').then(m => m.HelpComponent) },
    { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent), canActivate: [adminGuard] },
    { path: '**', redirectTo: '' }
];
