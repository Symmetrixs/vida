# CLAUDE.md

VIDA (Visual Infrastructure and Defect Analyzer): UTeM final year project. Inspectors photograph building defects, an RT-DETRv2 model detects them, admins review findings and generate reports.

## Working rules
- No comments in code. No emojis anywhere (code, UI strings, commits, replies).
- Explain every command in plain words before running it.
- After every change, run the checks below or start the stack and confirm it works.
- Never commit or push unless the user asks.
- Chat naming: at the start of each session, read the line below, give the user the exact `/rename NN Short task title` command for the next number (two digits), then update the line to that number.

Last chat: 01

## Stack and layout
- `Frontend/`: React 18 + Vite + Tailwind. `src/view/{Admin,Auth,Inspector}` are pages, `src/api/axios.js` is the single API client (JWT from localStorage key `vida-token`, 401 redirects to /login). PDF/DOCX reports are built client-side in `src/model/`.
- `Backend/`: FastAPI, flat layout. One module per resource, each exposing `router`, mounted in `main.py`. Note `vessel.py` serves `/buildings`.
- `Model/`: RT-DETRv2 weights (`config.json`, `preprocessor_config.json`, `model.safetensors`). Gitignored; must be copied in manually. Loaded once at startup by `ai_detection._load_model()`; startup continues if loading fails.
- `Docker/`: compose file, Dockerfiles, nginx config. `render.yaml` at root.

## Architecture notes
- Auth is custom JWT (python-jose + bcrypt), not Supabase Auth. `auth.get_current_user` is the dependency every protected route uses; roles are `admin` and `inspector`.
- The backend talks to Supabase with the service key (bypasses RLS), so authorization lives entirely in route code. The frontend never calls Supabase directly.
- Photos go to Supabase Storage via the backend.

## Run locally
Docker (backend :8000, frontend :3000):
```bash
cd Docker && docker compose up --build
```
Needs `Docker/.env` (copy `Docker/.env.example`); only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` are required. Compose mounts `Backend/` and runs uvicorn with `--reload`, and it sets `CONFIDENCE_THRESHOLD=0.05` (Render uses 0.25).

Without Docker:
```bash
cd Backend && pip install -r requirements.txt && uvicorn main:app --reload
cd Frontend && npm install && npm run dev
```
Health check: `curl http://localhost:8000/health`. API docs at `/docs`.

## Checks
```bash
cd Frontend && npm run lint && npm run build
cd Backend && py -m compileall -q . && py -m pytest -q tests
```
`Backend/tests/test_smoke.py` covers health, login and one detection call; needs `pip install -r requirements-dev.txt`. Single test: `py -m pytest -q tests -k detect`. `conftest.py` loads `Docker/.env` and defaults `MODEL_PATH` to the repo `Model/`. Login is skipped without `VIDA_TEST_EMAIL`/`VIDA_TEST_PASSWORD`, detection without the weights.
Then start the stack and hit `/health` (and `/ai/health` for model status). On this Windows machine use `py`, not `python`. Lint uses `--max-warnings 0` and currently fails on 10 existing hook-dependency warnings.

## Deploy (Render, render.yaml)
- `vida-backend`: Python service, rootDir `Backend`. Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`) are set in the Render dashboard. `MODEL_PATH=./Model` resolves inside `Backend/`, but `Model/` is gitignored, so the weights are not present on Render unless provided some other way.
- `vida-frontend`: static site from `Frontend/dist`. `VITE_API_URL` is baked in at build time. `public/_redirects` handles SPA routing.
- `ALLOWED_ORIGINS` on the backend must match the frontend URL.
