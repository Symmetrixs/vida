# VIDA – Visual Infrastructure Defect Analyzer

Final Year Project | UTeM – Faculty of Information and Communication Technology

## Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + Framer Motion
- **Backend**: FastAPI (Python 3.12)
- **Database**: Supabase (PostgreSQL)
- **AI Model**: RT-DETR via HuggingFace Inference API
- **Storage**: Supabase Storage
- **Auth**: JWT (custom)

## Quick Start

### 1. Configure environment
```bash
cp Docker/.env.example Docker/.env
# Edit Docker/.env with your Supabase and HuggingFace credentials
```

### 2. Run with Docker
```bash
cd Docker
docker-compose up --build
```

### 3. Run locally (dev)
```bash
# Backend
cd Backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd Frontend
npm install
npm run dev
```

## Routes
| Path | Description |
|------|-------------|
| `/login` | Login page |
| `/register` | Register page |
| `/admin` | Admin dashboard |
| `/inspector` | Inspector home |

## Defect Classes
- `crack` – Structural or surface cracks
- `faded_paint` – Deteriorated paint coating
- `spalling` – Concrete spalling / flaking
- `water_stain` – Water damage / moisture stains

## Notes
- Fill in your Supabase URL + keys in `Docker/.env`
- Set `HF_API_URL` to your deployed RT-DETR HuggingFace Space endpoint
- The `model/` folder is intentionally empty — add your own business logic
