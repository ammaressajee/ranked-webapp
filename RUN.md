# How to Run Ranked Web App

Quick reference for running the Angular + Firebase app locally and deploying.

---

## Prerequisites

- **Node.js** 18+ and npm
- **Firebase CLI**: `npm install -g firebase-tools`
- **Google Cloud SDK** (for Python Cloud Functions): [Install gcloud](https://cloud.google.com/sdk/docs/install)
- **Python 3.10** (for Cloud Functions)

---

## 1. Run the Angular App Locally

```bash
cd ranked-web
npm install
npm start
# or: ng serve
```

Open **http://localhost:4200**

- Uses `environment.development.ts` (full Firebase config)
- Connects to live Firebase project `ranked-app-9f746`

---

## 2. Firebase Login & Project

```bash
firebase login
firebase use ranked-app-9f746   # or your project ID
```

---

## 3. Deploy to Firebase Hosting

```bash
cd ranked-web
npm run build:dev          # development build
# or: ng build             # production build

firebase deploy --only hosting
```

Or use the npm script:

```bash
npm run deploy:dev
```

---

## 4. Cloud Functions (Python)

### Run locally (port 5000)

For local testing without deploying:

```powershell
cd ranked-web/functions
# First-time setup (requires Python 3.10+):
powershell -ExecutionPolicy Bypass -File setup.ps1

# Run functions locally:
.\venv\Scripts\Activate.ps1
python run_local.py
```

Functions will be at `http://127.0.0.1:5000`. The Angular app (dev build) uses this URL automatically.

**Firestore access:** `run_local.py` connects to your live Firestore. Ensure you've run `gcloud auth application-default login` so the Firebase Admin SDK can authenticate.

### Deploy to production

The app uses **Google Cloud Functions** (Python). Deploy via:

**Windows (CMD):**
```cmd
cd ranked-web\functions
deploy.bat
```

**Mac/Linux or Git Bash:**
```bash
cd ranked-web/functions
bash deploy.sh
```

**Prerequisites:** [Install gcloud](https://cloud.google.com/sdk/docs/install), then:
```bash
gcloud auth login
gcloud config set project ranked-app-9f746
```

Functions:

| Function | Trigger | Purpose |
|----------|---------|---------|
| `finalize_league_match` | Firestore `leagueMatches` write | ELO update when both players confirm |
| `find_match` | HTTP POST | Matchmaking (find opponent in queue) |
| `accept_match` | HTTP POST | Opponent accepts match request |
| `decline_match` | HTTP POST | Opponent declines match request |
| `sweep_pending_matches` | HTTP POST | Cancel stale pending matches |

---

## 5. Firestore Emulators (Optional)

```bash
firebase emulators:start --only auth,firestore
```

Note: Cloud Functions are Python. For local testing, use `run_local.py` (see section 4) instead of Firebase emulators.

---

## 6. Common Issues

| Issue | Fix |
|-------|-----|
| CORS errors calling Cloud Functions | Origins `localhost:4200`, `localhost:5000`, `127.0.0.1:5000` are already allowed. Add others to `CORS_ALLOWED_ORIGINS` in `functions/main.py` |
| "Not authenticated" | Sign in with Google or email first |
| Firestore permission denied | Update `firestore.rules` and deploy: `firebase deploy --only firestore:rules` |
| Blank leaderboard | Ensure `users` collection has docs with `rank`, `displayName` |
| Admin panel not visible | Create `config/admins` in Firestore with `{ uids: ["YOUR_UID"] }` |

---

## Admin Bootstrap

To enable the admin panel and league creation:

1. Sign in to the app and copy your Firebase Auth UID (e.g. from browser dev tools or Firebase Console).
2. In Firestore Console, create document `config/admins` (collection: `config`, document ID: `admins`).
3. Set the document fields: `uids` (array) containing your UID string.
4. Deploy Firestore rules: `firebase deploy --only firestore:rules`

---

## Project Structure

```
ranked-web/
├── src/app/           # Angular app
│   ├── components/    # UI components
│   ├── pages/         # Route pages
│   ├── services/      # Auth, League
│   └── models/        # TypeScript interfaces
├── functions/         # Python Cloud Functions
│   ├── main.py        # All function logic
│   └── deploy.sh      # gcloud deploy script
├── firestore.rules    # Security rules
└── firebase.json      # Firebase config
```
