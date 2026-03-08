#!/usr/bin/env bash
# Deploy all Cloud Functions from Google Cloud Shell.
# From Cloud Shell run:
#   rm -rf temp-deploy && git clone https://github.com/ammaressajee/ranked-webapp.git temp-deploy && ./temp-deploy/deploy-functions.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/ranked-web/functions"

PROJECT=ranked-app-9f746
REGION=us-central1
RUNTIME=python310
MEMORY=256Mi

gcloud functions deploy leave_queue --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=leave_queue --trigger-http --allow-unauthenticated --memory="$MEMORY"
gcloud functions deploy decline_match --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=decline_match --trigger-http --allow-unauthenticated --memory="$MEMORY"
gcloud functions deploy accept_match --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=accept_match --trigger-http --allow-unauthenticated --memory="$MEMORY"
gcloud functions deploy sweep_pending_matches --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=sweep_pending_matches --trigger-http --allow-unauthenticated
gcloud functions deploy find_match --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=find_match --trigger-http --allow-unauthenticated --memory="$MEMORY"
gcloud functions deploy queue_count --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=queue_count --trigger-http --allow-unauthenticated --memory="$MEMORY"

gcloud functions deploy cancel_match --gen2 --project="$PROJECT" --runtime="$RUNTIME" --region="$REGION" --entry-point=cancel_match --trigger-http --allow-unauthenticated --memory="$MEMORY"

echo "All functions deployed."

# Set up Cloud Scheduler to sweep stale matches every hour
SWEEP_URL="https://${REGION}-${PROJECT}.cloudfunctions.net/sweep_pending_matches"

if gcloud scheduler jobs describe sweep-pending-matches --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  echo "Cloud Scheduler job already exists; updating..."
  gcloud scheduler jobs update http sweep-pending-matches \
    --project="$PROJECT" \
    --location="$REGION" \
    --schedule="0 * * * *" \
    --uri="$SWEEP_URL" \
    --http-method=POST \
    --description="Sweep stale pending matches every hour"
else
  echo "Creating Cloud Scheduler job..."
  gcloud scheduler jobs create http sweep-pending-matches \
    --project="$PROJECT" \
    --location="$REGION" \
    --schedule="0 * * * *" \
    --uri="$SWEEP_URL" \
    --http-method=POST \
    --description="Sweep stale pending matches every hour"
fi

echo "Done deploying all functions and scheduler."

# RUN THIS IN CLOUD SHELL TO DEPLOY - rm -rf temp-deploy && git clone https://github.com/ammaressajee/ranked-webapp.git temp-deploy && chmod +x temp-deploy/deploy-functions.sh && ./temp-deploy/deploy-functions.sh