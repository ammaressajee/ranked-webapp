import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { RecordMatchComponent } from './pages/record-match/record-match.component';
import { PlayerProfileComponent } from './components/player-profile/player-profile.component';

export const routes: Routes = [
    { path: '', component: LeaderboardComponent },
    // Define a path for your login screen
    { path: 'login', component: LoginComponent },
    { path: 'leaderboard', component: LeaderboardComponent },
    { path: 'record-match', component: RecordMatchComponent },
    { path: 'profile/:uid', component: PlayerProfileComponent },

    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
