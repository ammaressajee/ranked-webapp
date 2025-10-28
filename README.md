# Ranked - Matchmaking App

High-level plan (iterative, profit-first)

Phase 0 — Project & infra setup: repo, Angular app, Firebase project, CI/CD deploy to Firebase Hosting, basic landing page. Metrics & analytics wired. (Goal: ability to deploy public MVP landing in <48 hours.)

Phase 1 — Core auth + profile + public ladder page: Google sign-in, player profile, join ladder UI, simple leaderboard (Firestore). (Goal: get first 10 users in a city.)

Phase 2 — Challenge + score reporting + ranking: challenge flow, score submission, basic Elo/point algorithm, email notifications. (Goal: 50+ matches recorded.)

Phase 3 — Viral features & retention: shareable rank cards, referrals, push notifications (PWA), weekly digest. (Goal: 300 MAU and retention metrics.)

Phase 4 — Monetization tests: club/league onboarding, premium features trial, paid club subscriptions. (Goal: first $/mo revenue.)

Scale & native app wrap: if traction, wrap into Capacitor or build native apps.

############################################

1. High-level MVP goals

Let players sign up / sign in (done).

Create player profiles.

Let players add matches (w/ opponents, score, date, location).

Compute rankings and show leaderboards.

Minimal social features: player search, profiles, stats.

Monetize later (ads, premium features, event fees, Stripe).

2. Iterative roadmap (sprints — each ~1–2 weeks)

Sprint 0 — infra & basics (complete)

Firebase Auth + Hosting ✅

App skeleton, routing, topbar/sidebar, login page ✅

Sprint 1 — Core user/profile & DB

Create players records on signup.

Simple profile page (display name, photo, location, bio).

Settings: edit profile.
Acceptance: newly signed-up user sees their profile page and can update photo/name.

Sprint 2 — Matches (create/read)

UI: “Record Match” form (opponent, scores, court, date/time, match type).

DB: save match, link to players.

Simple validation: scores must sum to winner etc.
Acceptance: user records a match, it appears in their match history and opponent's history.

Sprint 3 — Rankings & Leaderboard

Implement ranking algorithm (start simple: Elo or Win% with minimum matches).

Leaderboard page (global / by city / by skill bracket).
Acceptance: leaderboard updates after match creation.

Sprint 4 — Social / discovery

Player search, follow/bookmark players.

Filters (location radius).
Acceptance: find players near you and view profile.

Sprint 5 — Growth & monetization

Add Stripe for paid features (e.g., advanced stats, promoted profiles).

Analytics, error logging, performance monitoring.
Acceptance: purchase flow works in test mode.

3. Database choice & rationale

You’re on Firebase — use Firestore (serverless document DB):

Flexible schema, real-time updates, offline persistence.

Scales for your MVP.
Use Firestore structured collections + subcollections for clarity.

4. Suggested Firestore schema (collections & example docs)

Note: use server timestamps (FieldValue.serverTimestamp()) and keep IDs stable.

players/{playerId}

Document (one per user)

{
  "uid": "authUserUid",
  "displayName": "Ammar Essajee",
  "photoURL": "https://.../avatar.jpg",
  "email": "hidden_or_indexed_if_public",
  "city": "Austin",
  "location": { "lat": 30.2672, "lng": -97.7431 }, // optional for geo queries
  "rating": 1200,            // numeric rating for ranking (ELO or custom)
  "wins": 10,
  "losses": 5,
  "matchesCount": 15,
  "bio": "Weekend pickleballer",
  "createdAt": "...",
  "lastActive": "..."
}

matches/{matchId}

A top-level collection for simple queries & leaderboard recalculation

{
  "playerA": "playerIdA",
  "playerB": "playerIdB",
  "scoreA": 11,
  "scoreB": 9,
  "winner": "playerIdA",
  "date": "...",
  "location": { "lat": ..., "lng": ... }, // optional
  "court": "Central Park Court 3",
  "matchType": "Singles", // or "Doubles"
  "confirmedBy": ["playerIdA", "playerIdB"], // for validation
  "createdBy": "playerIdA",
  "createdAt": "..."
}

leaderboards/{scope} (optional cached results)

Store precomputed leaderboards for quick UI.

{
  "scope": "global",
  "updatedAt": "...",
  "top": [
    { "playerId": "p1", "rating": 1620 },
    ...
  ]
}

notifications/{id} or users/{playerId}/notifications/{id}

For invites, confirmations, follow events.

profiles vs players

You can keep player profile data under players. If you need separation, store auth-only data under users/{uid} and gameplay profile under players/{playerId}.

5. Security rules (Firestore) — high level

Users can read public player profiles.

Users can write their own player document only.

Match creation: allow writes if authenticated; match should be validated server-side (Cloud Function) or via security rules checks.

Only allow editing of rating, wins, losses by a trusted admin or server (Cloud Function) — never by client.

Example snippet (conceptual):

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{playerId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
      allow update: if request.auth != null && request.auth.uid == resource.data.uid;
      // prevent client from setting rating/wins directly by checking !('rating' in request.resource.data)
    }
    match /matches/{matchId} {
      allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid;
      allow read: if true;
    }
  }
}


Important: Complex validation (e.g., rating correctness) must be done in Cloud Functions to avoid client manipulation.

6. Ranking approach (start simple)

Two options:

Elo (recommended for head-to-head): good for 1v1, well-known. Use initial rating 1200.

When saving a match, run a Cloud Function to compute new ratings for both players and update players documents and leaderboards.

Win-rate + matches threshold: simpler but less robust.

Elo quick formula:

Expected score for A: EA = 1 / (1 + 10^((RB - RA)/400))

New rating: RA' = RA + K * (SA - EA), where SA is 1 for win, 0 for loss; K can be 20 or 32.

Implement rating updates server-side (Cloud Function) upon match creation & confirmation.

7. Architecture pieces you should implement now

Create player profile on signup

Hook into auth onCreate (Cloud Function) or create in client after first login.

Minimal fields: uid, displayName, photoURL, createdAt, rating:1200.

Record Match flow

UI form with validation.

Client writes a provisional matches doc with confirmedBy: [creatorId].

Notify opponent (notification or share link) to confirm result.

Once both confirm, call Cloud Function onMatchConfirmed to:

Validate scores.

Compute new ratings.

Update players wins/losses/matchesCount/rating.

Update cached leaderboards doc.

Leaderboard service

Client reads leaderboards/global (precomputed), or compute on the fly for MVP if small dataset.

Profile & match history UI

Show player stats, last 10 matches (query matches where player is playerA or playerB).

8. Angular implementation checklist (components & services)

Services:

AuthService (already). Add createPlayerProfileIfMissing().

PlayerService — fetch / update player, search players.

MatchService — create, confirm, list matches.

LeaderboardService — fetch cached leaderboards.

Components:

ProfilePageComponent

RecordMatchComponent (modal)

MatchListComponent

LeaderboardComponent

PlayerSearchComponent

Routing:

/profile/:id, /matches, /leaderboard, /record

State:

Use Signals/Services for shared state. Keep local UI optimistic updates, but rely on server for final values.

9. Cloud Functions (server-side)

onAuthCreate → Create players/{uid} doc with initial rating.

confirmMatch (callable or triggered by matches/{id} update) → Validate match & run rating logic.

recalculateLeaderboard → update leaderboards/global.

Optional: scheduled function to recompute leaderboards daily.

10. UX & product tips (keep it simple)

Default flows: record, confirm, update — avoid friction. Confirmation by both players prevents spam.

Minimal required fields at first: opponent (search by username), score, date. Later add court, match type.

Allow manual override by admin for disputes.

Mobile-first design for recording scores quickly.

Make search and discovery local-first (city filter) — users want nearby partners.

11. Monetization ideas (later)

Paid tiers: advanced stats, boosted profile, event creation.

Tournament entry fees (Stripe).

Ads or partnership with local courts.

12. Testing & acceptance criteria (per sprint)

Unit tests for services (Angular).

E2E tests: sign up -> create profile -> record match -> confirm -> rating changes.

Manual QA: try intentional bad data to ensure security rules prevent client-side tampering.

13. First practical steps you can implement today (concrete)

Create player doc on signup

In AuthService after successful login:

const uid = user.uid;
const playerRef = doc(firestore, `players/${uid}`);
const snapshot = await getDoc(playerRef);
if (!snapshot.exists()) {
  await setDoc(playerRef, {
    uid,
    displayName: user.displayName || 'New Player',
    photoURL: user.photoURL || '',
    city: '',
    rating: 1200,
    wins: 0, losses: 0, matchesCount: 0,
    createdAt: serverTimestamp()
  });
}


Acceptance: new users have a players/{uid} doc.

Make a simple Record Match form

Fields: opponentUID (select by search), scoreA, scoreB, date.

On submit: write matches/{autoId} with createdBy, confirmedBy: [creatorUid].

Acceptance: match doc created and visible in creator’s match history.

Add listener for matches in a profile page

Query matches where playerA == uid || playerB == uid, order by date desc.

Acceptance: recorded match appears in both players’ histories (after confirmed).

Plan Cloud Function for rating

Sketch it now, implement after you have matches flowing.

14. Security checklist (must-do before public launch)

Lock write permissions so clients cannot arbitrarily set ratings or wins.

Use Cloud Functions for sensitive updates (ratings, leaderboards).

Validate inputs (score values, player IDs).

Rate-limit or CAP match creation to reduce spam.

Set up Firebase App Check to reduce abusive requests.

15. Scaling / future-proofing

Use leaderboards cached docs for quick reads.

Keep matches as top-level collection for queryability; add composite indexes as needed (date, players).

When adding doubles or team sports, extend matches shape to players: [ids...], scores: [..., ...], and adjust ranking algorithm.
