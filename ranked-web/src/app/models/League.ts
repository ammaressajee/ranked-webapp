export interface League {
  id?: string;
  name: string;
  location: string;
  isActive: boolean;
  createdAt?: any;
  startAt?: any;
  endAt?: any;
  season?: number;
  maxPlayers?: number;
  /** Geo fields for radius queries (optional for backward compatibility) */
  lat?: number;
  lng?: number;
  geohash?: string;
}
