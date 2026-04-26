"""
Database connection module.
Connects to the same MySQL database that Spring Boot uses.
"""
import os
import json
import mysql.connector
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    """Create a new MySQL connection using .env credentials."""
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "root"),
        database=os.getenv("DB_NAME", "novamart"),
    )


def execute_query(sql: str) -> str:
    """
    Execute a SQL query and return results as a JSON string.
    Only SELECT queries are allowed (safety measure).
    """
    # Safety: block any destructive queries
    sql_upper = sql.strip().upper()
    if not sql_upper.startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed."})

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        # Convert any non-serializable types (like Decimal, datetime) to string
        for row in rows:
            for key, value in row.items():
                if not isinstance(value, (str, int, float, bool, type(None))):
                    row[key] = str(value)

        return json.dumps(rows, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"error": str(e)})


def get_schema() -> str:
    """
    Read the database schema (table names + column names).
    This is sent to the LLM so it knows what tables/columns exist.
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]

        schema_parts = []
        for table in tables:
            cursor.execute(f"DESCRIBE {table}")
            columns = cursor.fetchall()
            col_defs = [f"  {col[0]} {col[1]}" for col in columns]
            schema_parts.append(f"{table}(\n" + ",\n".join(col_defs) + "\n)")

        cursor.close()
        conn.close()
        return "\n\n".join(schema_parts)

    except Exception as e:
        return f"Error reading schema: {e}"
