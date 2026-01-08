from datetime import datetime, timezone
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required. Set it to your Postgres connection string.")


def get_conn():
    conn = psycopg.connect(DATABASE_URL)
    conn.row_factory = dict_row
    return conn


def create_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS versions (
            version_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS mechanics (
            mechanic_id TEXT PRIMARY KEY,
            version_id TEXT,
            FOREIGN KEY (version_id) REFERENCES versions(version_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS stakeholders (
            stakeholder_id TEXT PRIMARY KEY,
            name TEXT,
            role TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT,
            version_id TEXT,
            start_time TEXT,
            end_time TEXT,
            created_at TEXT NOT NULL,
            payload TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (version_id) REFERENCES versions(version_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS explicit_decisions (
            decision_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            node_id TEXT,
            option_id TEXT,
            option_text TEXT,
            stakeholder TEXT,
            day INTEGER,
            time_slot TEXT,
            consequences TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS expected_actions (
            expected_action_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            source_node_id TEXT,
            source_option_id TEXT,
            action_type TEXT,
            target_ref TEXT,
            constraints TEXT,
            rule_id TEXT,
            created_at BIGINT,
            mechanic_id TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS canonical_actions (
            canonical_action_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            mechanic_id TEXT,
            action_type TEXT,
            target_ref TEXT,
            value_final TEXT,
            committed_at BIGINT,
            context TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS mechanic_events (
            event_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            mechanic_id TEXT,
            event_type TEXT,
            timestamp BIGINT,
            payload TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comparisons (
            comparison_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            expected_action_id TEXT,
            canonical_action_id TEXT,
            outcome TEXT,
            deviation TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
            FOREIGN KEY (expected_action_id) REFERENCES expected_actions(expected_action_id),
            FOREIGN KEY (canonical_action_id) REFERENCES canonical_actions(canonical_action_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS process_logs (
            process_log_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            node_id TEXT,
            start_time DOUBLE PRECISION,
            end_time DOUBLE PRECISION,
            total_duration DOUBLE PRECISION,
            final_choice TEXT,
            events TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS player_actions_log (
            player_action_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            event TEXT,
            metadata TEXT,
            day INTEGER,
            time_slot TEXT,
            timestamp DOUBLE PRECISION,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS session_state (
            session_id TEXT PRIMARY KEY,
            stakeholders TEXT,
            global_state TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS session_stakeholders (
            session_id TEXT NOT NULL,
            stakeholder_id TEXT NOT NULL,
            state TEXT,
            PRIMARY KEY (session_id, stakeholder_id),
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
            FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(stakeholder_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            report_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            payload TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_exp_decisions_session ON explicit_decisions(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_expected_session ON expected_actions(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_canonical_session ON canonical_actions(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_session ON mechanic_events(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comparisons_session ON comparisons(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_process_session ON process_logs(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_player_session ON player_actions_log(session_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_session_stakeholders_session ON session_stakeholders(session_id)")
    conn.commit()


def init_db():
    with get_conn() as conn:
        create_schema(conn)


def _get_allowed_origins():
    raw = os.getenv("ALLOWED_ORIGINS")
    if not raw:
        return ["*"]
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="Simulator Backend", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


def _json_dump(value):
    return json.dumps(value, ensure_ascii=False) if value is not None else None


def normalize_session(conn, session_id: str, session: dict, created_at: str):
    metadata = session.get("session_metadata", {})
    version_id = metadata.get("simulator_version_id")
    user_id = metadata.get("user_id")
    start_time = metadata.get("start_time")
    end_time = metadata.get("end_time")
    payload = json.dumps(session, ensure_ascii=False)

    explicit_decisions = session.get("explicit_decisions", [])
    expected_actions = session.get("expected_actions", [])
    canonical_actions = session.get("canonical_actions", [])
    mechanic_events = session.get("mechanic_events", [])
    comparisons = session.get("comparisons", [])
    process_log = session.get("process_log", [])
    player_actions_log = session.get("player_actions_log", [])
    final_state = session.get("final_state", {})
    stakeholders_state = final_state.get("stakeholders") if isinstance(final_state, dict) else None

    mechanic_ids = set()
    for item in canonical_actions:
        if item.get("mechanic_id"):
            mechanic_ids.add(item.get("mechanic_id"))
    for item in mechanic_events:
        if item.get("mechanic_id"):
            mechanic_ids.add(item.get("mechanic_id"))

    if user_id:
        conn.execute(
            "INSERT INTO users (user_id, name) VALUES (%s, %s) ON CONFLICT (user_id) DO NOTHING",
            (user_id, user_id),
        )

    if version_id:
        conn.execute(
            "INSERT INTO versions (version_id, created_at) VALUES (%s, %s) ON CONFLICT (version_id) DO NOTHING",
            (version_id, created_at),
        )

    for mechanic_id in mechanic_ids:
        conn.execute(
            "INSERT INTO mechanics (mechanic_id, version_id) VALUES (%s, %s) ON CONFLICT (mechanic_id) DO NOTHING",
            (mechanic_id, version_id),
        )

    conn.execute(
        """
        INSERT INTO sessions (session_id, user_id, version_id, start_time, end_time, created_at, payload)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (session_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            version_id = EXCLUDED.version_id,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            created_at = EXCLUDED.created_at,
            payload = EXCLUDED.payload
        """,
        (session_id, user_id, version_id, start_time, end_time, created_at, payload),
    )

    conn.execute("DELETE FROM explicit_decisions WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM expected_actions WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM canonical_actions WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM mechanic_events WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM comparisons WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM process_logs WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM player_actions_log WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM session_state WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM session_stakeholders WHERE session_id = %s", (session_id,))

    for decision in explicit_decisions:
        conn.execute(
            """
            INSERT INTO explicit_decisions (session_id, node_id, option_id, option_text, stakeholder, day, time_slot, consequences)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                decision.get("nodeId"),
                decision.get("choiceId"),
                decision.get("choiceText"),
                decision.get("stakeholder"),
                decision.get("day"),
                decision.get("timeSlot"),
                _json_dump(decision.get("consequences")),
            ),
        )

    for action in expected_actions:
        source = action.get("source", {})
        conn.execute(
            """
            INSERT INTO expected_actions (expected_action_id, session_id, source_node_id, source_option_id, action_type, target_ref, constraints, rule_id, created_at, mechanic_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (expected_action_id) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                source_node_id = EXCLUDED.source_node_id,
                source_option_id = EXCLUDED.source_option_id,
                action_type = EXCLUDED.action_type,
                target_ref = EXCLUDED.target_ref,
                constraints = EXCLUDED.constraints,
                rule_id = EXCLUDED.rule_id,
                created_at = EXCLUDED.created_at,
                mechanic_id = EXCLUDED.mechanic_id
            """,
            (
                action.get("expected_action_id"),
                session_id,
                source.get("node_id"),
                source.get("option_id"),
                action.get("action_type"),
                action.get("target_ref"),
                _json_dump(action.get("constraints")),
                action.get("rule_id"),
                action.get("created_at"),
                action.get("mechanic_id"),
            ),
        )

    for action in canonical_actions:
        conn.execute(
            """
            INSERT INTO canonical_actions (canonical_action_id, session_id, mechanic_id, action_type, target_ref, value_final, committed_at, context)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (canonical_action_id) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                mechanic_id = EXCLUDED.mechanic_id,
                action_type = EXCLUDED.action_type,
                target_ref = EXCLUDED.target_ref,
                value_final = EXCLUDED.value_final,
                committed_at = EXCLUDED.committed_at,
                context = EXCLUDED.context
            """,
            (
                action.get("canonical_action_id"),
                session_id,
                action.get("mechanic_id"),
                action.get("action_type"),
                action.get("target_ref"),
                _json_dump(action.get("value_final")),
                action.get("committed_at"),
                _json_dump(action.get("context")),
            ),
        )

    for event in mechanic_events:
        conn.execute(
            """
            INSERT INTO mechanic_events (event_id, session_id, mechanic_id, event_type, timestamp, payload)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (event_id) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                mechanic_id = EXCLUDED.mechanic_id,
                event_type = EXCLUDED.event_type,
                timestamp = EXCLUDED.timestamp,
                payload = EXCLUDED.payload
            """,
            (
                event.get("event_id"),
                session_id,
                event.get("mechanic_id"),
                event.get("event_type"),
                event.get("timestamp"),
                _json_dump(event.get("payload")),
            ),
        )

    for comparison in comparisons:
        conn.execute(
            """
            INSERT INTO comparisons (session_id, expected_action_id, canonical_action_id, outcome, deviation)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                session_id,
                comparison.get("expected_action_id"),
                comparison.get("canonical_action_id"),
                comparison.get("outcome"),
                _json_dump(comparison.get("deviation")),
            ),
        )

    for log in process_log:
        conn.execute(
            """
            INSERT INTO process_logs (session_id, node_id, start_time, end_time, total_duration, final_choice, events)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                log.get("nodeId"),
                log.get("startTime"),
                log.get("endTime"),
                log.get("totalDuration"),
                log.get("finalChoice"),
                _json_dump(log.get("events")),
            ),
        )

    for log in player_actions_log:
        conn.execute(
            """
            INSERT INTO player_actions_log (session_id, event, metadata, day, time_slot, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                log.get("event"),
                _json_dump(log.get("metadata")),
                log.get("day"),
                log.get("timeSlot"),
                log.get("timestamp"),
            ),
        )

    if final_state:
        conn.execute(
            """
            INSERT INTO session_state (session_id, stakeholders, global_state)
            VALUES (%s, %s, %s)
            ON CONFLICT (session_id) DO UPDATE SET
                stakeholders = EXCLUDED.stakeholders,
                global_state = EXCLUDED.global_state
            """,
            (
                session_id,
                _json_dump(final_state.get("stakeholders")),
                _json_dump(final_state.get("global")),
            ),
        )
    if isinstance(stakeholders_state, list):
        for stakeholder in stakeholders_state:
            stakeholder_id = stakeholder.get("id") or stakeholder.get("shortId") or stakeholder.get("name")
            if not stakeholder_id:
                continue
            conn.execute(
                "INSERT INTO stakeholders (stakeholder_id, name, role) VALUES (%s, %s, %s) ON CONFLICT (stakeholder_id) DO NOTHING",
                (
                    stakeholder_id,
                    stakeholder.get("name"),
                    stakeholder.get("role"),
                ),
            )
            conn.execute(
                """
                INSERT INTO session_stakeholders (session_id, stakeholder_id, state)
                VALUES (%s, %s, %s)
                ON CONFLICT (session_id, stakeholder_id) DO UPDATE SET
                    state = EXCLUDED.state
                """,
                (
                    session_id,
                    stakeholder_id,
                    _json_dump(stakeholder),
                ),
            )

    return {
        "explicit_decisions": len(explicit_decisions),
        "expected_actions": len(expected_actions),
        "canonical_actions": len(canonical_actions),
        "mechanic_events": len(mechanic_events),
        "comparisons": len(comparisons),
        "process_log": len(process_log),
        "player_actions_log": len(player_actions_log),
    }


@app.post("/sessions")
def create_session(session: dict = Body(...)):
    metadata = session.get("session_metadata", {})
    session_id = metadata.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_metadata.session_id missing")

    created_at = datetime.now(timezone.utc).isoformat()

    with get_conn() as conn:
        conn.execute("BEGIN")
        counts = normalize_session(conn, session_id, session, created_at)
        conn.commit()

    return {"ok": True, "session_id": session_id, "counts": counts}


@app.post("/sessions/{session_id}/normalize")
def normalize_existing_session(session_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT payload, created_at FROM sessions WHERE session_id = %s",
            (session_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")

        session = json.loads(row["payload"])
        conn.execute("BEGIN")
        counts = normalize_session(conn, session_id, session, row["created_at"])
        conn.commit()

    return {"ok": True, "session_id": session_id, "counts": counts}


@app.post("/sessions/normalize")
def normalize_all_sessions():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT session_id, payload, created_at FROM sessions"
        ).fetchall()
        results = []
        conn.execute("BEGIN")
        for row in rows:
            session = json.loads(row["payload"])
            counts = normalize_session(conn, row["session_id"], session, row["created_at"])
            results.append({"session_id": row["session_id"], "counts": counts})
        conn.commit()

    return {"ok": True, "processed": len(results), "results": results}


@app.get("/sessions")
def list_sessions(limit: int = 100):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT session_id, user_id, version_id, start_time, end_time, created_at FROM sessions ORDER BY created_at DESC LIMIT %s",
            (limit,),
        ).fetchall()

    return [dict(row) for row in rows]


@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT payload FROM sessions WHERE session_id = %s",
            (session_id,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="session not found")

    return json.loads(row["payload"])


@app.get("/sessions/{session_id}/normalized")
def get_session_normalized(session_id: str):
    with get_conn() as conn:
        session_row = conn.execute(
            "SELECT session_id, user_id, version_id, start_time, end_time, created_at FROM sessions WHERE session_id = %s",
            (session_id,),
        ).fetchone()
        if not session_row:
            raise HTTPException(status_code=404, detail="session not found")

        data = {"session": dict(session_row)}
        data["explicit_decisions"] = [dict(r) for r in conn.execute("SELECT * FROM explicit_decisions WHERE session_id = %s", (session_id,)).fetchall()]
        data["expected_actions"] = [dict(r) for r in conn.execute("SELECT * FROM expected_actions WHERE session_id = %s", (session_id,)).fetchall()]
        data["canonical_actions"] = [dict(r) for r in conn.execute("SELECT * FROM canonical_actions WHERE session_id = %s", (session_id,)).fetchall()]
        data["mechanic_events"] = [dict(r) for r in conn.execute("SELECT * FROM mechanic_events WHERE session_id = %s", (session_id,)).fetchall()]
        data["comparisons"] = [dict(r) for r in conn.execute("SELECT * FROM comparisons WHERE session_id = %s", (session_id,)).fetchall()]
        data["process_logs"] = [dict(r) for r in conn.execute("SELECT * FROM process_logs WHERE session_id = %s", (session_id,)).fetchall()]
        data["player_actions_log"] = [dict(r) for r in conn.execute("SELECT * FROM player_actions_log WHERE session_id = %s", (session_id,)).fetchall()]
        data["session_stakeholders"] = [dict(r) for r in conn.execute("SELECT * FROM session_stakeholders WHERE session_id = %s", (session_id,)).fetchall()]
        state_row = conn.execute("SELECT * FROM session_state WHERE session_id = %s", (session_id,)).fetchone()
        data["session_state"] = dict(state_row) if state_row else None

    return data


@app.get("/sessions/latest")
def get_latest_session():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT session_id, user_id, version_id, start_time, end_time, created_at FROM sessions ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")

    return dict(row)


@app.get("/sessions/latest/normalized")
def get_latest_session_normalized():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT session_id FROM sessions ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")
    return get_session_normalized(row["session_id"])
