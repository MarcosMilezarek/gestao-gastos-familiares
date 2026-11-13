from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import MetaData, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

CONVENCAO_NOMES = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCAO_NOMES)


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().DATABASE_URL,
        connect_args={"init_command": "SET time_zone = '+00:00'"},
        pool_pre_ping=True,
        isolation_level="READ COMMITTED",
    )


SessionLocal = sessionmaker()


def get_db() -> Iterator[Session]:
    with SessionLocal(bind=get_engine()) as db:
        yield db
