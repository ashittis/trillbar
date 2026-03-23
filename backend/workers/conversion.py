"""
Speech-to-speech conversion worker — ElevenLabs STS.
Takes user's regional recording and converts it to sound like the original actor.
Runs as a FastAPI BackgroundTask.
"""
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session as DBSession

import config
from db.database import SessionLocal
from db.models import Actor, DubTrack, Job


def _job_update(db: DBSession, job: Job, progress: int, message: str, status: str = "running"):
    job.progress = progress
    job.message = message
    job.status = status
    db.commit()


def _apply_pitch_shift(input_path: Path, output_path: Path, semitones: float) -> None:
    """Post-process: pitch shift via FFmpeg rubberband filter."""
    if abs(semitones) < 0.1:
        import shutil
        shutil.copy2(str(input_path), str(output_path))
        return
    # rubberband pitch shift: semitones to cents
    cents = int(semitones * 100)
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-af", f"rubberband=pitch={pow(2, semitones/12):.6f}",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback: copy without pitch shift
        import shutil
        shutil.copy2(str(input_path), str(output_path))


def convert_dub_audio(dub_track_id: str, job_id: str) -> None:
    """
    Background task: apply ElevenLabs speech-to-speech to the user's dub recording.
    Converts user voice → original actor voice identity while preserving performance.
    """
    db = SessionLocal()
    try:
        track = db.get(DubTrack, dub_track_id)
        job = db.get(Job, job_id)
        if not track or not job:
            return

        actor = db.get(Actor, track.actor_id)
        if not actor:
            _job_update(db, job, 0, "Actor not found", "failed")
            return

        if not actor.elevenlabs_voice_id:
            _job_update(db, job, 0, f"Actor '{actor.label}' voice not cloned yet", "failed")
            track.status = "failed"
            track.error = "Voice not cloned"
            db.commit()
            return

        if not track.raw_upload_path:
            _job_update(db, job, 0, "No uploaded audio found", "failed")
            return

        raw_path = config.STORAGE_DIR / track.raw_upload_path
        if not raw_path.exists():
            _job_update(db, job, 0, "Uploaded audio file not found", "failed")
            return

        if not config.ELEVENLABS_API_KEY:
            _job_update(db, job, 0, "ELEVENLABS_API_KEY not set", "failed")
            return

        session_dir = config.STORAGE_DIR / track.session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        _job_update(db, job, 20, f"Converting voice for {actor.label}...")
        track.status = "converting"
        db.commit()

        from elevenlabs import ElevenLabs
        from elevenlabs.types import VoiceSettings
        client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)

        _job_update(db, job, 40, "Sending to ElevenLabs speech-to-speech...")

        with open(raw_path, "rb") as f:
            audio_stream = client.speech_to_speech.convert(
                voice_id=actor.elevenlabs_voice_id,
                audio=f,
                model_id="eleven_multilingual_sts_v2",
                voice_settings=VoiceSettings(
                    stability=track.stability,
                    similarity_boost=track.similarity_boost,
                ),
            )

        _job_update(db, job, 70, "Saving converted audio...")

        converted_raw = session_dir / f"converted_{track.id}_raw.mp3"
        with open(converted_raw, "wb") as out:
            for chunk in audio_stream:
                if chunk:
                    out.write(chunk)

        # Apply pitch shift if needed
        converted_final = session_dir / f"converted_{track.id}.mp3"
        _apply_pitch_shift(converted_raw, converted_final, track.pitch_shift)

        # Clean up raw (un-pitch-shifted) file if different
        if abs(track.pitch_shift) >= 0.1 and converted_raw.exists():
            converted_raw.unlink(missing_ok=True)

        track.converted_audio_path = str(converted_final.relative_to(config.STORAGE_DIR))
        track.status = "done"
        _job_update(db, job, 100, f"{actor.label} voice conversion complete.", "done")

    except Exception as e:
        try:
            track = db.get(DubTrack, dub_track_id)
            job = db.get(Job, job_id)
            if track:
                track.status = "failed"
                track.error = str(e)
            if job:
                _job_update(db, job, 0, str(e), "failed")
                job.error = str(e)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()
