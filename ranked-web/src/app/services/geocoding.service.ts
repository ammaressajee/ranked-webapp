import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName?: string;
}

/**
 * Geocodes location strings (e.g. "Austin, TX") to coordinates.
 * Uses Nominatim (OpenStreetMap) - free, no API key required.
 * Rate limit: 1 request/second for Nominatim public instance.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private http = inject(HttpClient);

  private readonly NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  private cache = new Map<string, GeocodingResult>();

  /**
   * Geocode a location string to lat/lng.
   * Results are cached by normalized location string.
   */
  async geocode(location: string): Promise<GeocodingResult | null> {
    const key = location.trim().toLowerCase();
    if (!key) return null;

    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const result = await firstValueFrom(
        this.http.get<Array<{ lat: string; lon: string; display_name?: string }>>(
          this.NOMINATIM_URL,
          {
            params: {
              q: location.trim(),
              format: 'json',
              limit: '1'
            },
            headers: {
              'User-Agent': 'RankedPickleball/1.0'
            }
          }
        )
      );

      if (!result?.length) return null;

      const res = {
        lat: parseFloat(result[0].lat),
        lng: parseFloat(result[0].lon),
        displayName: result[0].display_name
      };

      this.cache.set(key, res);
      return res;
    } catch (err) {
      console.error('Geocoding failed:', err);
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
