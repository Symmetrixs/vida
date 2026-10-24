# CLAUDE.md

VIDA (Visual Infrastructure and Defect Analyzer): UTeM final year project. Inspectors photograph building defects, an RT-DETRv2 model detects them, admins review findings and generate reports.

## Working rules
- No comments in code. No emojis anywhere (code, UI strings, commits, replies).
- Explain every command in plain words before running it.
- After every change, run the checks below or start the stack and confirm it works.
- Never run git add, commit or push. Never add Co-Authored-By, Claude, or AI attribution to anything. At the end of a task, give me the exact git commands and a plain commit message to run myself.
- Chat naming: at the start of each session, read the line below, give the user the exact `/rename NN Short task title` command for the next number (two digits), then update the line to that number.

Last chat: 07

## Stack and layout
- `Frontend/`: React 18 + Vite + Tailwind. `src/view/{Admin,Auth,Common,Inspector}` are pages (Common holds Home, Notifications, Profile, Settings for every role). One layout for everyone, `components/AppLayout.jsx`, shows sidebar sections per role held; routes are flat (`/inspections`, `/complaints`, `/staff`, ...) and wrapped in `RequireRole` in `App.jsx`. `useAuth().hasRole(...)` is the only role check. `src/api/axios.js` is the single API client (JWT from localStorage key `vida-token`, 401 redirects to /login). Reports are built client-side in `src/report/`: `reportModel.js` builds one structure that `ReportDocument.jsx` (on screen), `pdfReport.js` (jsPDF) and `docxReport.js` (docx package) all render, loaded lazily through `exportReport.js`. Dates use `utils/reportFormat.js` (22 Oct 2026); finding labels come from `utils/findings.js`.
- `Backend/`: FastAPI, flat layout. One module per resource, each exposing `router`, mounted in `main.py`. Note `vessel.py` serves `/buildings`.
- `Model/`: RT-DETRv2 weights (`config.json`, `preprocessor_config.json`, `model.safetensors`). Gitignored; must be copied in manually. Loaded once at startup by `ai_detection._load_model()`; startup continues if loading fails.
- `Docker/`: compose file, Dockerfiles, nginx config.

## Architecture notes
- Auth is custom JWT (python-jose + bcrypt), not Supabase Auth. `auth.get_current_user` is the dependency every protected route uses; it loads the user's roles from the `user_roles` table on every request (the token also carries `roles`, but only for the client) and rejects inactive users and any account whose `users.status` is not `approved`.
- Roles: `inspector`, `maintenance`, `facility_manager`, `admin`. A user holds any combination and no role implies another (an admin cannot create inspections without also holding `inspector`). Check with `auth.has_any_role(user, ...)` or the `auth.require_roles(...)` dependency; `users.role` and `users.is_approved` are dropped by migration 006. Staff can self-register at `/auth/register` (name, email, employee ID, password); the account is `pending` with no roles until an admin approves it with at least one role (`/admin/users/{id}/approve`) or rejects it with an optional reason (`/reject`). Login explains pending and rejected accounts. Admins can still create approved accounts directly (`/admin/users`). No emails are sent. Inspectors see only their own inspections and reports plus reports shared with them; admins and facility managers read all reports (`/reports/all`) and any inspection, but only the owning inspector edits. Inspection owner checks live in `inspection.owns_inspection`/`assert_owner`/`assert_viewer` and are reused by photo, finding and group routes. Every inspector write (inspection, photo, finding, group) goes through `inspection.assert_editable`, which also returns 409 once the inspection has a severity: a reviewed inspection is locked.
- Inspections are numbered `VIDA-I-0001` (`inspections.ref_no`, `public.format_inspection_reference`), complaints `VIDA-C-0001`, repair jobs `VIDA-R-0001`.
- `public.py` (mounted at `/public`) is the only unauthenticated router: public building list, rooms per floor and complaint submission (rate limit, honeypot and consent, no captcha). It must never depend on `get_current_user` or call the AI model. `complaint.py` is the facility manager inbox that converts complaints into draft inspections. Complaint status flow: pending, assigned, in_progress, submitted (inspector submitted), reviewed, or rejected. `complaint.sync_complaint` derives the status from the inspection and is called from the inspection, photo, finding and group endpoints; reports and repair jobs never affect it.
- Severity lives on the inspection (`inspections.severity`, migration 005). Every submitted inspection, complaint or not, goes to the facility manager Severity Review (`/inspections/review-queue`, `/inspections/{id}/review`); `complaint.apply_review` sets it once, marks a linked complaint reviewed and notifies admins. `/complaints/{id}/review` POST delegates to it.
- `repair.py` (`/repairs`): a job is created only from a submitted inspection with a severity, one job per inspection. Status flow: open (Job Board) -> in_progress (claimed or assigned) -> awaiting_review -> done; send back (reason, rework) and reassign (reason, new worker) return it to in_progress and start a new `round`. Transitions are conditional updates on the current status and worker; every action appends to `repair_job_events`, which cannot be deleted. A facility manager cannot approve or send back a job assigned to themselves.
- Inspection photos are scanned on the server by `POST /photos/{id}/scan` (Photos tab and report page use the same call). It adds AI findings (`findings.source = 'ai'`, bbox includes the image width and height), skips a detection that overlaps an existing AI finding of the same type (dismissed ones included) and sets `photos.scanned_at`. Submitting returns 409 with the unscanned photo ids until every photo is scanned. Removing an AI finding sets `dismissed_at`/`dismissed_by` instead of deleting; every read filters `dismissed_at is null`. Manual findings (`source = 'manual'`) are deleted normally. All of this goes through `assert_editable`, so findings are read only after review.
- Every scan writes one `[AI] scan ...` log line (detections, top scores, threshold, time) via `ai_detection.detect_image`, zero detections included. `/ai/health` reports the threshold in use.
- Other AI scans: inspection photos when a repair job is created (`before_counts`) and completion photos on upload. Complaint photos are never scanned. A failed scan never blocks those actions.
- Rooms: `building_rooms` (building, floor label, name) managed by admins on the Buildings page; `components/LocationPicker.jsx` offers them for the complaint location and Area Inspected, with Other for free text. Values are stored as text.
- Staff page (`/maintenance-staff`, facility managers): inspectors from `/inspections/staff` and maintenance from `/repairs/staff`, least busy first.
- Schema changes live in `Backend/migrations/*.sql` and are run by hand in the Supabase SQL editor.
- The backend talks to Supabase with the service key (bypasses RLS), so authorization lives entirely in route code. The frontend never calls Supabase directly.
- Photos go to Supabase Storage via the backend.

## Run locally
Docker (frontend :3000 for everyone; backend :8000 bound to 127.0.0.1 only, for `/docs` and health checks). The Docker frontend is built with `VITE_API_URL=/api`, so browsers reach the API through nginx, which passes `X-Real-IP`; the backend trusts that header only from the `frontend` container (`TRUSTED_PROXY_HOSTS`), which is what the public complaint rate limit uses.
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
Tests run inside the backend container (local Python is 3.14, which the pinned deps do not support). Add `-e SUPABASE_URL=http://127.0.0.1:9 -e SUPABASE_SERVICE_KEY=offline.test.key` after `--no-deps` to guarantee no test reaches the real database. `Backend/tests/test_roles.py` covers the role permission matrix. `Backend/tests/test_smoke.py` covers health, login and one detection call; add `-k detect` for a single test. Login is skipped unless `Docker/.env` has `VIDA_TEST_EMAIL`/`VIDA_TEST_PASSWORD`; detection is skipped without the weights.
Then start the stack and hit `/health` (and `/ai/health` for model status). On this Windows machine use `py`, not `python`. Lint uses `--max-warnings 0` and passes clean; keep it that way (`useAuth` lives in `context/auth.js` so `AuthContext.jsx` only exports the provider). Floor labels come from `src/utils/floors.js` only: Ground Floor, Floor 1..N-1, Rooftop.

## Runs locally via Docker
There is no hosted deployment. Docker Compose runs the backend, frontend (nginx, SPA fallback via `try_files`) and the model from the local `Model/` folder. Only the database and file storage are remote, on Supabase cloud.
