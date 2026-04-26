"""
Database helpers for the chatbot service.
"""
from __future__ import annotations

import json
import os
from decimal import Decimal
from datetime import date, datetime

import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=os.getenv("DB_NAME", "novamart"),
    )


def _serialize_value(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def execute_query(sql: str) -> tuple[str, str]:
    """
    Executes SQL and returns (json_result, error_message).
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        normalized_rows: list[dict] = []
        for row in rows:
            normalized_rows.append({key: _serialize_value(value) for key, value in row.items()})

        return json.dumps(normalized_rows, ensure_ascii=False), ""
    except Exception as exc:  # pragma: no cover - runtime DB errors are expected in retries
        return "", str(exc)


def get_schema() -> str:
    """
    Return table/column schema description for prompting.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]

        schema_parts: list[str] = []
        for table in tables:
            cursor.execute(f"DESCRIBE {table}")
            columns = cursor.fetchall()
            col_defs = [f"  {col[0]} {col[1]}" for col in columns]
            schema_parts.append(f"{table}(\n" + ",\n".join(col_defs) + "\n)")

        cursor.close()
        conn.close()
        return "\n\n".join(schema_parts)
    except Exception as exc:  # pragma: no cover
        return f"Error reading schema: {exc}"