"""
Voice Lab API — actor extraction, voice cleaning, sample selection, ElevenLabs voice cloning.
"""
import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

import config
from db.database import get_db
from db.models import Session, Actor, DialogueLine, Job

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ActorOut(BaseModel):
    id: str
    session_id: str
    label: str
    sample_audio_url: str | None
    cleaned_audio_url: str | None
    elevenlabs_voice_id: str | None
    cloning_status: str
    cloning_error: str | None
    order: int
    samples_count: int

    model_config = {"from_attributes": True}


class ActorUpdate(BaseModel):
    label: str | None = None


class DialogueLineOut(BaseModel):
    id: str
    session_id: str
    actor_id: str | None
    transcript_text: str | None
    start_time: float
    end_time: float
    order: int
    original_audio_url: str | None

    model_config = {"from_attributes": True}


class CleanSettings(BaseModel):
    highpass: bool = True
    hp_freq: int = 80
    denoise: bool = True
    noise_floor: int = -25
    bass: float = 0.0
    treble: float = 0.0
    normalize: bool = True


class CloneBody(BaseModel):
    selected_line_ids: list[str] | None = None


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


def _actor_out(actor: Actor, db: DBSession) -> ActorOut:
    samples_count = (
        db.query(DialogueLine)
        .filter(DialogueLine.actor_id == actor.id)
        .count()
    )
    return ActorOut(
        id=actor.id,
        session_id=actor.session_id,
        label=actor.label,
        sample_audio_url=_file_url(actor.sample_audio_path),
        cleaned_audio_url=_file_url(actor.cleaned_audio_path),
        elevenlabs_voice_id=actor.elevenlabs_voice_id,
        cloning_status=actor.cloning_status,
        cloning_error=actor.cloning_error,
        order=actor.order,
        samples_count=samples_count,
    )


def _line_out(line: DialogueLine) -> DialogueLineOut:
    return DialogueLineOut(
        id=line.id,
        session_id=line.session_id,
        actor_id=line.actor_id,
        transcript_text=line.transcript_text,
        start_time=line.start_time,
        end_time=line.end_time,
        order=line.order,
        original_audio_url=_file_url(line.original_audio_path),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/{session_id}/voice-lab/start", status_code=202)
def start_extraction(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Trigger actor extraction pipeline. Returns job_id for SSE tracking."""
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.video_path:
        raise HTTPException(400, "No video uploaded for this session")

    job = Job(
        session_id=session_id,
        job_type="extract_actors",
        status="pending",
        progress=0,
        message="Queued...",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from workers.extraction import run_extraction_pipeline
    background_tasks.add_task(run_extraction_pipeline, session_id, job.id)

    return {"job_id": job.id}


@router.get("/{session_id}/voice-lab/actors", response_model=list[ActorOut])
def list_actors(session_id: str, db: DBSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    actors = (
        db.query(Actor)
        .filter(Actor.session_id == session_id)
        .order_by(Actor.order)
        .all()
    )
    return [_actor_out(a, db) for a in actors]


@router.patch("/{session_id}/voice-lab/actors/{actor_id}", response_model=ActorOut)
def update_actor(
    session_id: str,
    actor_id: str,
    body: ActorUpdate,
    db: DBSession = Depends(get_db),
):
    actor = db.query(Actor).filter(Actor.id == actor_id, Actor.session_id == session_id).first()
    if not actor:
        raise HTTPException(404, "Actor not found")
    if body.label is not None:
        actor.label = body.label
    db.commit()
    db.refresh(actor)
    return _actor_out(actor, db)


# ---------------------------------------------------------------------------
# Dialogue line samples per actor
# ---------------------------------------------------------------------------

@router.get("/{session_id}/voice-lab/actors/{actor_id}/samples", response_model=list[DialogueLineOut])
def list_actor_samples(
    session_id: str,
    actor_id: str,
    db: DBSession = Depends(get_db),
):
    """List dialogue lines (voice samples) for a specific actor."""
    lines = (
        db.query(DialogueLine)
        .filter(DialogueLine.session_id == session_id, DialogueLine.actor_id == actor_id)
        .order_by(DialogueLine.order)
        .all()
    )
    return [_line_out(l) for l in lines]


# ---------------------------------------------------------------------------
# Voice cleaning
# ---------------------------------------------------------------------------

@router.post("/{session_id}/voice-lab/actors/{actor_id}/clean-preview", status_code=202)
def clean_preview(
    session_id: str,
    actor_id: str,
    body: CleanSettings,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Generate a preview of cleaned audio."""
    actor = db.query(Actor).filter(Actor.id == actor_id, Actor.session_id == session_id).first()
    if not actor:
        raise HTTPException(404, "Actor not found")

    job = Job(
        session_id=session_id,
        job_type="clean_preview",
        status="pending",
        progress=0,
        message="Queued...",
        actor_id=actor_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from workers.audio_clean import clean_preview as _clean_preview
    background_tasks.add_task(_clean_preview, actor_id, body.model_dump(), job.id)

    return {"job_id": job.id}


@router.post("/{session_id}/voice-lab/actors/{actor_id}/clean-apply", status_code=202)
def clean_apply(
    session_id: str,
    actor_id: str,
    body: CleanSettings,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Apply cleaning permanently and save cleaned audio."""
    actor = db.query(Actor).filter(Actor.id == actor_id, Actor.session_id == session_id).first()
    if not actor:
        raise HTTPException(404, "Actor not found")

    job = Job(
        session_id=session_id,
        job_type="clean_apply",
        status="pending",
        progress=0,
        message="Queued...",
        actor_id=actor_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    from workers.audio_clean import clean_apply as _clean_apply
    background_tasks.add_task(_clean_apply, actor_id, body.model_dump(), job.id)

    return {"job_id": job.id}


# ---------------------------------------------------------------------------
# Voice cloning
# ---------------------------------------------------------------------------

@router.post("/{session_id}/voice-lab/actors/{actor_id}/clone", status_code=202)
def start_clone(
    session_id: str,
    actor_id: str,
    background_tasks: BackgroundTasks,
    body: CloneBody = CloneBody(),
    db: DBSession = Depends(get_db),
):
    """Trigger ElevenLabs IVC cloning for one actor.
    Optionally accepts selected_line_ids to use specific dialogue samples."""
    actor = db.query(Actor).filter(Actor.id == actor_id, Actor.session_id == session_id).first()
    if not actor:
        raise HTTPException(404, "Actor not found")

    job = Job(
        session_id=session_id,
        job_type="clone_voice",
        status="pending",
        progress=0,
        message="Queued...",
        actor_id=actor_id,
    )
    db.add(job)
    actor.cloning_status = "processing"
    db.commit()
    db.refresh(job)

    from workers.cloning import clone_actor_voice
    background_tasks.add_task(
        clone_actor_voice, actor_id, job.id,
        selected_line_ids=body.selected_line_ids,
    )

    return {"job_id": job.id}


@router.post("/{session_id}/voice-lab/clone-all", status_code=202)
def clone_all_actors(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
):
    """Clone all pending actors in one call."""
    actors = (
        db.query(Actor)
        .filter(Actor.session_id == session_id, Actor.cloning_status == "pending")
        .all()
    )
    if not actors:
        raise HTTPException(400, "No pending actors to clone")

    job_ids = []
    from workers.cloning import clone_actor_voice
    for actor in actors:
        job = Job(
            session_id=session_id,
            job_type="clone_voice",
            status="pending",
            progress=0,
            message="Queued...",
            actor_id=actor.id,
        )
        db.add(job)
        actor.cloning_status = "processing"
        db.commit()
        db.refresh(job)
        background_tasks.add_task(clone_actor_voice, actor.id, job.id)
        job_ids.append(job.id)

    return {"job_ids": job_ids}


# ---------------------------------------------------------------------------
# SSE + job listing
# ---------------------------------------------------------------------------

@router.get("/{session_id}/voice-lab/jobs/{job_id}/events")
async def job_events(session_id: str, job_id: str, db: DBSession = Depends(get_db)):
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


@router.get("/{session_id}/voice-lab/jobs", response_model=list[JobOut])
def list_jobs(session_id: str, db: DBSession = Depends(get_db)):
    jobs = (
        db.query(Job)
        .filter(Job.session_id == session_id)
        .order_by(Job.created_at.desc())
        .limit(20)
        .all()
    )
    return jobs
