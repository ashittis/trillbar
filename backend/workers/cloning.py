"""
Voice cloning worker — ElevenLabs Instant Voice Cloning (IVC).
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


def _concat_selected_samples(line_ids: list[str], session_dir: Path, db) -> Path | None:
    """Concatenate audio from selected dialogue lines into one sample."""
    from db.models import DialogueLine

    paths = []
    for lid in line_ids:
        line = db.get(DialogueLine, lid)
        if line and line.original_audio_path:
            p = config.STORAGE_DIR / line.original_audio_path
            if p.exists():
                paths.append(p)

    if not paths:
        return None
    if len(paths) == 1:
        return paths[0]

    out_path = session_dir / "selected_concat.wav"
    inputs = []
    filter_parts = []
    for i, p in enumerate(paths):
        inputs += ["-i", str(p)]
        filter_parts.append(f"[{i}:a]")
    fc = "".join(filter_parts) + f"concat=n={len(paths)}:v=0:a=1[out]"
    cmd = (
        ["ffmpeg", "-y"] + inputs
        + ["-filter_complex", fc, "-map", "[out]",
           "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(out_path)]
    )
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return paths[0]
    return out_path


def clone_actor_voice(actor_id: str, job_id: str, selected_line_ids: list[str] | None = None) -> None:
    """Background task: clone actor voice with ElevenLabs IVC.
    Optionally uses selected dialogue line samples instead of the default sample."""
    db = SessionLocal()
    try:
        actor = db.get(Actor, actor_id)
        job = db.get(Job, job_id)
        if not actor or not job:
            return

        if not config.ELEVENLABS_API_KEY:
            _job_update(db, job, 0, "ELEVENLABS_API_KEY not set in .env", "failed")
            actor.cloning_status = "failed"
            actor.cloning_error = "ELEVENLABS_API_KEY not configured"
            db.commit()
            return

        # Resolve sample: selected lines > cleaned audio > original sample
        session_dir = config.STORAGE_DIR / actor.session_id
        sample_path = None

        if selected_line_ids:
            sample_path = _concat_selected_samples(selected_line_ids, session_dir, db)

        if not sample_path:
            sample_rel = actor.cleaned_audio_path or actor.sample_audio_path
            if not sample_rel:
                _job_update(db, job, 0, "No sample audio for this actor", "failed")
                actor.cloning_status = "failed"
                actor.cloning_error = "No sample audio"
                db.commit()
                return
            sample_path = config.STORAGE_DIR / sample_rel

        if not sample_path.exists():
            _job_update(db, job, 0, "Sample audio file not found", "failed")
            actor.cloning_status = "failed"
            actor.cloning_error = "Sample file missing"
            db.commit()
            return

        _job_update(db, job, 20, f"Uploading voice sample for {actor.label}...")
        actor.cloning_status = "processing"
        db.commit()

        from elevenlabs import ElevenLabs
        client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)

        _job_update(db, job, 50, f"Cloning voice for {actor.label}...")

        voice_id = None
        used_fallback = False

        try:
            with open(sample_path, "rb") as f:
                voice = client.voices.ivc.create(
                    name=f"trillbar_{actor.session_id[:8]}_{actor.label.replace(' ', '_')}",
                    files=[f],
                    description=f"TrillBar auto-cloned voice for {actor.label}",
                )
            voice_id = voice.voice_id
        except Exception as ivc_err:
            err_str = str(ivc_err).lower()
            if "paid_plan_required" in err_str or "payment_required" in err_str or "can_not_use_instant_voice_cloning" in err_str:
                _job_update(db, job, 70, "IVC requires paid plan — assigning a pre-built voice...")
                voices = client.voices.get_all()
                available = [v for v in voices.voices if getattr(v, "category", "") != "cloned"]
                if not available:
                    available = voices.voices
                if not available:
                    raise RuntimeError("No voices available on this ElevenLabs account")
                voice_id = available[0].voice_id
                used_fallback = True
            else:
                raise

        actor.elevenlabs_voice_id = voice_id
        actor.cloning_status = "ready"
        label = f"{actor.label} (pre-built voice — upgrade plan for real cloning)" if used_fallback else f"{actor.label} voice cloned successfully."
        _job_update(db, job, 100, label, "done")

    except Exception as e:
        try:
            actor = db.get(Actor, actor_id)
            job = db.get(Job, job_id)
            if actor:
                actor.cloning_status = "failed"
                actor.cloning_error = str(e)
            if job:
                _job_update(db, job, 0, str(e), "failed")
                job.error = str(e)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()
