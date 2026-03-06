import { inject, Injectable } from '@angular/core';
import {
  addDoc, collection, collectionData, doc, Firestore,
  orderBy, query, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { map, Observable, of } from 'rxjs';
import { MatchMessage } from '../models/MatchMessage';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private fs = inject(Firestore);
  private auth = inject(Auth);

  private messagesColl(matchId: string) {
    return collection(this.fs, 'matchMessages', matchId, 'messages');
  }

  getMessages$(matchId: string): Observable<MatchMessage[]> {
    if (!matchId) return of([]);
    const q = query(this.messagesColl(matchId), orderBy('createdAt', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<MatchMessage[]>;
  }

  async sendMessage(matchId: string, text: string): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !text.trim()) return;

    await addDoc(this.messagesColl(matchId), {
      matchId,
      senderUid: uid,
      text: text.trim(),
      createdAt: serverTimestamp(),
      type: 'text'
    });

    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, { lastActivityAt: serverTimestamp() });
  }

  async sendSystemMessage(matchId: string, text: string): Promise<void> {
    await addDoc(this.messagesColl(matchId), {
      matchId,
      senderUid: 'system',
      text,
      createdAt: serverTimestamp(),
      type: 'system'
    });
  }

  async markRead(matchId: string): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, { [`lastReadBy.${uid}`]: serverTimestamp() });
  }

  getUnreadCount$(matchId: string, messages$: Observable<MatchMessage[]>, lastReadBy: any): Observable<number> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return of(0);

    return messages$.pipe(
      map(messages => {
        const lastRead = lastReadBy?.[uid];
        if (!lastRead) return messages.filter(m => m.senderUid !== uid && m.senderUid !== 'system').length;

        const lastReadMs = typeof lastRead?.toMillis === 'function' ? lastRead.toMillis() : 0;
        return messages.filter(m => {
          if (m.senderUid === uid || m.senderUid === 'system') return false;
          const msgMs = typeof m.createdAt?.toMillis === 'function' ? m.createdAt.toMillis() : 0;
          return msgMs > lastReadMs;
        }).length;
      })
    );
  }
}
