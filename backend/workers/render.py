"""
Render worker — FFmpeg final mix.
Places approved converted dub tracks at their dialogue-line timestamps,
mixes them together, and overlays on the original video.
Runs as a FastAPI BackgroundTask.
"""
import subprocess
import uuid
from pathlib import Path

import config
from db.database import SessionLocal
from db.models import Session, DubTrack, DialogueLine, Job


def _job_update(db, job: Job, progress: int, message: str, status: str = "running"):
    job.progress = progress
    job.message = message
    job.status = status
    db.commit()


def _get_video_duration_ms(video_path: Path) -> float:
    """Get video duration in milliseconds using ffprobe."""
    import json
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(result.stdout)
        return float(data["format"]["duration"]) * 1000
    except Exception:
        return 0.0


def render_final_video(session_id: str, job_id: str) -> None:
    """Background task: mix all approved dub tracks with original video.

    For dialogue-line-based tracks: places each clip at the line's start_time.
    For legacy tracks (no dialogue_line_id): mixes all together from t=0.
    """
    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        job = db.get(Job, job_id)
        if not session or not job:
            return

        if not session.video_path:
            _job_update(db, job, 0, "No video uploaded for this session", "failed")
            return

        video_path = config.STORAGE_DIR / session.video_path
        if not video_path.exists():
            _job_update(db, job, 0, "Video file not found", "failed")
            return

        # Prefer approved tracks, fall back to any converted tracks
        tracks = (
            db.query(DubTrack)
            .filter(
                DubTrack.session_id == session_id,
                DubTrack.approved == True,
                DubTrack.status == "done",
                DubTrack.converted_audio_path.isnot(None),
            )
            .all()
        )

        if not tracks:
            # Fall back to all converted tracks
            tracks = (
                db.query(DubTrack)
                .filter(
                    DubTrack.session_id == session_id,
                    DubTrack.status == "done",
                    DubTrack.converted_audio_path.isnot(None),
                )
                .all()
            )

        if not tracks:
            _job_update(db, job, 0, "No converted dub tracks found. Convert audio first.", "failed")
            return

        session_dir = config.STORAGE_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        output_id = str(uuid.uuid4())[:8]
        output_path = session_dir / f"export_{output_id}.mp4"

        _job_update(db, job, 20, f"Mixing {len(tracks)} dub track(s)...")
        session.status = "rendering"
        db.commit()

        # Resolve each track's start time from its dialogue line
        timed_tracks = []
        for track in tracks:
            audio_path = config.STORAGE_DIR / track.converted_audio_path
            if not audio_path.exists():
                continue

            start_ms = 0.0
            if track.dialogue_line_id:
                line = db.get(DialogueLine, track.dialogue_line_id)
                if line:
                    start_ms = line.start_time * 1000  # seconds → milliseconds

            timed_tracks.append((track, audio_path, start_ms))

        if not timed_tracks:
            _job_update(db, job, 0, "No valid audio files found for tracks.", "failed")
            return

        # Build FFmpeg command
        if len(timed_tracks) == 1 and timed_tracks[0][2] == 0.0:
            # Simple case: single track at t=0, just replace audio
            dub_audio = timed_tracks[0][1]
            cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(dub_audio),
                "-c:v", "copy",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-af", "loudnorm=I=-23:TP=-2:LRA=11",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                str(output_path),
            ]
        else:
            # Multi-track or timed placement: use adelay + amix
            inputs = ["-i", str(video_path)]
            filter_parts = []

            for i, (track, audio_path, start_ms) in enumerate(timed_tracks):
                inputs += ["-i", str(audio_path)]
                idx = i + 1  # input index (0 is video)
                delay_ms = int(start_ms)
                if delay_ms > 0:
                    filter_parts.append(
                        f"[{idx}:a]adelay={delay_ms}|{delay_ms},apad[a{idx}]"
                    )
                else:
                    filter_parts.append(f"[{idx}:a]apad[a{idx}]")

            n = len(timed_tracks)
            mix_inputs = "".join(f"[a{i+1}]" for i in range(n))
            filter_parts.append(
                f"{mix_inputs}amix=inputs={n}:duration=first:normalize=0,loudnorm=I=-23:TP=-2:LRA=11[mixed]"
            )

            filter_complex = ";".join(filter_parts)
            cmd = (
                ["ffmpeg", "-y"] + inputs
                + [
                    "-filter_complex", filter_complex,
                    "-map", "0:v:0", "-map", "[mixed]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", str(output_path),
                ]
            )

        _job_update(db, job, 60, "Running FFmpeg mix...")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            err = result.stderr[-1000:]
            _job_update(db, job, 0, f"FFmpeg error: {err}", "failed")
            job.error = err
            db.commit()
            return

        session.status = "done"
        rel_path = str(output_path.relative_to(config.STORAGE_DIR))
        # Store output path in job.message for download endpoint
        _job_update(db, job, 100, f"done:{rel_path}", "done")

    except Exception as e:
        try:
            job = db.get(Job, job_id)
            session = db.get(Session, session_id)
            if session:
                session.status = "ready"
            if job:
                _job_update(db, job, 0, str(e), "failed")
                job.error = str(e)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()
