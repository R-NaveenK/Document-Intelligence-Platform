from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config.settings import settings

Base = declarative_base()

# Synchronous engine for standalone CLI / sync operations when PostgreSQL is enabled
engine = create_engine(
    settings.DATABASE_URL.replace("+asyncpg", ""),
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
