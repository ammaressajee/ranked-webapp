# --- CONFIGURATION ---
PROJECT_ID="ranked-app-9f746"
REGION="us-central1"
RUNTIME="python310"
MEMORY="256MB"

# Exit immediately if a command exits with a non-zero status
set -e

echo "Deploying Cloud Functions for project: ${PROJECT_ID} in region: ${REGION}"

# 1. Deploy 'finalize_league_match' (Firestore Trigger)
echo "--------------------------------------------------------"
echo "Deploying finalize_league_match (Firestore Trigger)..."
gcloud functions deploy finalize_league_match \
    --runtime=python310 \
    --region=us-central1 \
    --entry-point=finalize_league_match \
    --trigger-event=providers/cloud.firestore/eventTypes/document.write \
    --trigger-resource="projects/ranked-app-9f746/databases/(default)/documents/leagueMatches/{matchId}" \
    --memory=256Mi

# 2. Deploy 'find_match' (HTTP Trigger for Matchmaking)
echo "--------------------------------------------------------"
echo "Deploying find_match (HTTP Trigger)..."
gcloud functions deploy find_match \
    --gen2 \
    --runtime=python310 \
    --region=us-central1 \
    --entry-point=find_match \
    --trigger-http \
    --allow-unauthenticated \
    --memory=256Mi


# 3. Deploy 'sweep_pending_matches' (HTTP Trigger for Cron Job Cleanup)
echo "--------------------------------------------------------"
echo "Deploying sweep_pending_matches (HTTP Trigger)..."
gcloud functions deploy sweep_pending_matches \
    --gen2 \
    --runtime=python310 \
    --region=us-central1 \
    --entry-point=sweep_pending_matches \
    --trigger-http \
    --allow-unauthenticated

# 4. Deploy 'accept_match' (HTTP Trigger)
echo "--------------------------------------------------------"
echo "Deploying accept_match (HTTP Trigger)..."
gcloud functions deploy accept_match \
    --gen2 \
    --runtime=python310 \
    --region=us-central1 \
    --entry-point=accept_match \
    --trigger-http \
    --allow-unauthenticated \
    --memory=256Mi

# 5. Deploy 'decline_match' (HTTP Trigger)
echo "--------------------------------------------------------"
echo "Deploying decline_match (HTTP Trigger)..."
gcloud functions deploy decline_match \
    --gen2 \
    --runtime=python310 \
    --region=us-central1 \
    --entry-point=decline_match \
    --trigger-http \
    --allow-unauthenticated \
    --memory=256Mi

echo "--------------------------------------------------------"
echo "✅ All functions deployed successfully!"
echo "--------------------------------------------------------"