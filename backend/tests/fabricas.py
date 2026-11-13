"""Fábricas de dados para testes com banco real.

Tudo é criado pelas rotas reais (cadastro, convite, aceite), nunca por INSERT direto.
Uso: `def test_x(fab): casal = fab.um_casal(); casal.a.cliente.get("/api/contas")`.
"""
import itertools
import uuid
from dataclasses import dataclass, field

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

SENHA_PADRAO = "senha-de-teste-123"
# Cookie `sid` é Secure em APP_ENV=prod (padrão); com base https o cliente o devolve.
URL_BASE = "https://testserver"


@dataclass
class Pessoa:
    cliente: TestClient
    id: int
    nome: str
    email: str
    senha: str = SENHA_PADRAO


@dataclass
class Casal:
    a: Pessoa  # quem convidou
    b: Pessoa  # quem aceitou
    id: int
    convite_id: int


@dataclass
class Fabrica:
    _clientes: list[TestClient] = field(default_factory=list)
    _contador: itertools.count = field(default_factory=itertools.count)

    def cliente(self) -> TestClient:
        """TestClient novo (cookie jar próprio) com `Origin` permitido."""
        origem = get_settings().ORIGENS_PERMITIDAS[0]
        c = TestClient(app, base_url=URL_BASE, headers={"Origin": origem})
        self._clientes.append(c)
        return c

    def uma_pessoa(self, nome: str | None = None) -> Pessoa:
        n = next(self._contador)
        nome = nome or f"Pessoa {n}"
        email = f"p{n}-{uuid.uuid4().hex[:8]}@example.com"
        c = self.cliente()
        r = c.post(
            "/api/cadastro",
            json={
                "nome": nome,
                "email": email,
                "senha": SENHA_PADRAO,
                "senha_confirmacao": SENHA_PADRAO,
            },
        )
        assert r.status_code == 201, r.text
        return Pessoa(cliente=c, id=r.json()["usuario"]["id"], nome=nome, email=email)

    def entrar(self, pessoa: Pessoa) -> TestClient:
        """Novo cliente logado como `pessoa` (login pela rota)."""
        c = self.cliente()
        r = c.post("/api/sessao", json={"email": pessoa.email, "senha": pessoa.senha})
        assert r.status_code == 200, r.text
        return c

    def um_casal(self, nome_a: str | None = None, nome_b: str | None = None) -> Casal:
        """A e B cadastradas e vinculadas; A convidou, B aceitou."""
        a = self.uma_pessoa(nome_a)
        b = self.uma_pessoa(nome_b)
        r = a.cliente.post("/api/convites", json={"email": b.email})
        assert r.status_code == 201, r.text
        convite_id = r.json()["id"]
        r = b.cliente.post(f"/api/convites/{convite_id}/aceitar")
        assert r.status_code == 200, r.text
        assert r.json()["estado"] == "vinculado", r.text
        sessao = a.cliente.get("/api/sessao")
        assert sessao.status_code == 200, sessao.text
        return Casal(a=a, b=b, id=sessao.json()["casal"]["id"], convite_id=convite_id)

    def dois_casais(self) -> tuple[Casal, Casal]:
        """Dois casais independentes (CA-N.05: isolamento entre casais)."""
        return self.um_casal(), self.um_casal()

    def fechar(self) -> None:
        for c in self._clientes:
            c.close()
        self._clientes.clear()
