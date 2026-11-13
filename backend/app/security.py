import hashlib
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher(type=Type.ID)

# Hash válido usado quando o e-mail não existe, para o login gastar o mesmo tempo (§7.1).
HASH_FALSO = _hasher.hash(secrets.token_urlsafe(32))


def hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha: str, hash_: str) -> bool:
    try:
        return _hasher.verify(hash_, senha)
    except (VerificationError, InvalidHashError):
        return False


def check_needs_rehash(hash_: str) -> bool:
    return _hasher.check_needs_rehash(hash_)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def novo_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)
