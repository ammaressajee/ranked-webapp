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
AUTO_FINALIZE_MINUTES = 48 * 60  # 48 hours: if opponent doesn't confirm, reported score stands
MATCH_NO_SHOW_MINUTES = 10       # sweep pending matches timeout

# Skill-based matchmaking: max rank difference allowed, by time in queue (seconds).
# (seconds_waited, max_rank_diff). Searcher only matches with opponents within max_rank_diff.
# After the last band, no cap (any opponent allowed).
MATCHMAKING_RANK_BANDS = [
    (0, 150),      # 0–1 min: max 150 rank diff
    (60, 250),     # 1–2 min: max 250
    (120, 400),    # 2–5 min: max 400
    (300, 9999),   # 5+ min: allow up to 9999 (effectively any)
]
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


def get_cors_origin_for_response(request: Request, for_options_preflight: bool = False) -> str | None:
    """Origin to use in Access-Control-Allow-Origin. For OPTIONS preflight, use fallbacks so preflight succeeds."""
    origin = get_allowed_origin(request)
    if origin:
        return origin
    if for_options_preflight:
        # Some environments strip Origin on preflight; echo back if present, else use production default
        return request.headers.get("Origin") or "https://ranked-app-9f746.web.app"
    return None


def _queue_start_from_sr_data(created_at_raw) -> datetime:
    """Parse createdAt from a search request doc into timezone-aware datetime."""
    if created_at_raw is None:
        return datetime.now(timezone.utc)
    if isinstance(created_at_raw, datetime):
        return created_at_raw if created_at_raw.tzinfo else created_at_raw.replace(tzinfo=timezone.utc)
    if hasattr(created_at_raw, "timestamp") and callable(getattr(created_at_raw, "timestamp")):
        return datetime.fromtimestamp(created_at_raw.timestamp(), tz=timezone.utc)
    return datetime.now(timezone.utc)


def _try_match_league_after_decline(league_id: str, excluded_uid_1: str, excluded_uid_2: str) -> None:
    """
    After a decline, try to create one new match in this league.
    Uses oldest seeker as 'searcher' (same rank-band logic as find_match).
    Never re-pairs the two who just declined (excluded_uid_1 with excluded_uid_2).
    """
    seekers = list(db.collection("searchRequests")
                   .where("leagueId", "==", league_id)
                   .where("seeking", "==", True).stream())
    if len(seekers) < 2:
        return
    # Build (doc_ref, data, rank, created_at) and sort by created_at (oldest first)
    parsed = []
    for cdoc in seekers:
        data = cdoc.to_dict()
        rank = int(data.get("rank", 1000))
        created_at = data.get("createdAt") or datetime.now(timezone.utc)
        if isinstance(created_at, datetime):
            ct = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        elif hasattr(created_at, "timestamp") and callable(getattr(created_at, "timestamp")):
            ct = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
        else:
            ct = datetime.now(timezone.utc)
        parsed.append((cdoc.reference, cdoc, data, rank, ct))
    parsed.sort(key=lambda t: t[4])
    searcher_ref, searcher_doc, searcher_data, searcher_rank, searcher_created = parsed[0]
    searcher_id = searcher_data.get("userId")
    exclude_candidate_uid = None
    if searcher_id == excluded_uid_1:
        exclude_candidate_uid = excluded_uid_2
    elif searcher_id == excluded_uid_2:
        exclude_candidate_uid = excluded_uid_1
    # Candidates: everyone else except the declined partner
    others = []
    for ref, cdoc, data, rank, ct in parsed[1:]:
        uid = data.get("userId")
        if uid == exclude_candidate_uid:
            continue
        diff = abs(searcher_rank - rank)
        others.append((cdoc, data, diff, ct))
    if not others:
        return
    # Apply searcher's rank band
    queue_start = _queue_start_from_sr_data(searcher_data.get("createdAt"))
    now_utc = datetime.now(timezone.utc)
    wait_seconds = max(0, (now_utc - queue_start).total_seconds())
    max_allowed_rank_diff = 0
    for band_after_seconds, band_max_diff in MATCHMAKING_RANK_BANDS:
        if wait_seconds >= band_after_seconds:
            max_allowed_rank_diff = band_max_diff
    others = [t for t in others if t[2] <= max_allowed_rank_diff]
    if not others:
        return
    others.sort(key=lambda t: (t[2], t[3]))
    cand_doc, cand_data, _, _ = others[0]
    opponent_id = cand_data.get("userId")
    ids_sorted = sorted([searcher_id, opponent_id])
    match_id = f"{league_id}_on_demand_{ids_sorted[0]}_{ids_sorted[1]}_{uuid.uuid4().hex[:6]}"
    match_ref = db.collection("leagueMatches").document(match_id)
    sr_ref = db.collection("searchRequests").document(f"{league_id}_{searcher_id}")

    @firestore.transactional
    def txn(tx):
        cand_snap = cand_doc.reference.get(transaction=tx)
        self_snap = sr_ref.get(transaction=tx)
        if not cand_snap.exists or not self_snap.exists:
            raise RuntimeError("search request missing")
        cand_state = cand_snap.to_dict()
        self_state = self_snap.to_dict()
        if not cand_state.get("seeking") or not self_state.get("seeking"):
            raise RuntimeError("already matched")
        tx.set(match_ref, {
            "leagueId": league_id,
            "round": 0,
            "playerA": searcher_id,
            "playerB": opponent_id,
            "status": "pending_acceptance",
            "type": "ondemand",
            "acceptances": {},
            "createdAt": firestore.SERVER_TIMESTAMP,
            "scheduledAt": firestore.SERVER_TIMESTAMP
        })
        tx.update(cand_doc.reference, {"seeking": False})
        tx.update(sr_ref, {"seeking": False})

    try:
        txn(db.transaction())
    except Exception:
        pass

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

    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers


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
    try:
        rank_raw = payload.get("rank", 1000)
        rank = int(rank_raw) if rank_raw is not None else 1000
    except (TypeError, ValueError):
        rank = 1000
    rank = max(100, min(3000, rank))
    location = (payload.get("location") or "")[:200] if isinstance(payload.get("location"), str) else ""

    if not league_id or not user_id:
        resp = jsonify({"error": "leagueId and userId required"})
        return resp, 400, response_headers
    if not isinstance(league_id, str) or not isinstance(user_id, str):
        resp = jsonify({"error": "leagueId and userId must be strings"})
        return resp, 400, response_headers
    if decoded.get("uid") != user_id:
        resp = jsonify({"error": "token uid mismatch"})
        return resp, 403, response_headers

    # --- Record search request (preserve createdAt if already in queue) ---
    sr_id = f"{league_id}_{user_id}"
    sr_ref = db.collection("searchRequests").document(sr_id)
    existing = sr_ref.get()
    existing_data = existing.to_dict() if existing.exists else {}
    is_already_seeking = existing_data.get("seeking") is True
    update_data = {
        "leagueId": league_id,
        "userId": user_id,
        "rank": rank,
        "location": location,
        "seeking": True
    }
    if not is_already_seeking:
        update_data["createdAt"] = firestore.SERVER_TIMESTAMP
    sr_ref.set(update_data, merge=True)

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

    # --- Expanding rank window: filter by searcher's time in queue ---
    searcher_snap = sr_ref.get()
    searcher_data = searcher_snap.to_dict() if searcher_snap.exists else {}
    created_at_raw = searcher_data.get("createdAt")
    if created_at_raw is None:
        queue_start = datetime.now(timezone.utc)
    elif isinstance(created_at_raw, datetime):
        queue_start = created_at_raw if created_at_raw.tzinfo else created_at_raw.replace(tzinfo=timezone.utc)
    elif hasattr(created_at_raw, "timestamp") and callable(getattr(created_at_raw, "timestamp")):
        queue_start = datetime.fromtimestamp(created_at_raw.timestamp(), tz=timezone.utc)
    else:
        queue_start = datetime.now(timezone.utc)
    now_utc = datetime.now(timezone.utc)
    wait_seconds = max(0, (now_utc - queue_start).total_seconds())
    max_allowed_rank_diff = 0
    for band_after_seconds, band_max_diff in MATCHMAKING_RANK_BANDS:
        if wait_seconds >= band_after_seconds:
            max_allowed_rank_diff = band_max_diff
    others = [t for t in others if t[2] <= max_allowed_rank_diff]

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
            
        # Create match with pending_acceptance - both players must accept before it becomes "pending"
        tx.set(match_ref, {
            "leagueId": league_id,
            "round": 0,
            "playerA": user_id,
            "playerB": opponent_id,
            "status": "pending_acceptance",
            "type": "ondemand",
            "acceptances": {},
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
    """HTTP POST: Either player accepts a pending_acceptance match. When both have accepted, status becomes pending."""

    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers

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
    if not isinstance(match_id, str) or len(match_id) > 256:
        return jsonify({"error": "Invalid matchId"}), 400, response_headers

    match_ref = db.collection("leagueMatches").document(match_id)
    match_snap = match_ref.get()
    if not match_snap.exists:
        return jsonify({"error": "Match not found"}), 404, response_headers

    data = match_snap.to_dict()
    if data.get("status") != "pending_acceptance":
        return jsonify({"error": "Match is not awaiting acceptance"}), 400, response_headers

    player_a = data.get("playerA")
    player_b = data.get("playerB")
    if user_id != player_a and user_id != player_b:
        return jsonify({"error": "Only a player in this match can accept"}), 403, response_headers

    acceptances = dict(data.get("acceptances") or {})
    if acceptances.get(user_id):
        return jsonify({"status": "already_accepted", "matchId": match_id}), 200, response_headers

    acceptances[user_id] = True
    match_ref.update({"acceptances": acceptances})

    if acceptances.get(player_a) and acceptances.get(player_b):
        match_ref.update({
            "status": "pending",
            "acceptedAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "accepted", "matchId": match_id, "ready": True}), 200, response_headers
    return jsonify({"status": "accepted", "matchId": match_id, "ready": False}), 200, response_headers


# ----- DECLINE MATCH HTTP -----
@functions_framework.http
def decline_match(request: Request):
    """HTTP POST: Either player can decline a pending_acceptance match; both are re-enabled to search again."""

    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers

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
    if not isinstance(match_id, str) or len(match_id) > 256:
        return jsonify({"error": "Invalid matchId"}), 400, response_headers

    match_ref = db.collection("leagueMatches").document(match_id)
    match_snap = match_ref.get()
    if not match_snap.exists:
        return jsonify({"error": "Match not found"}), 404, response_headers

    data = match_snap.to_dict()
    if data.get("status") != "pending_acceptance":
        return jsonify({"error": "Match is not awaiting acceptance"}), 400, response_headers

    player_a = data.get("playerA")
    player_b = data.get("playerB")
    if user_id != player_a and user_id != player_b:
        return jsonify({"error": "Only a player in this match can decline"}), 403, response_headers

    league_id = data.get("leagueId")
    match_ref.update({
        "status": "cancelled",
        "cancelledAt": firestore.SERVER_TIMESTAMP,
        "cancelReason": "declined",
        "declinedBy": user_id
    })
    for uid in (player_a, player_b):
        if uid:
            sr_ref = db.collection("searchRequests").document(f"{league_id}_{uid}")
            sr_ref.set({"seeking": True}, merge=True)

    # Re-run matchmaking so other seekers in the league can get paired (never re-pair the two who declined)
    if league_id and player_a and player_b:
        _try_match_league_after_decline(league_id, player_a, player_b)

    return jsonify({"status": "declined", "matchId": match_id}), 200, response_headers


# ----- LEAVE QUEUE HTTP -----
@functions_framework.http
def leave_queue(request: Request):
    """HTTP POST: User leaves the matchmaking queue (sets seeking to false)."""

    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers

    try:
        decoded = _verify_id_token_from_request(request)
    except Exception as e:
        return jsonify({"error": "Unauthorized", "detail": str(e)}), 401, response_headers

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON"}), 400, response_headers

    league_id = payload.get("leagueId")
    user_id = decoded.get("uid")
    if not league_id or not user_id:
        return jsonify({"error": "leagueId required"}), 400, response_headers
    if not isinstance(league_id, str) or len(league_id) > 256:
        return jsonify({"error": "Invalid leagueId"}), 400, response_headers

    sr_ref = db.collection("searchRequests").document(f"{league_id}_{user_id}")
    sr_ref.set({"seeking": False}, merge=True)

    return jsonify({"status": "left", "leagueId": league_id}), 200, response_headers


# ----- QUEUE COUNT HTTP -----
@functions_framework.http
def queue_count(request: Request):
    """HTTP GET: Return number of users currently seeking a match in a league. Requires auth."""
    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers

    try:
        _verify_id_token_from_request(request)
    except Exception as e:
        return jsonify({"error": "Unauthorized", "detail": str(e)}), 401, response_headers

    league_id = request.args.get("leagueId") or (request.get_json(silent=True) or {}).get("leagueId")
    if not league_id or not isinstance(league_id, str) or len(league_id) > 256:
        return jsonify({"error": "leagueId required"}), 400, response_headers

    seekers = list(db.collection("searchRequests")
                   .where("leagueId", "==", league_id)
                   .where("seeking", "==", True).stream())
    count = len(seekers)
    return jsonify({"count": count}), 200, response_headers


# ----- SWEEP PENDING MATCHES -----
@functions_framework.http
def sweep_pending_matches(request: Request):
    """Cancel pending matches older than MATCH_NO_SHOW_MINUTES (with CORS)."""

    is_preflight = request.method == "OPTIONS"
    cors_origin = get_cors_origin_for_response(request, for_options_preflight=is_preflight)
    response_headers = {}
    if cors_origin:
        response_headers['Access-Control-Allow-Origin'] = cors_origin
        response_headers['Access-Control-Allow-Credentials'] = 'true'

    if request.method == "OPTIONS":
        resp = make_response('', 204)
        if cors_origin:
            resp.headers.set('Access-Control-Allow-Origin', cors_origin)
            resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            resp.headers.set('Access-Control-Max-Age', '3600')
            resp.headers.set('Access-Control-Allow-Credentials', 'true')
        return resp

    if not get_allowed_origin(request):
        err_headers = {**response_headers, 'Content-Type': 'application/json'}
        if request.headers.get("Origin"):
            err_headers['Access-Control-Allow-Origin'] = request.headers.get("Origin")
            err_headers['Access-Control-Allow-Credentials'] = 'true'
        return jsonify({"error": "Forbidden Origin"}), 403, err_headers


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