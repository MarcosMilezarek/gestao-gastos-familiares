from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_saude_responde_200_com_status_ok():
    resposta = client.get("/api/saude")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_app_importa_com_titulo_sistemacasal():
    assert app.title == "SistemaCasal"
