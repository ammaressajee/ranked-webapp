import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';

export const routes: Routes = [

    // Define a path for your login screen
    { path: 'login', component: LoginComponent },
    // Define the main application view (when logged in)
    // You might change the main component structure here later
    { path: '', component: LeaderboardComponent },

    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
