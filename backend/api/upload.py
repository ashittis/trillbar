from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

import config
from db.database import get_db
from db.models import Session

router = APIRouter()


class SessionOut(BaseModel):
    id: str
    name: str
    source_language: str
    target_language: str
    video_path: str | None
    audio_path: str | None
    status: str

    model_config = {"from_attributes": True}


def _session_dir(session_id: str) -> Path:
    d = config.STORAGE_DIR / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/video", response_model=SessionOut)
async def upload_video(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: DBSession = Depends(get_db),
):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    dest_dir = _session_dir(session_id)
    suffix = Path(file.filename or "upload").suffix or ".mp4"
    dest_path = dest_dir / f"source{suffix}"

    size = 0
    with open(dest_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > config.MAX_UPLOAD_BYTES:
                dest_path.unlink(missing_ok=True)
                raise HTTPException(413, "File exceeds 500 MB limit")
            f.write(chunk)

    session.video_path = str(dest_path.relative_to(config.STORAGE_DIR))
    session.status = "uploaded"
    db.commit()
    db.refresh(session)
    return session


@router.get("/files/{session_id}/{filename:path}")
def serve_file(session_id: str, filename: str):
    path = config.STORAGE_DIR / session_id / filename
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(path))
