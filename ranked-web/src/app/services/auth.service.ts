import { inject, Injectable, signal } from '@angular/core';
import { doc, Firestore, setDoc } from '@angular/fire/firestore';
import { 
  Auth, GoogleAuthProvider, signInWithPopup, signOut, User, user,
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,     
  updateProfile                     
} from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  auth = inject(Auth);
  private firestore = inject(Firestore);

  // Expose the Firebase user state as an Observable
  user$ = user(this.auth);

  // Local state for profile and user-specific data
  profile = signal<any>(null);
  joined = signal(false);
  
  // You might move the leaderboard here as well, but we'll leave it in the component for now.

  constructor() {
    // Subscribe to the auth state to keep the local 'profile' signal updated
    this.user$.subscribe(u => {
      if (u) {
        this.profile.set({ 
            uid: u.uid, 
            displayName: u.displayName, 
            email: u.email, 
            photoURL: u.photoURL ?? '' // Ensure it's not null/undefined
        });
      } else {
        this.profile.set(null);
        this.joined.set(false);
      }
    });
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    const { uid, displayName, email, photoURL } = cred.user as User;
    
    // Write/update user document in Firestore
    await setDoc(doc(this.firestore, 'users', uid), {
      uid, 
      displayName, 
      email, 
      photoURL: photoURL ?? '', // ensure Firestore record has a non-null photoURL
      joinedAt: new Date(), 
      rank: 1000
    }, { merge: true });
    
    // The profile signal will be updated immediately via the constructor's subscription.
  }
  async signUpWithEmail(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    const u = cred.user;

    // Set the display name right after creation
    await updateProfile(u, { displayName: displayName });

    // Write/update user document in Firestore
    await setDoc(doc(this.firestore, 'users', u.uid), {
      uid: u.uid,
      displayName: displayName, // Use the provided display name
      email: u.email,
      photoURL: u.photoURL ?? '',
      joinedAt: new Date(),
      rank: 1000
    }, { merge: true });
  }


  async signInWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(this.auth, email, password);
    // State update handled by the constructor's subscription
  }

  async logout() {
    await signOut(this.auth);
    // State cleanup handled in the constructor's subscription
  }
}
