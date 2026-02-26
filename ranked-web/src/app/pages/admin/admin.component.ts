import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LeagueService } from '../../services/league.service';
import { Auth } from '@angular/fire/auth';
import { LeagueRequest } from '../../models/LeagueRequest';
import { map, Observable } from 'rxjs';

/** Group of requests for the same location */
export interface RequestsByLocation {
  location: string;
  count: number;
  requests: LeagueRequest[];
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent {
  private ls = inject(LeagueService);
  private auth = inject(Auth);
  private router = inject(Router);

  pendingRequests$ = this.ls.listLeagueRequests('pending');

  /** Pending requests grouped by normalized location */
  requestsByLocation$: Observable<RequestsByLocation[]> = this.pendingRequests$.pipe(
    map(requests => {
      const byLocation = new Map<string, LeagueRequest[]>();
      for (const req of requests) {
        const key = (req.location || '').trim().toLowerCase() || '(no location)';
        if (!byLocation.has(key)) byLocation.set(key, []);
        byLocation.get(key)!.push(req);
      }
      return Array.from(byLocation.entries())
        .map(([key, reqs]) => ({
          location: reqs[0]?.location || key,
          count: reqs.length,
          requests: reqs
        }))
        .sort((a, b) => b.count - a.count);
    })
  );

  // Create League form
  showCreateForm = false;
  createLeagueName = '';
  createLocation = '';
  createSuccess = false;
  createdLeagueId = '';
  createError: string | null = null;
  /** When creating from a request, approve it after league is created */
  createFromRequestId: string | null = null;

  async createLeague() {
    this.createError = null;
    const name = this.createLeagueName.trim();
    const location = this.createLocation.trim();
    if (!name || !location) {
      this.createError = 'Name and location are required.';
      return;
    }
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    try {
      this.createdLeagueId = await this.ls.createLeague({ name, location });
      if (this.createFromRequestId) {
        await this.ls.approveLeagueRequest(this.createFromRequestId, uid, this.createdLeagueId);
        this.createFromRequestId = null;
      }
      this.createSuccess = true;
      this.createLeagueName = '';
      this.createLocation = '';
    } catch (err) {
      console.error(err);
      this.createError = 'Failed to create league.';
    }
  }

  openCreateForm() {
    this.showCreateForm = true;
    this.createSuccess = false;
    this.createdLeagueId = '';
    this.createError = null;
    this.createFromRequestId = null;
  }

  closeCreateForm() {
    this.showCreateForm = false;
    this.createSuccess = false;
    this.createFromRequestId = null;
  }

  /** Pre-fill create form from a request; submitting will also approve that request */
  createFromRequest(req: LeagueRequest) {
    this.createLeagueName = req.leagueName || '';
    this.createLocation = req.location || '';
    this.createFromRequestId = req.id || null;
    this.showCreateForm = true;
    this.createSuccess = false;
    this.createError = null;
  }

  viewCreatedLeague() {
    if (this.createdLeagueId) {
      this.router.navigate(['/leagues', this.createdLeagueId]);
      this.closeCreateForm();
    }
  }

  async approve(request: LeagueRequest) {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !request.id) return;
    try {
      await this.ls.approveLeagueRequest(request.id, uid);
    } catch (err) {
      console.error(err);
      alert('Failed to approve request.');
    }
  }

  async reject(request: LeagueRequest) {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !request.id) return;
    try {
      await this.ls.rejectLeagueRequest(request.id, uid);
    } catch (err) {
      console.error(err);
      alert('Failed to reject request.');
    }
  }
}
