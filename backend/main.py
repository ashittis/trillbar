# ---------------------------------------------------------------------------
# Patch typing._check_generic BEFORE sqlalchemy is imported.
# Fixes: TypeError: Result is not a generic class
# Caused by sqlalchemy 2.0.x + typing_extensions >= 4.12 on Python 3.11.
# ---------------------------------------------------------------------------
import typing as _typing
import typing_extensions as _te  # noqa: F401 — import triggers the extensions cache

_strict_check = _typing._check_generic

def _lenient_check_generic(cls, parameters, elen):
    if elen == 0:
        return  # SQLAlchemy's Result has empty __parameters__ but is subscriptable
    return _strict_check(cls, parameters, elen)

_typing._check_generic = _lenient_check_generic
# ---------------------------------------------------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from db.database import init_db
from api import sessions, upload, voice_lab, dub_studio


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="TrillBar Studio API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(voice_lab.router, prefix="/api/sessions", tags=["voice-lab"])
app.include_router(dub_studio.router, prefix="/api/sessions", tags=["dub-studio"])


@app.get("/health")
def health():
    return {"status": "ok"}
