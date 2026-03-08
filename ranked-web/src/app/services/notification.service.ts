import { inject, Injectable } from '@angular/core';
import { doc, Firestore, setDoc, deleteField, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getApp } from 'firebase/app';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private messaging: ReturnType<typeof getMessaging> | null = null;

  async init(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    try {
      this.messaging = getMessaging(getApp());

      onMessage(this.messaging, (payload) => {
        const title = payload.notification?.title ?? 'Ladders';
        const body = payload.notification?.body ?? '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.svg' });
        }
      });
    } catch {
      // Messaging not supported in this browser
    }
  }

  async requestPermissionAndRegister(): Promise<boolean> {
    if (!this.messaging) return false;

    const uid = this.authService.profile()?.uid;
    if (!uid) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const token = await getToken(this.messaging, {
        vapidKey: environment.firebaseConfig.messagingSenderId
      });

      if (token) {
        await this.saveToken(uid, token);
        return true;
      }
    } catch (err) {
      console.error('Failed to get FCM token:', err);
    }
    return false;
  }

  private async saveToken(uid: string, token: string): Promise<void> {
    const tokenRef = doc(this.firestore, `userTokens/${uid}`);
    await setDoc(tokenRef, {
      fcmToken: token,
      updatedAt: new Date(),
      platform: 'web'
    }, { merge: true });
  }

  async removeToken(): Promise<void> {
    const uid = this.authService.profile()?.uid;
    if (!uid) return;
    const tokenRef = doc(this.firestore, `userTokens/${uid}`);
    await setDoc(tokenRef, { fcmToken: deleteField() }, { merge: true });
  }
}
