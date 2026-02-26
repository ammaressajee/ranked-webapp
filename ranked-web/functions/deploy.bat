@echo off
setlocal

echo Deploying Cloud Functions for project: ranked-app-9f746 in region: us-central1

echo --------------------------------------------------------
echo Deploying finalize_league_match (Firestore Trigger)...
gcloud functions deploy finalize_league_match ^
    --runtime=python310 ^
    --region=us-central1 ^
    --entry-point=finalize_league_match ^
    --trigger-event=providers/cloud.firestore/eventTypes/document.write ^
    --trigger-resource="projects/ranked-app-9f746/databases/(default)/documents/leagueMatches/{matchId}" ^
    --memory=256Mi
if errorlevel 1 exit /b 1

echo --------------------------------------------------------
echo Deploying find_match (HTTP Trigger)...
gcloud functions deploy find_match ^
    --gen2 ^
    --runtime=python310 ^
    --region=us-central1 ^
    --entry-point=find_match ^
    --trigger-http ^
    --allow-unauthenticated ^
    --memory=256Mi
if errorlevel 1 exit /b 1

echo --------------------------------------------------------
echo Deploying sweep_pending_matches (HTTP Trigger)...
gcloud functions deploy sweep_pending_matches ^
    --gen2 ^
    --runtime=python310 ^
    --region=us-central1 ^
    --entry-point=sweep_pending_matches ^
    --trigger-http ^
    --allow-unauthenticated
if errorlevel 1 exit /b 1

echo --------------------------------------------------------
echo Deploying accept_match (HTTP Trigger)...
gcloud functions deploy accept_match ^
    --gen2 ^
    --runtime=python310 ^
    --region=us-central1 ^
    --entry-point=accept_match ^
    --trigger-http ^
    --allow-unauthenticated ^
    --memory=256Mi
if errorlevel 1 exit /b 1

echo --------------------------------------------------------
echo Deploying decline_match (HTTP Trigger)...
gcloud functions deploy decline_match ^
    --gen2 ^
    --runtime=python310 ^
    --region=us-central1 ^
    --entry-point=decline_match ^
    --trigger-http ^
    --allow-unauthenticated ^
    --memory=256Mi
if errorlevel 1 exit /b 1

echo --------------------------------------------------------
echo All functions deployed successfully!
echo --------------------------------------------------------
