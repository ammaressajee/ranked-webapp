# Ranked App — Revamp Plan

## Vision

**Addictive local sports league app** (1v1 MVP: Pickleball). Users join a league, find matches at their own pace (Rocket League style), record results with opponent attestation, and climb a local ELO leaderboard.

---

## Core User Flow

1. **Join League** → User signs up, browses leagues, joins one (e.g. Austin Pickleball League)
2. **Find Match** → User clicks "Find Match" → System pairs with another seeker (or queues)
3. **Accept Match** *(to implement)* → Opponent must accept; if unresponsive, match is cancelled and user can search again
4. **Coordinate** → Users message each other (placeholder: "Message opponent" link) to set time/place
5. **Play** → They play the match
6. **Report Score** → One player reports winner + score
7. **Attest** → Other player confirms the result
8. **ELO Update** → Cloud Function recalculates ratings, leaderboard updates

---

## Unresponsive Opponent Handling

| Scenario | Behavior |
|----------|----------|
| B doesn't accept within X min | `sweep_pending_matches` cancels match; A's search request cleared so they can search again |
| B accepts but never plays | Match stays "pending"; could add "Forfeit" or "Cancel" button after Y days |
| B doesn't attest reported score | After timeout, Cloud Function auto-finalizes (current: 3 min for testing) |

---

## Implemented vs Planned

### ✅ Done
- Run instructions (RUN.md)
- Firestore rules for leagues, participants, matches, searchRequests
- Firestore indexes for queries
- League service: listUserMatches merges playerA + playerB
- My-matches: Report vs Confirm logic fixed (reported = awaiting attestation)
- CORS: localhost:4200 + production URLs

### 🔲 To Do
- **Accept flow**: Match status `pending_acceptance` → B must Accept → `pending`
- **Sweep**: Cancel `pending_acceptance` matches; clear seeker so they can re-queue
- **Messaging placeholder**: "Message opponent" (link to email or future in-app chat)
- **UI revamp**: Modern, sleek, engaging design
- **Player profile**: Stats from leagueParticipants, wins/losses, recent matches
- **League-specific leaderboard**: Use leagueParticipants.currentRank
- **Global leaderboard**: Aggregate or primary league

---

## Data Model Summary

| Collection | Purpose |
|------------|---------|
| `users` | Auth profile, displayName, photoURL |
| `leagues` | League metadata (name, location) |
| `leagueParticipants` | Per-league: userId, currentRank, wins, losses, matchesPlayed |
| `leagueMatches` | Match: playerA, playerB, status, result, confirmations |
| `searchRequests` | Matchmaking queue (seeking: true/false) |

---

## Tech Stack

- **Frontend**: Angular 20, Angular Material, Firebase Auth + Firestore
- **Backend**: Python Cloud Functions (gcloud deploy)
- **Hosting**: Firebase Hosting
