"""
Dub Studio API — dialogue-line based dubbing, take recording, STS conversion, render.
"""
import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

import config
from db.database import get_db
from db.models import Session, Actor, DialogueLine, DubTrack, Job

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DialogueLineOut(BaseModel):
    id: str
    session_id: str
    actor_id: str | None
    actor_label: str | None
    transcript_text: str | None
    start_time: float
    end_time: float
    order: int
    original_audio_url: str | None
    takes_count: int
    selected_take_id: str | None

    model_config = {"from_attributes": True}


class TakeOut(BaseModel):
    id: str
    dialogue_line_id: str | None
    actor_id: str
    actor_label: str | None
    take_number: int
    recording_source: str
    raw_audio_url: str | None
    converted_audio_url: str | None
    stability: float
    similarity_boost: float
    pitch_shift: float
    status: str
    error: str | None
    approved: bool

    model_config = {"from_attributes": True}


class DubTrackOut(BaseModel):
    id: str
    session_id: str
    actor_id: str
    actor_label: str | None
    raw_audio_url: str | None
    converted_audio_url: str | None
    stability: float
    similarity_boost: float
    pitch_shift: float
    status: str
    error: str | None
    approved: bool

    model_config = {"from_attributes": True}


class TakeUpdate(BaseModel):
    stability: float | None = None
    similarity_boost: float | None = None
    pitch_shift: float | None = None
    approved: bool | None = None


class DubTrackUpdate(BaseModel):
    stability: float | None = None
    similarity_boost: float | None = None
    pitch_shift: float | None = None
    approved: bool | None = None


class JobOut(BaseModel):
    id: str
    job_type: str
    status: str
    progress: int
    message: str
    error: str | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _file_url(rel_path: str | None) -> str | None:
    if not rel_path:
        return None
    parts = Path(rel_path).parts
    if len(parts) >= 2:
        return f"/api/upload/files/{parts[0]}/{'/'.join(parts[1:])}"
    return f"/api/upload/files/{rel_path}"


def _line_out(line: DialogueLine, db: DBSession) -> DialogueLineOut:
    actor = db.get(Actor, line.actor_id) if line.actor_id else None
    takes = (
        db.query(DubTrack)
        .filter(DubTrack.dialogue_line_id == line.id)
        .all()
    )
    approved_take = next((t for t in takes if t.approved), None)
    return DialogueLineOut(
        id=line.id,
        session_id=line.session_id,
        actor_id=line.actor_id,
        actor_label=actor.label if actor else None,
        transcript_text=line.transcript_text,
        start_time=line.start_time,
        end_time=line.end_time,
        order=line.order,
        original_audio_url=_file_url(line.original_audio_path),
        takes_count=len(takes),
        selected_take_id=approved_take.id if approved_take else None,
    )


def _take_out(track: DubTrack, db: DBSession) -> TakeOut:
    actor = db.get(Actor, track.actor_id)
    return TakeOut(
        id=track.id,
        dialogue_line_id=track.dialogue_line_id,
        actor_id=track.actor_id,
        actor_label=actor.label if actor else None,
        take_number=track.take_number,
        recording_source=track.recording_source,
        raw_audio_url=_file_url(track.raw_upload_path),
        converted_audio_url=_file_url(track.converted_audio_path),
        stability=track.stability,
        similarity_boost=track.similarity_boost,
        pitch_shift=track.pitch_shift,
        status=track.status,
        error=track.error,
        approved=track.approved,
    )


def _track_out(track: DubTrack, db: DBSession) -> DubTrackOut:
    actor = db.get(Actor, track.actor_id)
    return DubTrackOut(
        id=track.id,
        session_id=track.session_id,
        actor_id=track.actor_id,
        actor_label=actor.label if actor else None,
        raw_audio_url=_file_url(track.raw_upload_path),
        converted_audio_url=_file_url(track.converted_audio_path),
        stability=track.stability,
        similarity_boost=track.similarity_boost,
        pitch_shift=track.pitch_shift,
        status=track.status,
        error=track.error,
        approved=track.approved,
    )


# ---------------------------------------------------------------------------
# Dialogue line endpoints
# ---------------------------------------------------------------------------

@router.get("/{session_id}/dub-studio/lines", response_model=list[DialogueLineOut])
def list_lines(session_id: str, db: DBSession = Depends(get_db)):
    """List all dialogue lines for a session."""
    lines = (
        db.query(DialogueLine)
        .filter(DialogueLine.session_id == session_id)
        .order_by(DialogueLine.order)
        .all()
    )
    return [_line_out(l, db) for l in lines]


@router.get("/{session_id}/dub-studio/lines/{line_id}/takes", response_model=list[TakeOut])
def list_line_takes(session_id: str, line_id: str, db: DBSession = Depends(get_db)):
    """List all takes for a specific dialogue line."""
    tracks = (
        db.query(DubTrack)
        .filter(DubTrack.session_id == session_id, DubTrack.dialogue_line_id == line_id)
        .order_by(DubTrack.take_number)
        .all()
    )
    return [_take_out(t, db) for t in tracks]


@router.post("/{session_id}/dub-studio/lines/{line_id}/takes", status_code=201)
async def upload_line_take(
    session_id: str,
    line_id: str,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """Upload a take recording for a dialogue line."""
    line = db.query(DialogueLine).filter(
        DialogueLine.id == line_id, DialogueLine.session_id == session_id
    ).first()
    if not line:
        raise HTTPException(404, "Dialogue line not found")

    session_dir = config.STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    # Count existing takes for this line
    existing_count = (
        db.query(DubTrack)
        .filter(DubTrack.dialogue_line_id == line_id)
        .count()
    )
    take_number = existing_count + 1

    suffix = Path(file.filename or "take").suffix or ".wav"
    dest_path = session_dir / f"take_{line_id}_{take_number}{suffix}"

    with open(dest_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    track = DubTrack(
        session_id=session_id,
        actor_id=line.actor_id or "",
        dialogue_line_id=line_id,
        take_number=take_number,
        recording_source="upload",
        raw_upload_path=str(dest_path.relative_to(config.STORAGE_DIR)),
    )
    db.add(track)
    db.commit()
    db.refresh(track)
    return _take_out(track, db)


@router.post("/{session_id}/dub-studio/lines/{line_id}/record", status_code=201)
async def record_line_take(
    session_id: str,
    line_id: str,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """Accept browser-recorded audio for a dialogue line."""
    line = db.query(DialogueLine).filter(
        DialogueLine.id == line_id, DialogueLine.session_id == session_id
    ).first()
    if not line:
        raise HTTPException(404, "Dialogue line not found")

    session_dir = config.STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    existing_count = (
        db.query(DubTrack)
        .filter(DubTrack.dialogue_line_id == line_id)
        .count()
    )
    take_number = existing_count + 1

    suffix = Path(file.filename or "recording").suffix or ".webm"
    dest_path = session_dir / f"rec_{line_id}_{take_number}{suffix}"

    with open(dest_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    track = DubTrack(
        session_id=session_id,
        actor_id=line.actor_id or "",
        dialogue_line_id=line_id,
        take_number=take_number,
        recording_source="browser",
        raw_upload_path=str(dest_path.relative_to(config.STORAGE_DIR)),
    )
    db.add(track)
    db.commit()
    db.refresh(track)
    return _take_out(track, db)


# ---------------------------------------------------------------------------
# Take operations (synthesize, update)
# ---------------------------------------------------------------------------

@router.post("/{session_id}/dub-studio/takes/{take_id}/synthesize", status_code=202)
def synthesize_take(
    session_id: str,
    take_id: str,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Trigger STS conversion for a take."""
    track = db.query(DubTrack).filter(
        DubTrack.id == take_id, DubTrack.session_id == session_id
    ).first()
    if not track:
        raise HTTPException(404, "Take not found")
    if not track.raw_upload_path:
        raise HTTPException(400, "No audio uploaded for this take")

    actor = db.get(Actor, track.actor_id)
    if not actor or not actor.elevenlabs_voice_id:
        raise HTTPException(400, "Actor voice not cloned yet")

    job = Job(
        session_id=session_id,
        job_type="convert_audio",
        status="pending",
        progress=0,
        message="Queued...",
        dub_track_id=take_id,
    )
    db.add(job)
    track.status = "converting"
    track.error = None
    db.commit()
    db.refresh(job)

    from workers.conversion import convert_dub_audio
    background_tasks.add_task(convert_dub_audio, take_id, job.id)

    return {"job_id": job.id}


@router.patch("/{session_id}/dub-studio/takes/{take_id}")
def update_take(
    session_id: str,
    take_id: str,
    body: TakeUpdate,
    db: DBSession = Depends(get_db),
):
    """Update take voice settings or approval status."""
    track = db.query(DubTrack).filter(
        DubTrack.id == take_id, DubTrack.session_id == session_id
    ).first()
    if not track:
        raise HTTPException(404, "Take not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(track, field, value)
    db.commit()
    db.refresh(track)
    return _take_out(track, db)


# ---------------------------------------------------------------------------
# Legacy per-actor endpoints (backward compatibility)
# ---------------------------------------------------------------------------

@router.post("/{session_id}/dub-studio/tracks", status_code=201)
async def upload_dub_track(
    session_id: str,
    actor_id: str = Form(...),
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    """Upload the user's regional audio recording for an actor (legacy)."""
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    actor = db.query(Actor).filter(Actor.id == actor_id, Actor.session_id == session_id).first()
    if not actor:
        raise HTTPException(404, "Actor not found")

    session_dir = config.STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "dub").suffix or ".wav"
    dest_path = session_dir / f"dub_{actor_id}{suffix}"

    with open(dest_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    track = db.query(DubTrack).filter(
        DubTrack.session_id == session_id,
        DubTrack.actor_id == actor_id,
        DubTrack.dialogue_line_id.is_(None),
    ).first()

    if track:
        track.raw_upload_path = str(dest_path.relative_to(config.STORAGE_DIR))
        track.converted_audio_path = None
        track.status = "pending"
        track.error = None
        track.approved = False
    else:
        track = DubTrack(
            session_id=session_id,
            actor_id=actor_id,
            raw_upload_path=str(dest_path.relative_to(config.STORAGE_DIR)),
        )
        db.add(track)

    db.commit()
    db.refresh(track)
    return _track_out(track, db)


@router.get("/{session_id}/dub-studio/tracks", response_model=list[DubTrackOut])
def list_tracks(session_id: str, db: DBSession = Depends(get_db)):
    tracks = (
        db.query(DubTrack)
        .filter(DubTrack.session_id == session_id)
        .all()
    )
    return [_track_out(t, db) for t in tracks]


@router.patch("/{session_id}/dub-studio/tracks/{track_id}")
def update_track(
    session_id: str,
    track_id: str,
    body: DubTrackUpdate,
    db: DBSession = Depends(get_db),
):
    """Update voice settings or approval status."""
    track = db.query(DubTrack).filter(
        DubTrack.id == track_id, DubTrack.session_id == session_id
    ).first()
    if not track:
        raise HTTPException(404, "Track not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(track, field, value)
    db.commit()
    db.refresh(track)
    return _track_out(track, db)


@router.post("/{session_id}/dub-studio/tracks/{track_id}/convert", status_code=202)
def convert_track(
    session_id: str,
    track_id: str,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Trigger ElevenLabs STS conversion for one dub track."""
    track = db.query(DubTrack).filter(
        DubTrack.id == track_id, DubTrack.session_id == session_id
    ).first()
    if not track:
        raise HTTPException(404, "Track not found")
    if not track.raw_upload_path:
        raise HTTPException(400, "No audio uploaded for this track")

    actor = db.get(Actor, track.actor_id)
    if not actor or not actor.elevenlabs_voice_id:
        raise HTTPException(400, "Actor voice not cloned yet")

    job = Job(
        session_id=session_id,
        job_type="convert_audio",
        status="pending",
        progress=0,
        message="Queued...",
        dub_track_id=track_id,
    )
    db.add(job)
    track.status = "converting"
    track.error = None
    db.commit()
    db.refresh(job)

    from workers.conversion import convert_dub_audio
    background_tasks.add_task(convert_dub_audio, track_id, job.id)

    return {"job_id": job.id}


# ---------------------------------------------------------------------------
# Render final video
# ---------------------------------------------------------------------------

@router.post("/{session_id}/dub-studio/render", status_code=202)
def start_render(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Trigger FFmpeg final mix of all approved dub tracks."""
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    job = Job(
        session_id=session_id,
        job_type="render",
        status="pending",
        progress=0,
        message="Queued...",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from workers.render import render_final_video
    background_tasks.add_task(render_final_video, session_id, job.id)

    return {"job_id": job.id}


# ---------------------------------------------------------------------------
# SSE job stream
# ---------------------------------------------------------------------------

@router.get("/{session_id}/dub-studio/jobs/{job_id}/events")
async def job_events(session_id: str, job_id: str):
    """SSE stream for a specific job's progress."""
    async def stream():
        max_polls = 600
        for _ in range(max_polls):
            fresh_db = next(get_db())
            try:
                job = fresh_db.get(Job, job_id)
                if not job:
                    yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                    break
                payload = {
                    "job_id": job.id,
                    "job_type": job.job_type,
                    "status": job.status,
                    "progress": job.progress,
                    "message": job.message,
                    "error": job.error,
                }
                yield f"data: {json.dumps(payload)}\n\n"
                if job.status in ("done", "failed"):
                    break
            finally:
                fresh_db.close()
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Download rendered output
# ---------------------------------------------------------------------------

@router.get("/{session_id}/dub-studio/download/{job_id}")
def download_render(session_id: str, job_id: str, db: DBSession = Depends(get_db)):
    """Download the final rendered .mp4."""
    job = db.query(Job).filter(Job.id == job_id, Job.session_id == session_id).first()
    if not job or job.status != "done":
        raise HTTPException(404, "Render not complete")

    if not job.message.startswith("done:"):
        raise HTTPException(500, "Render output path not recorded")

    rel_path = job.message[5:]
    output_path = config.STORAGE_DIR / rel_path
    if not output_path.exists():
        raise HTTPException(404, "Output file not found")

    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename=output_path.name,
    )
