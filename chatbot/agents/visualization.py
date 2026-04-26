"""
Deterministic visualization agent.
Builds safe Plotly JSON without executing model-generated code.
"""
from __future__ import annotations

import json
from typing import Any
import plotly.express as px


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float))


def visualization_agent(state: dict) -> dict:
    raw = (state.get("query_result") or "").strip()
    if not raw:
        return {"visualization_code": ""}

    try:
        rows = json.loads(raw)
    except json.JSONDecodeError:
        return {"visualization_code": ""}

    if not isinstance(rows, list) or len(rows) < 2:
        return {"visualization_code": ""}
    if not isinstance(rows[0], dict):
        return {"visualization_code": ""}

    keys = list(rows[0].keys())
    if len(keys) < 2:
        return {"visualization_code": ""}

    numeric_candidates = [k for k in keys if all(_is_number(r.get(k)) for r in rows if k in r)]
    if not numeric_candidates:
        return {"visualization_code": ""}

    y_col = numeric_candidates[0]
    x_candidates = [k for k in keys if k != y_col]
    if not x_candidates:
        return {"visualization_code": ""}
    x_col = x_candidates[0]

    fig = px.bar(rows, x=x_col, y=y_col, title="Analytics Result")
    return {"visualization_code": fig.to_json()}