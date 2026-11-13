from decimal import Decimal

import pytest
from pydantic import BaseModel, ValidationError

from app.money import Dinheiro, para_str, porcentagem, quantizar


class Modelo(BaseModel):
    valor: Dinheiro


def test_texto_valido_vira_decimal():
    assert Modelo(valor="1234.50").valor == Decimal("1234.50")


def test_negativo_e_inteiro_em_texto_aceitos():
    assert Modelo(valor="-50.00").valor == Decimal("-50.00")
    assert Modelo(valor="7").valor == Decimal(7)


@pytest.mark.parametrize("entrada", [1.5, 10, True, None])
def test_rejeita_numero_e_nao_texto(entrada):
    with pytest.raises(ValidationError):
        Modelo(valor=entrada)


@pytest.mark.parametrize("entrada", ["1.234", "abc", "", "1,50", " 1.00", "12345678901", "1."])
def test_rejeita_texto_fora_do_padrao(entrada):
    with pytest.raises(ValidationError):
        Modelo(valor=entrada)


def test_limite_superior_aceito_e_acima_recusado():
    assert Modelo(valor="9999999999.99").valor == Decimal("9999999999.99")
    with pytest.raises(ValidationError):
        Modelo(valor=Decimal("10000000000.00"))


def test_limite_inferior_negativo_recusado():
    assert Modelo(valor="-9999999999.99").valor == Decimal("-9999999999.99")
    with pytest.raises(ValidationError):
        Modelo(valor=Decimal("-10000000000.00"))


def test_soma_sem_perda_de_ponto_flutuante():
    assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
    assert Modelo(valor="0.10").valor + Modelo(valor="0.20").valor == Decimal("0.30")


def test_quantizar_arredonda_meio_para_cima():
    assert quantizar(Decimal("0.005")) == Decimal("0.01")
    assert quantizar(Decimal("2.675")) == Decimal("2.68")
    assert quantizar(Decimal("0.004")) == Decimal("0.00")


def test_quantizar_negativo_meio_afasta_do_zero():
    assert quantizar(Decimal("-0.005")) == Decimal("-0.01")


def test_para_str_sempre_com_duas_casas_e_sem_notacao_cientifica():
    assert para_str(Decimal(5)) == "5.00"
    assert para_str(Decimal("1234.5")) == "1234.50"
    assert para_str(Decimal(-50)) == "-50.00"
    assert para_str(Decimal("1E+3")) == "1000.00"
    assert isinstance(para_str(Decimal(1)), str)


def test_porcentagem_exemplo_da_arquitetura():
    assert porcentagem(Decimal("1500.00"), Decimal("5000.00")) == Decimal("30.00")


def test_porcentagem_total_zero_retorna_none():
    assert porcentagem(Decimal(10), Decimal(0)) is None


def test_porcentagem_arredonda_meio_para_cima_na_razao_exata():
    assert porcentagem(Decimal(1), Decimal(3)) == Decimal("33.33")
    assert porcentagem(Decimal(2), Decimal(3)) == Decimal("66.67")
    assert porcentagem(Decimal(1), Decimal(8)) == Decimal("12.50")
    assert porcentagem(Decimal(1), Decimal(16)) == Decimal("6.25")
    assert porcentagem(Decimal(1), Decimal(1600)) == Decimal("0.06")
    assert porcentagem(Decimal(3), Decimal(1600)) == Decimal("0.19")


def test_porcentagem_acima_de_cem():
    assert porcentagem(Decimal(150), Decimal(100)) == Decimal("150.00")
