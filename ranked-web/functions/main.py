import functions_framework
from google.cloud import firestore
from datetime import datetime, timezone, timedelta
import uuid
import firebase_admin
from firebase_admin import auth as fb_auth
from flask import jsonify, Request, make_response

# Initialize Firebase Admin only once
if not firebase_admin._apps:
    firebase_admin.initialize_app()

# Initialize Firestore client
db = firestore.Client()

# ----- CONFIG -----
PROVISIONAL_THRESHOLD = 5
AUTO_FINALIZE_MINUTES = 3        # for testing
MATCH_NO_SHOW_MINUTES = 10       # sweep pending matches timeout
# Define multiple allowed origins here. You can pass this as a comma-separated
# environment variable if you prefer, but defining it as a list is cleaner.
# Example includes localhost and a production URL:
CORS_ALLOWED_ORIGINS = [
    "http://localhost:4200",
    "http://localhost:500",
    "http://localhost:5000",
    "http://localhost:5001",
    "http://localhost:5002",
    "http://127.0.0.1:4200",
    "http://127.0.0.1:500",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5001",
    "https://ranked-app-9f746.web.app",
    "https://ranked-app-9f746.firebaseapp.com"
]
# ------------------

# ----- HELPER FUNCTIONS -----

def get_allowed_origin(request: Request) -> str | None:
    """Checks if the request's Origin header is in the allowed list."""
    origin = request.headers.get("Origin")
    if origin in CORS_ALLOWED_ORIGINS:
        return origin
    return None

def expected_score(r_a, r_b):
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))

def compute_new_ratings(r_a, r_b, winner_uid, a_uid, b_uid, k_a, k_b):
    # a_win is 1 if A is the winner, 0 if A is the loser
    a_win = 1 if winner_uid == a_uid else 0
    e_a = expected_score(r_a, r_b)
    k_a_prime = k_a * (a_win - e_a)
    k_b_prime = -k_a * (a_win - e_a) 
    
    new_a = round(r_a + k_a_prime)
    new_b = round(r_b + k_b_prime)
    
    return new_a, new_b

def pick_k(matches_played, provisional):
    return 40 if provisional or matches_played < PROVISIONAL_THRESHOLD else 20

def _verify_id_token_from_request(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise ValueError("Missing Bearer token")
    id_token = auth_header.split(" ", 1)[1]
    decoded = fb_auth.verify_id_token(id_token)
    return decoded

# ----- FINALIZE MATCH TRIGGER -----
@functions_framework.cloud_event
def finalize_league_match(cloud_event):
    """
    Triggered on leagueMatches/{matchId} update.
    Auto-finalizes reported matches after both confirmations or timeout.
    """
    try:
        data = cloud_event.data
        # Firestore event data is nested under 'value'
        match_document_fields = data.get("value", {}).get("fields", {})
        resource = data.get("value", {}).get("name")
        if not resource:
             print("⚠️ Missing resource name in event data.")
             return

        match_id = resource.split("/")[-1]

        # Use helper function to safely get Firestore field values
        def get_field_value(field, key_type="stringValue"):
            return match_document_fields.get(field, {}).get(key_type)

        status = get_field_value("status")
        if status != "reported":
            print(f"⏩ {match_id} — status={status}, skipping")
            return

        player_a = get_field_value("playerA")
        player_b = get_field_value("playerB")
        league_id = get_field_value("leagueId")

        if not player_a or not player_b:
            print(f"⚠️ {match_id} — missing players, marking completed")
            db.document(resource).update({"status": "completed", "completedAt": firestore.SERVER_TIMESTAMP})
            return

        confirmations = match_document_fields.get("confirmations", {}).get("mapValue", {}).get("fields", {})
        confirmed_a = confirmations.get(player_a, {}).get("booleanValue", False)
        confirmed_b = confirmations.get(player_b, {}).get("booleanValue", False)
        both_confirmed = confirmed_a and confirmed_b

        result_map = match_document_fields.get("result", {}).get("mapValue", {}).get("fields", {})
        
        # CORRECTED: Safely extract reportedAt timestamp from the Firestore event data structure
        reported_raw = result_map.get("reportedAt", {})
        reported_timestamp_str = reported_raw.get("timestampValue")
        
        if not reported_timestamp_str:
            print(f"⚠️ {match_id} — reportedAt missing; aborting")
            return

        # Convert the ISO 8601 string to a datetime object in UTC
        reported_at = datetime.fromisoformat(reported_timestamp_str.replace("Z", "+00:00"))
        
        elapsed = datetime.now(timezone.utc) - reported_at
        print(f"🕒 {match_id} — elapsed={elapsed.total_seconds()/60:.2f} min, confirmed={both_confirmed}")

        if not both_confirmed and elapsed < timedelta(minutes=AUTO_FINALIZE_MINUTES):
            print(f"⏳ {match_id} — waiting (not yet auto-finalize)")
            return

        # FINALIZE participants
        a_ref = db.document(f"leagueParticipants/{league_id}_{player_a}")
        b_ref = db.document(f"leagueParticipants/{league_id}_{player_b}")
        match_ref = db.document(resource)

        # Simplified Transaction: The decorator manages the transaction for us
        @firestore.transactional
        def transaction_update(tx):
            a_snap = a_ref.get(transaction=tx)
            b_snap = b_ref.get(transaction=tx)
            
            # Defensive check: if participant records are missing, just complete the match
            if not a_snap.exists or not b_snap.exists:
                tx.update(match_ref, {"status": "completed", "completedAt": firestore.SERVER_TIMESTAMP})
                return

            a_data = a_snap.to_dict()
            b_data = b_snap.to_dict()

            r_a = a_data.get("currentRank", 1000)
            r_b = b_data.get("currentRank", 1000)
            provisional_a = a_data.get("provisional", True)
            provisional_b = b_data.get("provisional", True)
            mp_a = a_data.get("matchesPlayed", 0)
            mp_b = b_data.get("matchesPlayed", 0)
            k_a = pick_k(mp_a, provisional_a)
            k_b = pick_k(mp_b, provisional_b)

            winner_uid = result_map.get("winner", {}).get("stringValue")
            new_a, new_b = compute_new_ratings(r_a, r_b, winner_uid, player_a, player_b, k_a, k_b)

            a_update = {
                "currentRank": new_a,
                "matchesPlayed": mp_a + 1,
                "wins": a_data.get("wins", 0) + (1 if winner_uid == player_a else 0),
                "losses": a_data.get("losses", 0) + (1 if winner_uid == player_b else 0),
                "lastActiveAt": firestore.SERVER_TIMESTAMP,
            }
            b_update = {
                "currentRank": new_b,
                "matchesPlayed": mp_b + 1,
                "wins": b_data.get("wins", 0) + (1 if winner_uid == player_b else 0),
                "losses": b_data.get("losses", 0) + (1 if winner_uid == player_a else 0),
                "lastActiveAt": firestore.SERVER_TIMESTAMP,
            }

            if provisional_a and a_update["matchesPlayed"] >= PROVISIONAL_THRESHOLD:
                a_update["provisional"] = False
            if provisional_b and b_update["matchesPlayed"] >= PROVISIONAL_THRESHOLD:
                b_update["provisional"] = False

            tx.update(a_ref, a_update)
            tx.update(b_ref, b_update)
            tx.update(match_ref, {
                "status": "completed",
                "completedAt": firestore.SERVER_TIMESTAMP,
                "finalizedBy": "system",
                "playerA_rank_before": r_a, # Good for auditing
                "playerB_rank_before": r_b,
                "playerA_rank_after": new_a,
                "playerB_rank_after": new_b,
            })

        transaction_update(db.transaction())
        print(f"✅ {match_id} finalized.")

    except Exception as e:
        print(f"ERROR in finalize_league_match: {e}")


# ----- FIND MATCH HTTP -----
@functions_framework.http
def find_match(request: Request):
    """HTTP POST endpoint to find a match (with Firebase Bearer token)"""

    # Get the allowed origin based on the request header
    allowed_origin = get_allowed_origin(request)
    
    # Define response headers for non-OPTIONS and non-preflight requests
    response_headers = {}
    if allowed_origin:
        response_headers['Access-Control-Allow-Origin'] = allowed_origin
        # Include credentials support for Firebase token
        response_headers['Access-Control-Allow-Credentials'] = 'true'


    # --- Handle CORS preflight ---
    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if allowed_origin:
            resp.headers.set('Access-Control-Allow-Origin', allowed_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600') # Cache preflight for 1 hour
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    # Check if the origin is allowed before proceeding with the main logic
    if not allowed_origin:
        return jsonify({"error": "Forbidden Origin"}), 403, {'Content-Type': 'application/json'}


    try:
        decoded = _verify_id_token_from_request(request)
    except Exception as e:
        resp = jsonify({"error": "Unauthorized", "detail": str(e)})
        return resp, 401, response_headers

    try:
        payload = request.get_json(silent=True)
        if payload is None:
            raise ValueError("Invalid JSON or empty body")
    except Exception:
        resp = jsonify({"error": "Invalid JSON"})
        return resp, 400, response_headers

    league_id = payload.get("leagueId")
    user_id = payload.get("userId")
    rank = int(payload.get("rank", 1000))
    location = payload.get("location", "") or ""

    if not league_id or not user_id:
        resp = jsonify({"error": "leagueId and userId required"})
        return resp, 400, response_headers
    if decoded.get("uid") != user_id:
        resp = jsonify({"error": "token uid mismatch"})
        return resp, 403, response_headers

    # --- Record search request ---
    sr_id = f"{league_id}_{user_id}"
    sr_ref = db.collection("searchRequests").document(sr_id)
    sr_ref.set({
        "leagueId": league_id,
        "userId": user_id,
        "rank": rank,
        "location": location,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "seeking": True
    }, merge=True)

    # --- Find candidate ---
    # Query for others seeking a match in the same league
    candidates = list(db.collection("searchRequests")
                      .where("leagueId", "==", league_id)
                      .where("seeking", "==", True).stream())
    others = []
    for cdoc in candidates:
        if cdoc.id == sr_id: # Skip self
            continue
        data = cdoc.to_dict()
        diff = abs(rank - int(data.get("rank", 1000)))
        created_at = data.get("createdAt") or datetime.now(timezone.utc)
        others.append((cdoc, data, diff, created_at))

    if not others:
        resp = jsonify({"matchId": None, "status": "queued"})
        return resp, 200, response_headers

    # --- Pick best candidate (lowest rank diff, then oldest creation time) ---
    others.sort(key=lambda t: (t[2], t[3]))
    cand_doc, cand_data, _, _ = others[0]
    opponent_id = cand_data.get("userId")

    # Generate a unique, deterministic match ID
    ids_sorted = sorted([user_id, opponent_id])
    match_id = f"{league_id}_on_demand_{ids_sorted[0]}_{ids_sorted[1]}_{uuid.uuid4().hex[:6]}"
    match_ref = db.collection("leagueMatches").document(match_id)

    # Simplified Transaction
    @firestore.transactional
    def txn_create_match(tx):
        cand_snap = cand_doc.reference.get(transaction=tx)
        self_snap = sr_ref.get(transaction=tx)
        
        # Check current state again to ensure no one was matched in the milliseconds before the transaction
        if not cand_snap.exists or not self_snap.exists:
            raise RuntimeError("search request missing")
        cand_state = cand_snap.to_dict()
        self_state = self_snap.to_dict()
        if not cand_state.get("seeking") or not self_state.get("seeking"):
            # This is the "already matched" case
            raise RuntimeError("already matched")
            
        # Create match with pending_acceptance - playerB (opponent) must accept
        tx.set(match_ref, {
            "leagueId": league_id,
            "round": 0,
            "playerA": user_id,
            "playerB": opponent_id,
            "status": "pending_acceptance",
            "type": "ondemand",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "scheduledAt": firestore.SERVER_TIMESTAMP
        })
        tx.update(cand_doc.reference, {"seeking": False})
        tx.update(sr_ref, {"seeking": False})

    try:
        txn_create_match(db.transaction())
    except Exception as e:
        # If transaction fails (e.g., "already matched"), return queued status
        resp = jsonify({"matchId": None, "status": "queued", "reason": str(e)})
        return resp, 200, response_headers

    resp = jsonify({"matchId": match_id, "status": "matched", "opponentUid": opponent_id})
    return resp, 200, response_headers


# ----- ACCEPT MATCH HTTP -----
@functions_framework.http
def accept_match(request: Request):
    """HTTP POST: Opponent (playerB) accepts a pending_acceptance match."""

    allowed_origin = get_allowed_origin(request)
    response_headers = {}
    if allowed_origin:
        response_headers['Access-Control-Allow-Origin'] = allowed_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if allowed_origin:
            resp.headers.set('Access-Control-Allow-Origin', allowed_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not allowed_origin:
        return jsonify({"error": "Forbidden Origin"}), 403, {'Content-Type': 'application/json'}

    try:
        decoded = _verify_id_token_from_request(request)
    except Exception as e:
        return jsonify({"error": "Unauthorized", "detail": str(e)}), 401, response_headers

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON"}), 400, response_headers

    match_id = payload.get("matchId")
    user_id = decoded.get("uid")
    if not match_id or not user_id:
        return jsonify({"error": "matchId required"}), 400, response_headers

    match_ref = db.collection("leagueMatches").document(match_id)
    match_snap = match_ref.get()
    if not match_snap.exists:
        return jsonify({"error": "Match not found"}), 404, response_headers

    data = match_snap.to_dict()
    if data.get("status") != "pending_acceptance":
        return jsonify({"error": "Match is not awaiting acceptance"}), 400, response_headers

    if data.get("playerB") != user_id:
        return jsonify({"error": "Only the invited player can accept"}), 403, response_headers

    match_ref.update({
        "status": "pending",
        "acceptedAt": firestore.SERVER_TIMESTAMP,
        "acceptedBy": user_id
    })

    return jsonify({"status": "accepted", "matchId": match_id}), 200, response_headers


# ----- DECLINE MATCH HTTP -----
@functions_framework.http
def decline_match(request: Request):
    """HTTP POST: Opponent (playerB) declines a pending_acceptance match."""

    allowed_origin = get_allowed_origin(request)
    response_headers = {}
    if allowed_origin:
        response_headers['Access-Control-Allow-Origin'] = allowed_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if allowed_origin:
            resp.headers.set('Access-Control-Allow-Origin', allowed_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not allowed_origin:
        return jsonify({"error": "Forbidden Origin"}), 403, {'Content-Type': 'application/json'}

    try:
        decoded = _verify_id_token_from_request(request)
    except Exception as e:
        return jsonify({"error": "Unauthorized", "detail": str(e)}), 401, response_headers

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON"}), 400, response_headers

    match_id = payload.get("matchId")
    user_id = decoded.get("uid")
    if not match_id or not user_id:
        return jsonify({"error": "matchId required"}), 400, response_headers

    match_ref = db.collection("leagueMatches").document(match_id)
    match_snap = match_ref.get()
    if not match_snap.exists:
        return jsonify({"error": "Match not found"}), 404, response_headers

    data = match_snap.to_dict()
    if data.get("status") != "pending_acceptance":
        return jsonify({"error": "Match is not awaiting acceptance"}), 400, response_headers

    if data.get("playerB") != user_id:
        return jsonify({"error": "Only the invited player can decline"}), 403, response_headers

    # Re-enable seeking for playerA so they can search again
    league_id = data.get("leagueId")
    player_a = data.get("playerA")
    sr_ref = db.collection("searchRequests").document(f"{league_id}_{player_a}")
    match_ref.update({
        "status": "cancelled",
        "cancelledAt": firestore.SERVER_TIMESTAMP,
        "cancelReason": "declined",
        "declinedBy": user_id
    })
    sr_ref.set({"seeking": True}, merge=True)

    return jsonify({"status": "declined", "matchId": match_id}), 200, response_headers


# ----- SWEEP PENDING MATCHES -----
@functions_framework.http
def sweep_pending_matches(request: Request):
    """Cancel pending matches older than MATCH_NO_SHOW_MINUTES (with CORS)."""

    # Get the allowed origin based on the request header
    allowed_origin = get_allowed_origin(request)
    
    # Define response headers for non-OPTIONS and non-preflight requests
    response_headers = {}
    if allowed_origin:
        response_headers['Access-Control-Allow-Origin'] = allowed_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'


    # --- Handle CORS preflight ---
    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if allowed_origin:
            resp.headers.set('Access-Control-Allow-Origin', allowed_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp
    
    # Check if the origin is allowed before proceeding with the main logic
    if not allowed_origin:
        return jsonify({"error": "Forbidden Origin"}), 403, {'Content-Type': 'application/json'}


    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=MATCH_NO_SHOW_MINUTES)
        canceled = []

        # Cancel stale pending matches (never played)
        for status_val in ["pending", "pending_acceptance"]:
            q = db.collection("leagueMatches").where("status", "==", status_val).where("createdAt", "<=", cutoff)
            for doc_snap in q.stream():
                try:
                    data = doc_snap.to_dict()
                    doc_snap.reference.update({
                        "status": "cancelled",
                        "cancelledAt": firestore.SERVER_TIMESTAMP,
                        "cancelReason": "no_show_sweep"
                    })
                    canceled.append(doc_snap.id)
                    # Re-enable seeking for playerA so they can search again
                    league_id = data.get("leagueId")
                    player_a = data.get("playerA")
                    if league_id and player_a:
                        sr_ref = db.collection("searchRequests").document(f"{league_id}_{player_a}")
                        sr_ref.set({"seeking": True}, merge=True)
                except Exception as e:
                    print(f"failed cancel {doc_snap.id}: {e}")

        resp = jsonify({"cancelled": canceled, "count": len(canceled), "cutoff": cutoff.isoformat()})
        return resp, 200, response_headers

    except Exception as e:
        resp = jsonify({"error": str(e)})
        return resp, 500, response_headers