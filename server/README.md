# Schedger extraction API

This local service proxies extracted PDF text to Gemini. Keep `server/.env` local; it is ignored by Git.

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set GEMINI_API_KEY in .env
uvicorn main:app --reload --port 8000
```

Check the service with `curl http://localhost:8000/health`.
