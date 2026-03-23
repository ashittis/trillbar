from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _run_migrations():
    """Add new columns to existing tables (idempotent)."""
    import sqlite3
    from config import BASE_DIR

    db_path = str(BASE_DIR / "trillbar.db")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        migrations = [
            "ALTER TABLE actors ADD COLUMN cleaned_audio_path TEXT",
            "ALTER TABLE actors ADD COLUMN clean_settings TEXT",
            "ALTER TABLE dub_tracks ADD COLUMN dialogue_line_id TEXT REFERENCES dialogue_lines(id)",
            "ALTER TABLE dub_tracks ADD COLUMN take_number INTEGER DEFAULT 1",
            "ALTER TABLE dub_tracks ADD COLUMN recording_source TEXT DEFAULT 'upload'",
        ]
        for sql in migrations:
            try:
                cursor.execute(sql)
            except sqlite3.OperationalError:
                pass  # column already exists
        conn.commit()
        conn.close()
    except Exception:
        pass


def init_db():
    from db import models  # noqa: F401 — import to register models
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
