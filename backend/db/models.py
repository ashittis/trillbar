import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Session (one per uploaded video)
# ---------------------------------------------------------------------------
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    name: Mapped[str] = mapped_column(String, default="Untitled Episode")
    source_language: Mapped[str] = mapped_column(String, default="ja")
    target_language: Mapped[str] = mapped_column(String, default="hi")

    content_type: Mapped[str | None] = mapped_column(String, nullable=True)
    video_path: Mapped[str | None] = mapped_column(String, nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[str] = mapped_column(String, default="created")
    # created | extracting | ready | dubbing | done

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    actors: Mapped[list["Actor"]] = relationship("Actor", back_populates="session", cascade="all, delete-orphan")
    dialogue_lines: Mapped[list["DialogueLine"]] = relationship("DialogueLine", back_populates="session", cascade="all, delete-orphan")
    dub_tracks: Mapped[list["DubTrack"]] = relationship("DubTrack", back_populates="session", cascade="all, delete-orphan")
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="session", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Actor (one detected speaker from the original video)
# ---------------------------------------------------------------------------
class Actor(Base):
    __tablename__ = "actors"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))

    label: Mapped[str] = mapped_column(String, default="Speaker 1")  # user-editable name
    sample_audio_path: Mapped[str | None] = mapped_column(String, nullable=True)  # 15-30s clip

    elevenlabs_voice_id: Mapped[str | None] = mapped_column(String, nullable=True)
    cloning_status: Mapped[str] = mapped_column(String, default="pending")
    # pending | processing | ready | failed
    cloning_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[int] = mapped_column(Integer, default=0)

    # Voice cleaning
    cleaned_audio_path: Mapped[str | None] = mapped_column(String, nullable=True)
    clean_settings: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON blob

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship("Session", back_populates="actors")
    dialogue_lines: Mapped[list["DialogueLine"]] = relationship("DialogueLine", back_populates="actor", cascade="all, delete-orphan")
    dub_tracks: Mapped[list["DubTrack"]] = relationship("DubTrack", back_populates="actor", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# DialogueLine (one diarization segment — a single spoken line in the video)
# ---------------------------------------------------------------------------
class DialogueLine(Base):
    __tablename__ = "dialogue_lines"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    actor_id: Mapped[str | None] = mapped_column(String, ForeignKey("actors.id"), nullable=True)

    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[float] = mapped_column(Float)
    order: Mapped[int] = mapped_column(Integer, default=0)

    original_audio_path: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship("Session", back_populates="dialogue_lines")
    actor: Mapped["Actor"] = relationship("Actor", back_populates="dialogue_lines")
    dub_tracks: Mapped[list["DubTrack"]] = relationship("DubTrack", back_populates="dialogue_line", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# DubTrack (user's regional recording / take for a dialogue line)
# ---------------------------------------------------------------------------
class DubTrack(Base):
    __tablename__ = "dub_tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    actor_id: Mapped[str] = mapped_column(String, ForeignKey("actors.id"))
    dialogue_line_id: Mapped[str | None] = mapped_column(String, ForeignKey("dialogue_lines.id"), nullable=True)

    take_number: Mapped[int] = mapped_column(Integer, default=1)
    recording_source: Mapped[str] = mapped_column(String, default="upload")  # "upload" | "browser"

    raw_upload_path: Mapped[str | None] = mapped_column(String, nullable=True)    # user's recording
    converted_audio_path: Mapped[str | None] = mapped_column(String, nullable=True)  # after ElevenLabs STS

    # ElevenLabs STS voice settings
    stability: Mapped[float] = mapped_column(Float, default=0.5)
    similarity_boost: Mapped[float] = mapped_column(Float, default=0.75)
    pitch_shift: Mapped[float] = mapped_column(Float, default=0.0)  # semitones, post-process

    status: Mapped[str] = mapped_column(String, default="pending")
    # pending | converting | done | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship("Session", back_populates="dub_tracks")
    actor: Mapped["Actor"] = relationship("Actor", back_populates="dub_tracks")
    dialogue_line: Mapped["DialogueLine | None"] = relationship("DialogueLine", back_populates="dub_tracks")


# ---------------------------------------------------------------------------
# Job (background task tracker — replaces Celery)
# ---------------------------------------------------------------------------
class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))

    job_type: Mapped[str] = mapped_column(String)
    # extract_actors | clone_voice | convert_audio | render

    status: Mapped[str] = mapped_column(String, default="pending")
    # pending | running | done | failed

    progress: Mapped[int] = mapped_column(Integer, default=0)   # 0–100
    message: Mapped[str] = mapped_column(String, default="")    # human-readable step
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional reference to the entity this job is about
    actor_id: Mapped[str | None] = mapped_column(String, nullable=True)
    dub_track_id: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session: Mapped["Session"] = relationship("Session", back_populates="jobs")
