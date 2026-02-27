/** Contact preferences stored on Firestore users/{uid}. Only shared fields are visible to matched opponents. */
export interface UserContactPreferences {
  contactEmail?: string;
  shareContactEmail?: boolean;
  contactPhone?: string;
  shareContactPhone?: boolean;
  /** e.g. Discord, Instagram, or "Preferred app" handle */
  contactHandle?: string;
  shareContactHandle?: boolean;
  /** When true, matched opponents can see any contact fields you've marked to share. */
  shareContactWithOpponents?: boolean;
}

/** Result of getSharedContact: only fields the user has opted to share (for display to opponent). */
export interface SharedContactDisplay {
  contactEmail?: string;
  contactPhone?: string;
  contactHandle?: string;
}
