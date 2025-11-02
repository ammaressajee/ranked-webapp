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
}
