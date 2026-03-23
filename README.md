# TrillBar Studio

AI-powered multilingual dubbing studio. Upload source video → AI transcribes & detects speakers → clone voices → synthesize dubbed audio with emotion control → export final mix.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS v4 |
| State | Zustand (UI) + React Query (server) |
| Realtime | Server-Sent Events (SSE) |
| Backend | FastAPI + SQLAlchemy + SQLite |
| Task Queue | Celery + Redis |
| AI Models | Whisper (transcription), pyannote (diarization), Resemblyzer (voice encoding), XTTS-v2 (synthesis) |
| Audio/Video | FFmpeg, librosa, soundfile |

---

## Quick Start

### 1. Backend

```bash
# Prerequisites: Python 3.11+, Redis, FFmpeg in PATH

cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Install TTS separately (large download)
pip install TTS

# Copy and fill in env vars
cp .env.example .env

# Start FastAPI
uvicorn main:app --reload --port 8000

# In a separate terminal: start Celery worker
celery -A workers.celery_app worker --loglevel=info --pool=solo
```

### 2. Frontend

```bash
cd Frontend

# Copy env
cp .env.example .env.local

npm install
npm run dev
# → http://localhost:5173
```

---

## Workflow

```
1. Upload     →  Drop video/audio, set session name + language pair
2. Extract    →  Whisper transcribes, pyannote detects speakers (SSE progress)
3. Script     →  Review/edit lines, fix translations, adjust timecodes
4. Voice      →  Upload 10s reference audio per character → d-vector + XTTS clone
5. Studio     →  Synthesize per line with emotion/pitch/speed controls
6. Export     →  FFmpeg mixes approved takes with M&E stems → .mp4 + .wav stem
```

---

## Supported Languages

Hindi · Tamil · Telugu · Malayalam · Kannada · Bengali · Marathi · English (target)
Japanese · Korean · Chinese · Spanish · Turkish · English (source)

---

## Environment

### Backend `.env`
| Key | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker |
| `HF_TOKEN` | *(empty)* | HuggingFace token for pyannote |
| `WHISPER_MODEL_SIZE` | `large-v3` | Whisper model variant |

### Frontend `.env.local`
| Key | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:8000` |

---

## Key Files

```
backend/
├── main.py                  FastAPI app + CORS
├── config.py                All env config
├── db/
│   ├── database.py          SQLAlchemy engine + get_db()
│   └── models.py            Session, Scene, Line, Take, VoiceProfile, Job, Render
├── api/
│   ├── sessions.py          Session CRUD + script endpoints
│   ├── upload.py            Video/audio upload + file serving
│   ├── extraction.py        SSE job stream
│   ├── voices.py            Voice profile CRUD
│   ├── synthesis.py         Per-line TTS queue
│   └── render.py            FFmpeg export
├── workers/
│   ├── celery_app.py        Celery config
│   ├── extraction.py        Whisper + pyannote pipeline
│   ├── cloning.py           Resemblyzer d-vector
│   ├── tts.py               XTTS-v2 synthesis
│   └── render.py            FFmpeg final mix

Frontend/src/
├── lib/
│   ├── api.ts               Typed fetch client for all endpoints
│   ├── store.ts             Zustand session + UI state
│   └── useSSE.ts            SSE subscription hook
├── app/components/
│   ├── ProjectUpload.tsx    Upload + session creation
│   ├── ScriptExtraction.tsx Whisper job progress via SSE
│   ├── ScriptTimeline.tsx   Script editor
│   ├── VoiceMatching.tsx    Voice clone management
│   ├── StudioRecorderPro.tsx Synthesis per line
│   └── PreviewRender.tsx    Render + export
```
