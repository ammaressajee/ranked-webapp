import { inject, Injectable } from '@angular/core';
import {
  addDoc, collection, collectionData, doc, Firestore,
  orderBy, query, serverTimestamp, updateDoc
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { map, Observable, of } from 'rxjs';
import { MatchMessage } from '../models/MatchMessage';
import { LeagueMatch } from '../models/LeagueMatch';

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

    try {
      await addDoc(this.messagesColl(matchId), {
        matchId,
        senderUid: uid,
        text: text.trim(),
        createdAt: serverTimestamp(),
        type: 'text'
      });
    } catch (err) {
      console.error(`[ChatService] addDoc to matchMessages/${matchId}/messages failed (uid=${uid}):`, err);
      throw err;
    }

    try {
      const matchRef = doc(this.fs, 'leagueMatches', matchId);
      await updateDoc(matchRef, {
        lastActivityAt: serverTimestamp(),
        lastMessageText: text.trim().slice(0, 100),
        lastMessageSenderUid: uid
      });
    } catch (err) {
      console.error(`[ChatService] updateDoc on leagueMatches/${matchId} failed (uid=${uid}):`, err);
    }
  }

  async sendSystemMessage(matchId: string, text: string): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    await addDoc(this.messagesColl(matchId), {
      matchId,
      senderUid: uid,
      text,
      createdAt: serverTimestamp(),
      type: 'system'
    });

    const matchRef = doc(this.fs, 'leagueMatches', matchId);
    await updateDoc(matchRef, {
      lastActivityAt: serverTimestamp(),
      lastMessageText: text.slice(0, 100),
      lastMessageSenderUid: uid
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

  /**
   * Count how many of the given matches have unread messages for the user.
   * Uses denormalized lastActivityAt vs lastReadBy on the match doc itself,
   * so we don't need to query every message subcollection.
   */
  countUnreadMatches(matches: LeagueMatch[], uid: string): number {
    return matches.filter(m => {
      if (m.lastMessageSenderUid === uid || m.lastMessageSenderUid === 'system') return false;
      const lastRead = m.lastReadBy?.[uid];
      const lastReadMs = typeof lastRead?.toMillis === 'function' ? lastRead.toMillis() : 0;
      const lastActivityMs = typeof m.lastActivityAt?.toMillis === 'function' ? m.lastActivityAt.toMillis() : 0;
      return lastActivityMs > lastReadMs;
    }).length;
  }
}
