import functions_framework
from google.cloud import firestore
from datetime import datetime, timezone, timedelta

db = firestore.Client()

PROVISIONAL_THRESHOLD = 5
AUTO_FINALIZE_MINUTES = 3  # <-- Testing: 3 minutes

def expected_score(r_a, r_b):
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))

def compute_new_ratings(r_a, r_b, winner_uid, a_uid, b_uid, k_a, k_b):
    a_win = 1 if winner_uid == a_uid else 0
    b_win = 1 if winner_uid == b_uid else 0
    e_a = expected_score(r_a, r_b)
    e_b = 1 - e_a
    new_a = round(r_a + k_a * (a_win - e_a))
    new_b = round(r_b + k_b * (b_win - e_b))
    return new_a, new_b

def pick_k(matches_played, provisional):
    return 40 if provisional or matches_played < PROVISIONAL_THRESHOLD else 20


@functions_framework.cloud_event
def finalize_league_match(cloud_event):
    """Auto-finalizes Firestore matches after 3 min or both confirmations."""
    data = cloud_event.data
    resource = data["value"]["name"]
    fields = data["value"]["fields"]
    match_id = resource.split("/")[-1]

    status = fields.get("status", {}).get("stringValue")
    if status != "reported":
        print(f"⏩ {match_id} — Skipping, status={status}")
        return

    player_a = fields.get("playerA", {}).get("stringValue")
    player_b = fields.get("playerB", {}).get("stringValue")
    league_id = fields.get("leagueId", {}).get("stringValue")

    if not player_a or not player_b:
        print(f"⚠️ {match_id} — Missing players, marking complete.")
        db.document(resource).update({
            "status": "completed",
            "completedAt": firestore.SERVER_TIMESTAMP
        })
        return

    # Check confirmations
    confirmations = fields.get("confirmations", {}).get("mapValue", {}).get("fields", {})
    confirmed_a = confirmations.get(player_a, {}).get("booleanValue", False)
    confirmed_b = confirmations.get(player_b, {}).get("booleanValue", False)
    both_confirmed = confirmed_a and confirmed_b

    # Parse reportedAt properly (handle both timestampValue and mapValue)
    result_map = fields.get("result", {}).get("mapValue", {}).get("fields", {})
    reported_raw = result_map.get("reportedAt", {})

    reported_at = None
    if "timestampValue" in reported_raw:
        reported_at = datetime.fromisoformat(reported_raw["timestampValue"].replace("Z", "+00:00"))
    elif "stringValue" in reported_raw:
        reported_at = datetime.fromisoformat(reported_raw["stringValue"].replace("Z", "+00:00"))
    else:
        print(f"⚠️ {match_id} — reportedAt missing or not set yet.")
        return

    elapsed = datetime.now(timezone.utc) - reported_at
    print(f"🕒 {match_id} — elapsed={elapsed.total_seconds()/60:.1f} min, confirmed={both_confirmed}")

    if not both_confirmed and elapsed < timedelta(minutes=AUTO_FINALIZE_MINUTES):
        print(f"⏳ {match_id} — Waiting, not finalized yet (< {AUTO_FINALIZE_MINUTES} min)")
        return

    # Proceed to finalize
    print(f"✅ Finalizing match {match_id} — elapsed={elapsed}, confirmed={both_confirmed}")
    a_ref = db.document(f"leagueParticipants/{league_id}_{player_a}")
    b_ref = db.document(f"leagueParticipants/{league_id}_{player_b}")
    match_ref = db.document(resource)

    transaction = db.transaction()

    @firestore.transactional
    def transaction_update(tx):
        a_snap = a_ref.get(transaction=tx)
        b_snap = b_ref.get(transaction=tx)
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

        a_wins = a_data.get("wins", 0) + (1 if winner_uid == player_a else 0)
        a_losses = a_data.get("losses", 0) + (1 if winner_uid == player_b else 0)
        b_wins = b_data.get("wins", 0) + (1 if winner_uid == player_b else 0)
        b_losses = b_data.get("losses", 0) + (1 if winner_uid == player_a else 0)

        a_update = {
            "currentRank": new_a,
            "matchesPlayed": mp_a + 1,
            "wins": a_wins,
            "losses": a_losses,
            "lastActiveAt": firestore.SERVER_TIMESTAMP,
        }
        b_update = {
            "currentRank": new_b,
            "matchesPlayed": mp_b + 1,
            "wins": b_wins,
            "losses": b_losses,
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
        })

    transaction_update(transaction)
    transaction.commit()
