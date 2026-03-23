"""
Voice cleaning worker — FFmpeg-based audio processing.
Applies noise reduction, EQ, highpass, normalization to actor voice samples.
Runs as a FastAPI BackgroundTask.
"""
import subprocess
from pathlib import Path

import config
from db.database import SessionLocal
from db.models import Actor, Job


def _job_update(db, job: Job, progress: int, message: str, status: str = "running"):
    job.progress = progress
    job.message = message
    job.status = status
    db.commit()


def _build_filter_chain(settings: dict) -> str:
    """Build FFmpeg audio filter chain from cleaning settings."""
    filters = []
    if settings.get("highpass", True):
        freq = settings.get("hp_freq", 80)
        filters.append(f"highpass=f={freq}")
    if settings.get("denoise", True):
        nf = settings.get("noise_floor", -25)
        filters.append(f"afftdn=nf={nf}")
    bass = settings.get("bass", 0)
    if bass != 0:
        filters.append(f"equalizer=f=200:t=q:w=1:g={bass}")
    treble = settings.get("treble", 0)
    if treble != 0:
        filters.append(f"equalizer=f=4000:t=q:w=1:g={treble}")
    if settings.get("normalize", True):
        filters.append("loudnorm=I=-23:TP=-2:LRA=11")
    return ",".join(filters) if filters else "anull"


def _run_ffmpeg_clean(input_path: Path, output_path: Path, settings: dict) -> None:
    """Apply FFmpeg filter chain to audio file."""
    af = _build_filter_chain(settings)
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-af", af,
        "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg cleaning failed: {result.stderr[-500:]}")


def clean_preview(actor_id: str, settings: dict, job_id: str) -> None:
    """Generate a preview of cleaned audio without saving permanently."""
    db = SessionLocal()
    try:
        actor = db.get(Actor, actor_id)
        job = db.get(Job, job_id)
        if not actor or not job:
            return

        sample_rel = actor.sample_audio_path
        if not sample_rel:
            _job_update(db, job, 0, "No sample audio for this actor", "failed")
            return

        sample_path = config.STORAGE_DIR / sample_rel
        if not sample_path.exists():
            _job_update(db, job, 0, "Sample audio file not found", "failed")
            return

        _job_update(db, job, 30, "Applying audio processing...")

        session_dir = config.STORAGE_DIR / actor.session_id
        preview_path = session_dir / f"clean_preview_{actor_id}.wav"

        _run_ffmpeg_clean(sample_path, preview_path, settings)

        _job_update(db, job, 100, f"preview:{preview_path.relative_to(config.STORAGE_DIR)}", "done")

    except Exception as e:
        try:
            job = db.get(Job, job_id)
            if job:
                _job_update(db, job, 0, str(e), "failed")
                job.error = str(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def clean_apply(actor_id: str, settings: dict, job_id: str) -> None:
    """Apply cleaning permanently — saves cleaned audio and updates actor."""
    db = SessionLocal()
    try:
        actor = db.get(Actor, actor_id)
        job = db.get(Job, job_id)
        if not actor or not job:
            return

        sample_rel = actor.sample_audio_path
        if not sample_rel:
            _job_update(db, job, 0, "No sample audio for this actor", "failed")
            return

        sample_path = config.STORAGE_DIR / sample_rel
        if not sample_path.exists():
            _job_update(db, job, 0, "Sample audio file not found", "failed")
            return

        _job_update(db, job, 30, "Applying audio processing...")

        session_dir = config.STORAGE_DIR / actor.session_id
        cleaned_path = session_dir / f"actor_{actor.order}_cleaned.wav"

        _run_ffmpeg_clean(sample_path, cleaned_path, settings)

        import json
        actor.cleaned_audio_path = str(cleaned_path.relative_to(config.STORAGE_DIR))
        actor.clean_settings = json.dumps(settings)
        _job_update(db, job, 100, "Voice cleaned and saved.", "done")

    except Exception as e:
        try:
            job = db.get(Job, job_id)
            if job:
                _job_update(db, job, 0, str(e), "failed")
                job.error = str(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
