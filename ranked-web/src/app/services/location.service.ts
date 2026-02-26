import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GeocodingService } from './geocoding.service';

export interface UserLocation {
  lat: number;
  lng: number;
  /** Display string if set from city (e.g. "Austin, TX") */
  displayName?: string;
}

const STORAGE_KEY = 'ranked_user_location';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private geocoding = inject(GeocodingService);

  private readonly _userLocation$ = new BehaviorSubject<UserLocation | null>(this.loadStored());

  readonly userLocation$: Observable<UserLocation | null> = this._userLocation$.asObservable();

  get userLocation(): UserLocation | null {
    return this._userLocation$.value;
  }

  private loadStored(): UserLocation | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserLocation;
      if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number') {
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private persist(loc: UserLocation | null): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      if (loc) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /** Request browser geolocation. Returns promise that resolves with location or rejects on error. */
  async requestBrowserLocation(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          const loc: UserLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          this._userLocation$.next(loc);
          this.persist(loc);
          resolve(loc);
        },
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  /** Set location from a city string (geocodes it). */
  async setLocationFromCity(city: string): Promise<UserLocation | null> {
    const result = await this.geocoding.geocode(city);
    if (!result) return null;
    const loc: UserLocation = {
      lat: result.lat,
      lng: result.lng,
      displayName: city.trim()
    };
    this._userLocation$.next(loc);
    this.persist(loc);
    return loc;
  }

  clearLocation(): void {
    this._userLocation$.next(null);
    this.persist(null);
  }
}
