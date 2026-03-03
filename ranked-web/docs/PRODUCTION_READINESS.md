# Production readiness checklist

This document reflects the production hardening applied to the codebase and what to verify before launch.

## Security

- **Firestore rules**
  - `searchRequests`: Client can only **read** (queue status). Writes are done only by Cloud Functions (matchmaking). Deploy rules: `firebase deploy --only firestore:rules`.
  - `leagueMatches`: Client can **read** and **update** (report/confirm). **Create** is disabled for clients; only Cloud Functions create matches.
  - `leagueParticipants`: **Update** and **delete** restricted to the owning user (`userId` match) or an admin.

- **Backend (Cloud Functions)**
  - All matchmaking endpoints require Firebase ID token (Bearer). CORS restricted to configured origins.
  - `find_match`: `leagueId`/`userId` required and type-checked; `rank` validated and clamped to 100–3000; `location` truncated to 200 chars.
  - `accept_match` / `decline_match`: `matchId` validated (string, max 256 chars); only the invited player (playerB) can accept/decline.

- **Frontend**
  - No secrets in repo; Firebase config and AdSense client ID are public by design. Auth is enforced via Firestore rules and backend token verification.
  - Admin route protected by `adminGuard` (reads `config/admins` from Firestore).

## Before launch

1. **Deploy Firestore rules**  
   From `ranked-web`: `firebase deploy --only firestore:rules`. Ensure your Firebase project is the correct one.

2. **Environment**  
   Production build uses `src/environments/environment.ts`. Confirm `functionsUrl`, `firebaseConfig`, and ad slot IDs (if using ads).

3. **CORS**  
   In `functions/main.py`, `CORS_ALLOWED_ORIGINS` must include your production domain(s) (e.g. `https://ranked-app-9f746.web.app`). Add any custom domain you use.

4. **Admins**  
   Ensure Firestore `config/admins` exists and contains the correct `uids` array for admin users (needed for admin route and league management).

5. **Indexes**  
   If you use composite queries, ensure the required Firestore indexes are created (check the Firebase console for index errors in logs).

## Scaling notes

- **Matchmaking**: Current implementation loads all seeking users for a league in memory. For very large leagues (hundreds of concurrent seekers), consider pagination or a dedicated queue service.
- **Firestore**: Listener-heavy pages (e.g. My Matches, league detail) use real-time listeners; subscription cleanup is done in `ngOnDestroy` where applicable.
- **Cloud Functions**: Stateless; scale with traffic. Consider setting `minInstances` or `maxInstances` in production if needed.
- **Geocoding**: Nominatim is rate-limited (1 req/s); geocode results are cached in memory in `GeocodingService`.

## Error handling

- Backend returns consistent JSON error shapes (`error`, optional `detail`). Frontend shows user-facing messages and logs details in the console for debugging.
- Firestore security rules deny invalid access; failed client writes surface as permission errors.

## Post-launch

- Monitor Firebase Usage (Firestore reads/writes, Auth, Functions invocations).
- Monitor AdSense for policy compliance and ad performance.
- Optionally add a global HTTP interceptor for 401 (e.g. redirect to login or refresh token).
