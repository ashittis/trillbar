"""
Extraction pipeline — runs as a FastAPI BackgroundTask (no Celery).
Steps:
  1. FFmpeg: extract audio from video → 16kHz mono WAV
  2. Speaker diarization: pyannote if HF_TOKEN set, else single-speaker fallback
  3. Per speaker: extract a representative 20s audio sample
  4. Create Actor records in DB
  5. Persist diarization segments as DialogueLine records
  6. Transcribe each segment with Groq Whisper (if GROQ_API_KEY set)
"""
import json
import subprocess
from pathlib import Path

import config
from db.database import SessionLocal
from db.models import Session, Actor, DialogueLine, Job


def _job_update(db, job: Job, progress: int, message: str, status: str = "running"):
    job.progress = progress
    job.message = message
    job.status = status
    db.commit()


def _ffmpeg_extract_audio(video_path: Path, out_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr[-500:]}")


def _ffmpeg_extract_segment(audio_path: Path, start: float, end: float, out_path: Path) -> None:
    """Extract a single audio segment by time range."""
    cmd = [
        "ffmpeg", "-y", "-ss", str(start), "-to", str(end),
        "-i", str(audio_path), "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1", str(out_path),
    ]
    subprocess.run(cmd, capture_output=True)


def _get_duration(audio_path: Path) -> float:
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(result.stdout)
        for stream in data.get("streams", []):
            if "duration" in stream:
                return float(stream["duration"])
    except Exception:
        pass
    return 0.0


def _diarize_with_pyannote(audio_path: Path) -> list[dict]:
    from pyannote.audio import Pipeline
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=config.HF_TOKEN,
    )
    diarization = pipeline(str(audio_path))
    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({"speaker": speaker, "start": turn.start, "end": turn.end})
    return segments


def _diarize_single_speaker(duration: float) -> list[dict]:
    return [{"speaker": "SPEAKER_00", "start": 0.0, "end": duration}]


def _group_by_speaker(segments: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for seg in segments:
        groups.setdefault(seg["speaker"], []).append(seg)
    return groups


def _extract_sample_clip(audio_path: Path, segments: list[dict], out_path: Path, target_duration: float = 20.0) -> None:
    chosen = []
    total = 0.0
    for seg in sorted(segments, key=lambda s: s["start"]):
        dur = seg["end"] - seg["start"]
        if dur < 0.5:
            continue
        chosen.append(seg)
        total += dur
        if total >= target_duration:
            break

    if not chosen:
        cmd = [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-t", str(target_duration), "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1", str(out_path),
        ]
        subprocess.run(cmd, capture_output=True)
        return

    if len(chosen) == 1:
        seg = chosen[0]
        cmd = [
            "ffmpeg", "-y", "-ss", str(seg["start"]), "-to", str(seg["end"]),
            "-i", str(audio_path), "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1", str(out_path),
        ]
        subprocess.run(cmd, capture_output=True)
        return

    inputs = []
    filter_parts = []
    for i, seg in enumerate(chosen):
        inputs += ["-ss", str(seg["start"]), "-to", str(seg["end"]), "-i", str(audio_path)]
        filter_parts.append(f"[{i}:a]")

    n = len(chosen)
    filter_complex = "".join(filter_parts) + f"concat=n={n}:v=0:a=1[out]"
    cmd = (
        ["ffmpeg", "-y"] + inputs
        + ["-filter_complex", filter_complex, "-map", "[out]",
           "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(out_path)]
    )
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        seg = chosen[0]
        cmd = [
            "ffmpeg", "-y", "-ss", str(seg["start"]), "-to", str(seg["end"]),
            "-i", str(audio_path), "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1", str(out_path),
        ]
        subprocess.run(cmd, capture_output=True)


def run_extraction_pipeline(session_id: str, job_id: str) -> None:
    """Background task: extract actors from the uploaded video."""
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        job = db.get(Job, job_id)
        if not session or not job:
            return

        session_dir = config.STORAGE_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: Extract audio
        _job_update(db, job, 10, "Extracting audio from video...")
        video_path = config.STORAGE_DIR / session.video_path
        audio_path = session_dir / "source_audio.wav"
        try:
            _ffmpeg_extract_audio(video_path, audio_path)
        except Exception as e:
            _job_update(db, job, 0, str(e), "failed")
            job.error = str(e)
            db.commit()
            return

        session.audio_path = str(audio_path.relative_to(config.STORAGE_DIR))
        session.status = "extracting"
        db.commit()

        # Step 2: Speaker diarization
        _job_update(db, job, 35, "Detecting speakers...")
        duration = _get_duration(audio_path)
        segments: list[dict] = []
        if config.HF_TOKEN:
            try:
                _job_update(db, job, 40, "Running pyannote speaker diarization...")
                segments = _diarize_with_pyannote(audio_path)
            except Exception:
                segments = _diarize_single_speaker(duration)
        else:
            segments = _diarize_single_speaker(duration)

        speaker_groups = _group_by_speaker(segments)

        # Step 3: Create Actor records + sample clips
        _job_update(db, job, 60, f"Found {len(speaker_groups)} speaker(s). Extracting samples...")

        speaker_to_actor_id: dict[str, str] = {}
        for i, (speaker_label, speaker_segs) in enumerate(sorted(speaker_groups.items())):
            sample_path = session_dir / f"actor_{i}_sample.wav"
            try:
                _extract_sample_clip(audio_path, speaker_segs, sample_path)
            except Exception:
                pass

            actor = Actor(
                session_id=session_id,
                label=f"Speaker {i + 1}",
                sample_audio_path=str(sample_path.relative_to(config.STORAGE_DIR)) if sample_path.exists() else None,
                cloning_status="pending",
                order=i,
            )
            db.add(actor)
            db.flush()  # get actor.id before commit
            speaker_to_actor_id[speaker_label] = actor.id

        db.commit()

        # Step 4: Create DialogueLine records from diarization segments
        _job_update(db, job, 75, "Creating dialogue lines...")

        all_segments_sorted = sorted(segments, key=lambda s: s["start"])
        for order, seg in enumerate(all_segments_sorted):
            seg_duration = seg["end"] - seg["start"]
            if seg_duration < 0.3:
                continue  # skip very short segments

            actor_id = speaker_to_actor_id.get(seg["speaker"])
            seg_audio = session_dir / f"line_{order}.wav"

            try:
                _ffmpeg_extract_segment(audio_path, seg["start"], seg["end"], seg_audio)
            except Exception:
                pass

            line = DialogueLine(
                session_id=session_id,
                actor_id=actor_id,
                start_time=round(seg["start"], 2),
                end_time=round(seg["end"], 2),
                order=order,
                original_audio_path=str(seg_audio.relative_to(config.STORAGE_DIR)) if seg_audio.exists() else None,
            )
            db.add(line)

        db.commit()

        # Step 5: Transcribe with Groq Whisper (optional)
        if config.GROQ_API_KEY:
            _job_update(db, job, 85, "Transcribing dialogue lines...")
            try:
                from groq import Groq
                groq_client = Groq(api_key=config.GROQ_API_KEY)

                lines = (
                    db.query(DialogueLine)
                    .filter(DialogueLine.session_id == session_id)
                    .order_by(DialogueLine.order)
                    .all()
                )
                for idx, line in enumerate(lines):
                    if not line.original_audio_path:
                        continue
                    clip = config.STORAGE_DIR / line.original_audio_path
                    if not clip.exists():
                        continue
                    try:
                        with open(clip, "rb") as f:
                            result = groq_client.audio.transcriptions.create(
                                model="whisper-large-v3-turbo",
                                file=f,
                                language=session.source_language,
                            )
                        line.transcript_text = result.text
                    except Exception:
                        pass  # skip this line, leave transcript null

                db.commit()
            except ImportError:
                pass  # groq not installed, skip transcription
            except Exception:
                pass  # transcription failed, continue anyway

        session.status = "ready"
        _job_update(db, job, 100, "Actors extracted — ready for voice cloning.", "done")

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
