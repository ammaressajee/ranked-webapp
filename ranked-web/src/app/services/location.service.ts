import { inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);

  private readonly _userLocation$ = new BehaviorSubject<UserLocation | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const stored = this.loadStored();
      if (stored) this._userLocation$.next(stored);
    }
  }

  readonly userLocation$: Observable<UserLocation | null> = this._userLocation$.asObservable();

  get userLocation(): UserLocation | null {
    return this._userLocation$.value;
  }

  private loadStored(): UserLocation | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      if (loc) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
      } else {
        localStorage.removeItem(STORAGE_KEY);
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
          this.ngZone.run(() => {
            this._userLocation$.next(loc);
            this.persist(loc);
            resolve(loc);
          });
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
