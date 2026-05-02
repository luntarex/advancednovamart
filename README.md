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

## Chatbot LLM Setup

The chatbot is configured to use Ollama first and Gemini only as fallback.

1. Copy `chatbot/.env.example` to `chatbot/.env`.
2. Start Ollama:

```bash
ollama serve
```

3. Pull the default local model:

```bash
ollama pull qwen2.5:7b
```

4. Add your Gemini key to `chatbot/.env` if you want fallback:

```bash
GOOGLE_API_KEY=your_gemini_key_here
```
