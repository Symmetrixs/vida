# CLAUDE.md

VIDA (Visual Infrastructure and Defect Analyzer): UTeM final year project. Inspectors photograph building defects, an RT-DETRv2 model detects them, admins review findings and generate reports.

## Working rules
- No comments in code. No emojis anywhere (code, UI strings, commits, replies).
- Explain every command in plain words before running it.
- After every change, run the checks below or start the stack and confirm it works.
- Never run git add, commit or push. Never add Co-Authored-By, Claude, or AI attribution to anything. At the end of a task, give me the exact git commands and a plain commit message to run myself.
- Chat naming: at the start of each session, read the line below, give the user the exact `/rename NN Short task title` command for the next number (two digits), then update the line to that number.

Last chat: 03

## Stack and layout
- `Frontend/`: React 18 + Vite + Tailwind. `src/view/{Admin,Auth,Inspector}` are pages, `src/api/axios.js` is the single API client (JWT from localStorage key `vida-token`, 401 redirects to /login). PDF/DOCX reports are built client-side in `src/model/`.
- `Backend/`: FastAPI, flat layout. One module per resource, each exposing `router`, mounted in `main.py`. Note `vessel.py` serves `/buildings`.
- `Model/`: RT-DETRv2 weights (`config.json`, `preprocessor_config.json`, `model.safetensors`). Gitignored; must be copied in manually. Loaded once at startup by `ai_detection._load_model()`; startup continues if loading fails.
- `Docker/`: compose file, Dockerfiles, nginx config.

## Architecture notes
- Auth is custom JWT (python-jose + bcrypt), not Supabase Auth. `auth.get_current_user` is the dependency every protected route uses; roles are `admin`, `facility_manager` and `inspector`. Admin and facility manager sign-ups need approval (`auth.APPROVAL_ROLES`).
- `public.py` (mounted at `/public`) is the only unauthenticated router: public building list, captcha and complaint submission. It must never depend on `get_current_user` or call the AI model. `complaint.py` is the admin/facility manager inbox that converts complaints into draft inspections.
- Schema changes live in `Backend/migrations/*.sql` and are run by hand in the Supabase SQL editor.
- The backend talks to Supabase with the service key (bypasses RLS), so authorization lives entirely in route code. The frontend never calls Supabase directly.
- Photos go to Supabase Storage via the backend.

## Run locally
Docker (backend :8000, frontend :3000):
```bash
cd Docker && docker compose up --build
```
Needs `Docker/.env` (copy `Docker/.env.example`); only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` are required. Compose mounts `Backend/` and runs uvicorn with `--reload`, and it sets `CONFIDENCE_THRESHOLD=0.05`.

Without Docker:
```bash
cd Backend && pip install -r requirements.txt && uvicorn main:app --reload
cd Frontend && npm install && npm run dev
```
Health check: `curl http://localhost:8000/health`. API docs at `/docs`.

## Checks
```bash
cd Frontend && npm run lint && npm run build
cd Backend && py -m compileall -q .
docker compose -f Docker/docker-compose.yml run --rm --no-deps backend sh -c "pip install -q --root-user-action=ignore pytest && python -m pytest -q -rs tests"
```
Tests run inside the backend container (local Python is 3.14, which the pinned deps do not support). `Backend/tests/test_smoke.py` covers health, login and one detection call; add `-k detect` for a single test. Login is skipped unless `Docker/.env` has `VIDA_TEST_EMAIL`/`VIDA_TEST_PASSWORD`; detection is skipped without the weights.
Then start the stack and hit `/health` (and `/ai/health` for model status). On this Windows machine use `py`, not `python`. Lint uses `--max-warnings 0` and currently fails on 10 existing hook-dependency warnings.

## Runs locally via Docker
There is no hosted deployment. Docker Compose runs the backend, frontend (nginx, SPA fallback via `try_files`) and the model from the local `Model/` folder. Only the database and file storage are remote, on Supabase cloud.
