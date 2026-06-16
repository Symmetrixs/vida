# VIDA – Visual Infrastructure Defect Analyzer

Final Year Project | UTeM – Faculty of Information and Communication Technology

## Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + Framer Motion
- **Backend**: FastAPI (Python 3.12)
- **Database**: Supabase (PostgreSQL)
- **AI Model**: RT-DETRv2 (fine-tuned, served locally by the backend)
- **Storage**: Supabase Storage
- **Auth**: JWT (custom)

## Quick Start

### 1. Configure environment
```bash
cp Docker/.env.example Docker/.env
# Edit Docker/.env with your Supabase credentials and JWT secret
```

### 2. Add the trained model
Place the fine-tuned weights in the `Model/` folder so it contains:
```
Model/config.json
Model/preprocessor_config.json
Model/model.safetensors
```
The weights file is excluded from version control due to its size and must be
copied in manually for inference to work.

### 3. Run with Docker
```bash
cd Docker
docker-compose up --build
```

### 4. Run locally (dev)
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
| `/admin` | Admin / facility manager dashboard |
| `/inspector` | Inspector home |

## Defect Classes
- `crack` – Structural or surface cracks
- `faded_paint` – Deteriorated paint coating
- `spalling` – Concrete spalling / flaking
- `water_stain` – Water damage / moisture stains
- `rust` – Rust / corrosion on metal elements
- `mold` – Mold, mildew or biological growth
- `efflorescence` – Salt deposits on masonry
