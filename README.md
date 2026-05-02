# AdvancedNovaMart

## Shared Docker DB Setup

1. Copy `.env.example` to `.env`.
2. (Optional) Change DB values in `.env` if you want a different password/port.
3. Start MySQL:

```bash
docker compose up -d
```

4. Run the backend from `backend/` (it will read `SPRING_DATASOURCE_*` from `.env` defaults if provided in your run config).

### Notes

- MySQL runs on `localhost:${MYSQL_PORT}` (default `3306`).
- DB name defaults to `novamart`.
- If you only need the DB, Docker is enough; backend/frontend can run separately.
- To stop DB:

```bash
docker compose down
```
