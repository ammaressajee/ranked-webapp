import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AppComponent } from './app.component';

export const routes: Routes = [

    // Define a path for your login screen
    { path: 'login', component: LoginComponent },
    // Define the main application view (when logged in)
    // You might change the main component structure here later
    { path: '', component: AppComponent },

    // Catch-all or redirect
    { path: '**', redirectTo: '' }
];
