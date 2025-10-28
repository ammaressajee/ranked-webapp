import { inject, Injectable, signal } from '@angular/core';
import { 
  Auth, GoogleAuthProvider, signInWithPopup, signOut, User, user,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile
} from '@angular/fire/auth';
import { doc, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  auth = inject(Auth);
  private firestore = inject(Firestore);

  user$ = user(this.auth);
  profile = signal<any>(null);
  joined = signal(false);

  constructor() {
    this.user$.subscribe(async (u) => {
      if (u) {
        this.profile.set({
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL ?? '',
          rank: 1000,
          wins: 0,
          losses: 0,
          matchesCount: 0,
          joinedAt: serverTimestamp(),
        });
        await this.ensureUserProfile(u); // ensures user doc consistency
      } else {
        this.profile.set(null);
        this.joined.set(false);
      }
    });
  }

  // ✅ Centralized profile setup
  private async ensureUserProfile(user: User) {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || '',
        rank: 1000,
        wins: 0,
        losses: 0,
        matchesCount: 0,
        joinedAt: serverTimestamp(),
      });
    }
  }

  // Google Auth
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(this.auth, provider);
    await this.ensureUserProfile(cred.user);
  }

  // Email Sign Up
  async signUpWithEmail(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    const u = cred.user;

    // Update display name
    await updateProfile(u, { displayName });
    await this.ensureUserProfile(u);
  }

  // Email Sign In
  async signInWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await this.ensureUserProfile(cred.user); // in case user doc missing
  }

  async logout() {
    await signOut(this.auth);
  }

  isLoggedIn(): boolean {
    return this.auth.currentUser !== null;
  }
}
