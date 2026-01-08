import argparse
import json
from typing import Optional

from backend.main import create_schema, get_conn, normalize_session


def normalize_sessions(session_id: Optional[str]) -> int:
    with get_conn() as conn:
        create_schema(conn)
        if session_id:
            rows = conn.execute(
                "SELECT session_id, payload, created_at FROM sessions WHERE session_id = %s",
                (session_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT session_id, payload, created_at FROM sessions"
            ).fetchall()

        if not rows:
            print("No sessions found to normalize.")
            return 1

        conn.execute("BEGIN")
        for row in rows:
            session = json.loads(row["payload"])
            normalize_session(conn, row["session_id"], session, row["created_at"])
        conn.commit()

    print(f"Normalized {len(rows)} session(s).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize existing sessions in Postgres.")
    parser.add_argument("--session-id", help="Normalize a single session")
    args = parser.parse_args()
    return normalize_sessions(args.session_id)


if __name__ == "__main__":
    raise SystemExit(main())
