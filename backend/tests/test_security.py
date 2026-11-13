import re

from app.security import (
    HASH_FALSO,
    check_needs_rehash,
    hash_senha,
    hash_token,
    novo_token,
    verificar_senha,
)


def test_hash_verifica_senha_certa():
    assert verificar_senha("segredo123", hash_senha("segredo123")) is True


def test_hash_recusa_senha_errada():
    assert verificar_senha("outra", hash_senha("segredo123")) is False


def test_hash_usa_argon2id_e_nao_guarda_senha_em_claro():
    h = hash_senha("segredo123")
    assert h.startswith("$argon2id$")
    assert "segredo123" not in h


def test_mesma_senha_gera_hashes_distintos():
    assert hash_senha("segredo123") != hash_senha("segredo123")


def test_hash_invalido_retorna_false_sem_lancar():
    assert verificar_senha("x", "isto-nao-e-um-hash") is False
    assert verificar_senha("x", "") is False


def test_hash_falso_e_valido_e_recusa_qualquer_senha():
    assert HASH_FALSO.startswith("$argon2id$")
    assert verificar_senha("qualquer", HASH_FALSO) is False


def test_hash_recem_criado_nao_precisa_de_rehash():
    assert check_needs_rehash(hash_senha("a")) is False


def test_token_tem_entropia_de_32_bytes_urlsafe():
    token, _ = novo_token()
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", token)


def test_tokens_sao_distintos():
    assert len({novo_token()[0] for _ in range(50)}) == 50


def test_hash_do_token_e_sha256_hex_deterministico_e_difere_do_token():
    token, h = novo_token()
    assert h == hash_token(token)
    assert re.fullmatch(r"[0-9a-f]{64}", h)
    assert h != token
    assert hash_token("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
