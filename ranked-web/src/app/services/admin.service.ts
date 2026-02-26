import { inject, Injectable } from '@angular/core';
import { doc, docData, Firestore } from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { map, Observable, of, switchMap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private fs = inject(Firestore);
  private auth = inject(Auth);

  isAdmin$: Observable<boolean> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user?.uid) return of(false);
      const ref = doc(this.fs, 'config', 'admins');
      return (docData(ref) as Observable<{ uids?: string[] } | null>).pipe(
        map((data) => !!data?.uids?.includes(user.uid))
      );
    })
  );
}
