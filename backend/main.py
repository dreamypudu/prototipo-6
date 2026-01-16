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
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS tipo_usuario TEXT,
        ADD COLUMN IF NOT EXISTS edad_usuario INTEGER,
        ADD COLUMN IF NOT EXISTS carrera_usuario TEXT
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
        CREATE TABLE IF NOT EXISTS objectives (
            objetivo_id TEXT PRIMARY KEY,
            stakeholder_id TEXT NOT NULL,
            texto_objetivo TEXT,
            atributo_interno_min JSONB,
            atributo_global_min JSONB,
            acciones_requeridas JSONB,
            FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(stakeholder_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS questions (
            pregunta_id TEXT PRIMARY KEY,
            stakeholder_id TEXT NOT NULL,
            texto_pregunta TEXT,
            texto_respuesta TEXT,
            atributo_global_min JSONB,
            acciones_requeridas JSONB,
            FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(stakeholder_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS question_requirements (
            requisito_pregunta_id BIGSERIAL PRIMARY KEY,
            pregunta_id TEXT NOT NULL,
            trust_min INTEGER,
            support_min INTEGER,
            reputation_min INTEGER,
            FOREIGN KEY (pregunta_id) REFERENCES questions(pregunta_id) ON DELETE CASCADE
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
            estado TEXT,
            navegador TEXT,
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (version_id) REFERENCES versions(version_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scenarios (
            escenario_id TEXT PRIMARY KEY,
            version_id TEXT,
            stakeholder_id TEXT,
            etapa INTEGER,
            titulo TEXT,
            FOREIGN KEY (version_id) REFERENCES versions(version_id),
            FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(stakeholder_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS decision_nodes (
            nodo_id TEXT PRIMARY KEY,
            escenario_id TEXT,
            tipo_decision TEXT,
            texto TEXT,
            FOREIGN KEY (escenario_id) REFERENCES scenarios(escenario_id)
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
        CREATE TABLE IF NOT EXISTS bridge_responses (
            respuesta_puente_id BIGSERIAL PRIMARY KEY,
            decision_id BIGINT,
            respuesta_atributo_alto TEXT,
            respuesta_atributo_medio TEXT,
            respuesta_atributo_bajo TEXT,
            FOREIGN KEY (decision_id) REFERENCES explicit_decisions(decision_id) ON DELETE CASCADE
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
            rule_id TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
            FOREIGN KEY (expected_action_id) REFERENCES expected_actions(expected_action_id),
            FOREIGN KEY (canonical_action_id) REFERENCES canonical_actions(canonical_action_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_effects (
            effect_id BIGSERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            day INTEGER NOT NULL,
            comparisons TEXT,
            global_deltas TEXT,
            stakeholder_deltas TEXT,
            created_at TEXT NOT NULL,
            status TEXT,
            applied_at TEXT,
            UNIQUE (session_id, day),
            FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        ALTER TABLE daily_effects
        ADD COLUMN IF NOT EXISTS status TEXT,
        ADD COLUMN IF NOT EXISTS applied_at TEXT
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
    conn.execute("CREATE INDEX IF NOT EXISTS idx_questions_stakeholder ON questions(stakeholder_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_objectives_stakeholder ON objectives(stakeholder_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_decision_nodes_escenario ON decision_nodes(escenario_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scenarios_version ON scenarios(version_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_daily_effects_session_day ON daily_effects(session_id, day)")
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


def _json_load(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return value


# ---- Helpers for comparison rules ----
import unicodedata
from typing import Any

def _normalize_text(value) -> str:
    if value is None:
        return ""
    normalized = unicodedata.normalize("NFKD", str(value))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower().strip()


DAY_INDEX = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
    "lunes": 0, "martes": 1, "miercoles": 2, "miércoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "sábado": 5, "domingo": 6,
}


def _day_index_from_value(value):
    if value is None:
        return None
    if isinstance(value, int):
        return (value - 1) % 7 if value > 0 else None
    text = _normalize_text(value)
    if text.isdigit():
        num = int(text)
        return (num - 1) % 7 if num > 0 else None
    return DAY_INDEX.get(text)


def _parse_time_to_minutes(raw: str):
    text = _normalize_text(raw)
    if ":" not in text:
        if text.isdigit() and len(text) in (3, 4):
            hours = int(text[:-2]); minutes = int(text[-2:]); return hours * 60 + minutes
        return None
    parts = text.split(":", 1)
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def _parse_time_window(value):
    if value is None:
        return None
    text = _normalize_text(value)
    if text in ("am", "morning", "manana", "mañana"):
        return {"slot": "AM"}
    if text in ("pm", "tarde", "afternoon", "evening", "noche"):
        return {"slot": "PM"}
    if "-" in text:
        start_raw, end_raw = text.split("-", 1)
        start_min = _parse_time_to_minutes(start_raw)
        end_min = _parse_time_to_minutes(end_raw)
        if start_min is None or end_min is None:
            return None
        return {"start": start_min, "end": end_min}
    return None


def _normalize_slot(value):
    if value is None:
        return None
    text = _normalize_text(value)
    if text in ("am", "morning", "manana", "mañana"):
        return "AM"
    if text in ("pm", "tarde", "afternoon", "evening", "noche"):
        return "PM"
    return None


def _parse_datetime(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _extract_actual_time_info(actual: dict):
    vf = _json_load(actual.get("value_final")) or {}
    ctx = _json_load(actual.get("context")) or {}
    day_value = vf.get("day") or ctx.get("day")
    slot_value = vf.get("time_slot") or vf.get("slot") or ctx.get("time_slot")
    dt_value = vf.get("datetime") or vf.get("scheduled_at") or vf.get("arrived_at")
    parsed_dt = _parse_datetime(dt_value)

    weekday_index = _day_index_from_value(day_value)
    if weekday_index is None and parsed_dt:
        weekday_index = parsed_dt.weekday()

    minute_of_day = parsed_dt.hour * 60 + parsed_dt.minute if parsed_dt else None
    slot = _normalize_slot(slot_value)
    if slot is None and parsed_dt:
        slot = "AM" if parsed_dt.hour < 12 else "PM"

    return {"weekday_index": weekday_index, "slot": slot, "minute_of_day": minute_of_day}


# Rule handlers
def _default_rule(expected: dict, actual: dict):
    constraints = expected.get("constraints") or {}
    if not constraints:
        return {"outcome": "DONE_OK"}
    vf = _json_load(actual.get("value_final")) or {}
    ctx = _json_load(actual.get("context")) or {}
    merged = {**ctx, **vf}
    missing = {}
    for k, v in constraints.items():
        if merged.get(k) != v:
            missing[k] = v
    if not missing:
        return {"outcome": "DONE_OK"}
    return {"outcome": "DEVIATION", "deviation": {"missing": missing, "actual": merged}}


def _rule_time_and_day(expected: dict, actual: dict):
    constraints = expected.get("constraints") or {}
    exp_day = _day_index_from_value(constraints.get("day"))
    exp_window = _parse_time_window(constraints.get("time_window"))
    info = _extract_actual_time_info(actual)
    missing = {}
    if exp_day is not None and info.get("weekday_index") != exp_day:
        missing["day"] = constraints.get("day")
    if exp_window:
        if "slot" in exp_window:
            if info.get("slot") != exp_window["slot"]:
                missing["time_window"] = constraints.get("time_window")
        else:
            m = info.get("minute_of_day")
            if m is None or not (exp_window["start"] <= m <= exp_window["end"]):
                missing["time_window"] = constraints.get("time_window")
    if not missing:
        return {"outcome": "DONE_OK"}
    return {"outcome": "DEVIATION", "deviation": {"missing": missing, "actual": info}}


RULE_HANDLERS = {
    "default_rule": _default_rule,
    "meeting_time_rule_v1": _rule_time_and_day,
    "visit_stakeholder_rule_v1": _rule_time_and_day,
    "research_hours_rule_v1": _rule_time_and_day,
}

RULE_EFFECTS = {
    "meeting_time_rule_v1": {
        "DONE_OK": {"global": {"reputation": 1}},
        "DEVIATION": {"global": {"reputation": -1}},
        "NOT_DONE": {"global": {"reputation": -2}},
    },
    "visit_stakeholder_rule_v1": {
        "DONE_OK": {"stakeholder": {"trust": 2}},
        "DEVIATION": {"stakeholder": {"trust": -1}},
        "NOT_DONE": {"stakeholder": {"trust": -2}},
    },
    "research_hours_rule_v1": {
        "DONE_OK": {"global": {"reputation": 1}},
        "DEVIATION": {"global": {"reputation": -1}},
        "NOT_DONE": {"global": {"reputation": -2}},
    },
    "default_rule": {
        "DONE_OK": {},
        "DEVIATION": {},
        "NOT_DONE": {},
    },
}


def _pick_best_match(expected: dict, matches: list):
    created_at = expected.get("created_at") or 0
    after = [m for m in matches if (m.get("committed_at") or 0) >= created_at]
    after.sort(key=lambda a: a.get("committed_at") or 0)
    if after:
        return after[0]
    return sorted(matches, key=lambda a: a.get("committed_at") or 0)[0]


def _extract_stakeholder_id(target_ref: str):
    if target_ref and target_ref.startswith("stakeholder:"):
        return target_ref.split(":", 1)[1]
    return None


def _apply_effects(global_deltas: dict, stakeholder_deltas: dict, effect: dict, expected: dict):
    if not effect:
        return
    for k, v in (effect.get("global") or {}).items():
        global_deltas[k] = global_deltas.get(k, 0) + v
    stakeholder_effects = effect.get("stakeholder") or {}
    if stakeholder_effects:
        sid = _extract_stakeholder_id(expected.get("target_ref"))
        if sid:
            curr = stakeholder_deltas.get(sid, {})
            for k, v in stakeholder_effects.items():
                curr[k] = curr.get(k, 0) + v
            stakeholder_deltas[sid] = curr


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

    conn.execute("DELETE FROM comparisons WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM daily_effects WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM mechanic_events WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM canonical_actions WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM expected_actions WHERE session_id = %s", (session_id,))
    conn.execute("DELETE FROM explicit_decisions WHERE session_id = %s", (session_id,))
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
            INSERT INTO comparisons (session_id, expected_action_id, canonical_action_id, outcome, deviation, rule_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                session_id,
                comparison.get("expected_action_id"),
                comparison.get("canonical_action_id"),
                comparison.get("outcome"),
                _json_dump(comparison.get("deviation")),
                comparison.get("rule_id"),
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
            # Persist question definitions for this stakeholder
            questions = stakeholder.get("questions") or []
            if isinstance(questions, list):
                for q in questions:
                    q_id = q.get("question_id")
                    if not q_id:
                        continue
                    conn.execute(
                        """
                        INSERT INTO questions (pregunta_id, stakeholder_id, texto_pregunta, texto_respuesta, atributo_global_min, acciones_requeridas)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (pregunta_id) DO UPDATE SET
                            stakeholder_id = EXCLUDED.stakeholder_id,
                            texto_pregunta = EXCLUDED.texto_pregunta,
                            texto_respuesta = EXCLUDED.texto_respuesta,
                            atributo_global_min = EXCLUDED.atributo_global_min,
                            acciones_requeridas = EXCLUDED.acciones_requeridas
                        """,
                        (
                            q_id,
                            stakeholder_id,
                            q.get("text"),
                            q.get("answer"),
                            _json_dump(q.get("requirements")),
                            _json_dump(q.get("actions_required")),
                        ),
                    )
                    # reset requirements entries for this question to avoid duplicates
                    conn.execute("DELETE FROM question_requirements WHERE pregunta_id = %s", (q_id,))
                    req = q.get("requirements") or {}
                    if req:
                        conn.execute(
                            """
                            INSERT INTO question_requirements (pregunta_id, trust_min, support_min, reputation_min)
                            VALUES (%s, %s, %s, %s)
                            """,
                            (
                                q_id,
                                req.get("trust_min"),
                                req.get("support_min"),
                                req.get("reputation_min"),
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


@app.post("/sessions/{session_id}/resolve_day_effects")
def resolve_day_effects(session_id: str, day: int):
    if day is None:
        raise HTTPException(status_code=400, detail="day is required")

    with get_conn() as conn:
        # ensure session exists
        exists = conn.execute("SELECT 1 FROM sessions WHERE session_id = %s", (session_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="session not found")

        existing_effect = conn.execute(
            "SELECT comparisons, global_deltas, stakeholder_deltas FROM daily_effects WHERE session_id = %s AND day = %s",
            (session_id, day),
        ).fetchone()
        if existing_effect:
            return {
                "ok": True,
                "session_id": session_id,
                "day": day,
                "comparisons": _json_load(existing_effect["comparisons"]) or [],
                "global_deltas": _json_load(existing_effect["global_deltas"]) or {},
                "stakeholder_deltas": _json_load(existing_effect["stakeholder_deltas"]) or {},
                "cached": True,
            }

        expected_rows = conn.execute(
            """
            SELECT expected_action_id, source_node_id, source_option_id, action_type, target_ref,
                   constraints, rule_id, created_at, mechanic_id
            FROM expected_actions
            WHERE session_id = %s
            """,
            (session_id,),
        ).fetchall()
        canonical_rows = conn.execute(
            """
            SELECT canonical_action_id, mechanic_id, action_type, target_ref, value_final, committed_at, context
            FROM canonical_actions
            WHERE session_id = %s
            """,
            (session_id,),
        ).fetchall()

        expected_actions = [
            {
                "expected_action_id": r["expected_action_id"],
                "source": {"node_id": r["source_node_id"], "option_id": r["source_option_id"]},
                "action_type": r["action_type"],
                "target_ref": r["target_ref"],
                "constraints": _json_load(r["constraints"]) or {},
                "rule_id": r["rule_id"] or "default_rule",
                "created_at": r["created_at"] or 0,
                "mechanic_id": r["mechanic_id"],
            }
            for r in expected_rows
        ]
        canonical_actions = [
            {
                "canonical_action_id": r["canonical_action_id"],
                "mechanic_id": r["mechanic_id"],
                "action_type": r["action_type"],
                "target_ref": r["target_ref"],
                "value_final": _json_load(r["value_final"]),
                "committed_at": r["committed_at"] or 0,
                "context": _json_load(r["context"]),
            }
            for r in canonical_rows
        ]

        # Filter expected by day constraint if present
        day_index = _day_index_from_value(day)
        def applies_to_day(exp: dict):
            constraints = exp.get("constraints") or {}
            if "day" not in constraints:
                return True
            exp_day = _day_index_from_value(constraints.get("day"))
            return exp_day is None or exp_day == day_index

        comparisons = []
        global_deltas = {"budget": 0, "reputation": 0}
        stakeholder_deltas = {}

        for exp in expected_actions:
            if not applies_to_day(exp):
                continue
            matches = [
                act for act in canonical_actions
                if act["action_type"] == exp["action_type"]
                and act["target_ref"] == exp["target_ref"]
                and (not exp.get("mechanic_id") or act["mechanic_id"] == exp["mechanic_id"])
            ]
            if not matches:
                comparisons.append({
                    "expected_action_id": exp["expected_action_id"],
                    "canonical_action_id": None,
                    "outcome": "NOT_DONE",
                    "deviation": {"reason": "missing_action"},
                    "rule_id": exp["rule_id"],
                })
                effect = RULE_EFFECTS.get(exp["rule_id"] or "default_rule", {}).get("NOT_DONE")
                _apply_effects(global_deltas, stakeholder_deltas, effect, exp)
                continue

            best = _pick_best_match(exp, matches)
            handler = RULE_HANDLERS.get(exp["rule_id"] or "default_rule", _default_rule)
            result = handler(exp, best)
            outcome = result.get("outcome", "DEVIATION")
            comparisons.append({
                "expected_action_id": exp["expected_action_id"],
                "canonical_action_id": best["canonical_action_id"],
                "outcome": outcome,
                "deviation": result.get("deviation"),
                "rule_id": exp["rule_id"],
            })
            effect = RULE_EFFECTS.get(exp["rule_id"] or "default_rule", {}).get(outcome)
            _apply_effects(global_deltas, stakeholder_deltas, effect, exp)

        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute("BEGIN")
        for cmp in comparisons:
            conn.execute(
                """
                INSERT INTO comparisons (session_id, expected_action_id, canonical_action_id, outcome, deviation, rule_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    session_id,
                    cmp["expected_action_id"],
                    cmp["canonical_action_id"],
                    cmp["outcome"],
                    _json_dump(cmp.get("deviation")),
                    cmp.get("rule_id"),
                ),
            )
        conn.execute(
            """
            INSERT INTO daily_effects (session_id, day, comparisons, global_deltas, stakeholder_deltas, created_at, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (session_id, day) DO UPDATE SET
                comparisons = EXCLUDED.comparisons,
                global_deltas = EXCLUDED.global_deltas,
                stakeholder_deltas = EXCLUDED.stakeholder_deltas,
                created_at = EXCLUDED.created_at,
                status = EXCLUDED.status
            """,
            (
                session_id,
                day,
                _json_dump(comparisons),
                _json_dump(global_deltas),
                _json_dump(stakeholder_deltas),
                created_at,
                "applied",
            ),
        )
        conn.commit()

    return {
        "ok": True,
        "session_id": session_id,
        "day": day,
        "comparisons": comparisons,
        "global_deltas": global_deltas,
        "stakeholder_deltas": stakeholder_deltas,
        "cached": False,
    }


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
