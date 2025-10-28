import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';
import { RecordMatchComponent } from './pages/record-match/record-match.component';

export const routes: Routes = [

    // Define a path for your login screen
    { path: 'login', component: LoginComponent },
    { path: '', component: LeaderboardComponent },
    { path: 'record-match', component: RecordMatchComponent },

    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
