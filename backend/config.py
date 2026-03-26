import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

# Ensure ffmpeg is findable — winget installs it here but doesn't always add to PATH
_FFMPEG_BIN = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WinGet/Packages"
if _FFMPEG_BIN.exists():
    for _pkg in _FFMPEG_BIN.glob("Gyan.FFmpeg_*/*/bin"):
        os.environ["PATH"] = str(_pkg) + os.pathsep + os.environ.get("PATH", "")
        break

# Storage
STORAGE_DIR = BASE_DIR / "storage" / "files"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = f"sqlite:///{BASE_DIR}/trillbar.db"

# Cloud AI APIs
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")

# HuggingFace token (optional — for pyannote speaker diarization)
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Max upload size in bytes (500 MB)
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

# CORS allowed origins (comma-separated in .env, or defaults for dev)
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if o.strip()
]

# Supported source languages
SOURCE_LANGUAGES = {
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "en": "English",
    "es": "Spanish",
    "tr": "Turkish",
}

# Supported target languages
TARGET_LANGUAGES = {
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "kn": "Kannada",
    "en": "English",
    "bn": "Bengali",
    "mr": "Marathi",
}
