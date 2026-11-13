# Fatia 4: Cartão de crédito e fatura

> Só o que é da fatia 4. Convenções: `comum.md` §4 (modelo físico), §5.2 (visibilidade), §6 (API, dinheiro, erros), §7.3 (autorização). Lançamentos, saldos, `ALVOS_*`, ganchos e `tempo.py`: `fatia-2.md`, `fatia-1.md` §4.10. Recorrência e alcance de lançamentos: `fatia-3.md` §3.1 e §4.5. Telas e componentes: `front.md`.
> Pré-requisito: fatias 1 a 3 integradas. Migrações desta fatia: `0006` a `0008`.

## 1. Escopo e RF cobertos

Cartão (cadastro, limite), fatura por mês (datas, status, valor com crédito de estorno), compras à vista, parceladas e recorrentes, estorno, ajuste, pagamento inteiro da fatura e desfazer pagamento, e os pontos em que a fatura entra nas outras fatias: saldo previsto da conta dona (RG-06), base do aporte e gasto por categoria do mês da fatura (RF-4.15). Pagamento parcial, antecipação de parcelas e gráficos do cartão estão fora da v1.

## 2. Tabelas e migrações

Convenções de `comum.md` §4. Dinheiro `DECIMAL(12,2)`; FKs `ON DELETE RESTRICT`; enumerações `VARCHAR` + `CHECK`; `criado_em`/`atualizado_em` em todas as tabelas de negócio. **Nenhuma tabela guarda saldo, total de fatura, limite usado ou status** (todos derivados, §4.1 e §4.2; `comum.md` §4).

### 2.1 Migração `0006_cartao_fatura`

**`cartao`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| conta_id | BIGINT UNSIGNED | NOT NULL, FK conta (conta dona; **não muda** depois de criado, D3) |
| nome | VARCHAR(60) | NOT NULL |
| limite | DECIMAL(12,2) | NOT NULL, `ck_cartao_limite` `limite > 0` |
| dia_fechamento | TINYINT UNSIGNED | NOT NULL, `ck_cartao_dia_fechamento` entre 1 e 31 |
| dia_vencimento | TINYINT UNSIGNED | NOT NULL, `ck_cartao_dia_vencimento` entre 1 e 31 |
| bandeira | VARCHAR(30) | NULL |
| criado_em, atualizado_em | DATETIME(6) | |

Índice `ix_cartao_conta_id`. O casal do cartão é o da conta (`comum.md` §5.2: cartão herda via conta); não há `casal_id` aqui.

**`fatura`** (uma linha por cartão e mês, criada sob demanda quando algo se liga a ela, §4.2)
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| cartao_id | BIGINT UNSIGNED | NOT NULL, FK cartao |
| mes_ref | DATE | NOT NULL, dia 1 = **mês do vencimento** (RF-4.03) |
| criado_em | DATETIME(6) | |

`uq_fatura_cartao_id_mes_ref (cartao_id, mes_ref)`. A fatura **não guarda** datas de fechamento e vencimento: são calculadas dos dias do cartão e de `mes_ref` (§4.1).

### 2.2 Migração `0007_item_fatura`

**`serie_cartao`** (agrupa as parcelas de uma compra parcelada ou as ocorrências de uma compra recorrente)
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| cartao_id, conta_id | BIGINT UNSIGNED | NOT NULL, FKs cartao e conta (`conta_id` = conta dona, cópia imutável) |
| tipo | VARCHAR(20) | NOT NULL, `ck_serie_cartao_tipo` IN (`parcelada`,`recorrente`) |
| descricao | VARCHAR(120) | NOT NULL (descrição base, sem "(n/N)") |
| valor | DECIMAL(12,2) | NOT NULL `> 0`: parcelada = valor **total**; recorrente = valor de cada ocorrência |
| categoria_id | BIGINT UNSIGNED | NOT NULL, FK categoria |
| observacao | VARCHAR(500) | NULL |
| criado_por_id | BIGINT UNSIGNED | NOT NULL, FK usuario |
| data_inicial | DATE | NOT NULL (data da primeira compra) |
| dia | TINYINT UNSIGNED | NOT NULL, `ck_serie_cartao_dia` `dia BETWEEN 1 AND 31` (como `recorrencia.dia`, `fatia-3.md` §2.2). Recorrente: o dia da **primeira** data, nunca o já ajustado ao mês curto; muda na edição com `este_e_pendentes`/`todos` (§4.5). Parcelada: `data.day`, sem uso no cálculo (a data é igual em todas as parcelas), mas preenchido e validado pela mesma `CHECK` |
| mes_fatura_inicial | DATE | NOT NULL, `mes_ref` da fatura da 1ª parcela/ocorrência |
| numero_final | INT | parcelada: N (2 a 36), NOT NULL; recorrente: NULL = sem fim, senão a última ocorrência permitida. `ck_serie_cartao_final`: `tipo = 'recorrente' OR numero_final IS NOT NULL` |
| gerado_ate | INT | NOT NULL DEFAULT 0 (maior número já gerado; parcelada nasce com `gerado_ate = numero_final`) |
| criado_em, atualizado_em | DATETIME(6) | |

Índices `ix_serie_cartao_cartao_id`, `ix_serie_cartao_conta_id`, `ix_serie_cartao_categoria_id`. **`serie_cartao_tag`**: `serie_cartao_id` (FK), `tag_id` (FK), PK composta, `ix_serie_cartao_tag_tag_id` (tags do modelo para as ocorrências ainda não geradas).

**`item_fatura`** (compra, parcela, ocorrência, estorno ou ajuste; **não** é `lancamento`, D1)
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| fatura_id | BIGINT UNSIGNED | NOT NULL, FK fatura |
| conta_id | BIGINT UNSIGNED | NOT NULL, FK conta (conta dona do cartão, cópia imutável; localiza a pessoa nos `ALVOS_*` e filtra balanços sem join) |
| tipo | VARCHAR(10) | NOT NULL, `ck_item_fatura_tipo` IN (`compra`,`estorno`,`ajuste`) |
| valor | DECIMAL(12,2) | NOT NULL; `ck_item_fatura_valor`: `(tipo = 'ajuste' AND valor <> 0) OR (tipo <> 'ajuste' AND valor > 0)`. Estorno é gravado **positivo** e tratado como negativo na fatura (§4.1); ajuste tem sinal |
| data | DATE | NOT NULL (data da compra, do estorno ou do ajuste) |
| descricao | VARCHAR(120) | NOT NULL (base, sem "(n/N)"; ajuste: `Reajuste de fatura`) |
| categoria_id | BIGINT UNSIGNED | NULL, FK categoria; `ck_item_fatura_categoria` `(tipo = 'ajuste') = (categoria_id IS NULL)` (o ajuste não tem categoria; é exibido como "Reajuste de fatura", D5) |
| observacao | VARCHAR(500) | NULL |
| serie_id | BIGINT UNSIGNED | NULL, FK serie_cartao |
| numero_serie | INT | NULL; `ck_item_fatura_serie` `(serie_id IS NULL) = (numero_serie IS NULL)` e `serie_id IS NULL OR tipo = 'compra'` |
| item_origem_id | BIGINT UNSIGNED | NULL, FK item_fatura (estorno -> compra ou parcela); `ck_item_fatura_origem` `item_origem_id IS NULL OR tipo = 'estorno'` |
| criado_por_id | BIGINT UNSIGNED | NOT NULL, FK usuario |
| criado_em, atualizado_em | DATETIME(6) | |

`uq_item_fatura_serie_id_numero_serie (serie_id, numero_serie)`. Índices `ix_item_fatura_fatura_id`, `ix_item_fatura_conta_id`, `ix_item_fatura_categoria_id`, `ix_item_fatura_item_origem_id`.
**`item_fatura_tag`**: `item_fatura_id` (FK), `tag_id` (FK), PK composta, `ix_item_fatura_tag_tag_id`.

### 2.3 Migração `0008_lancamento_pagamento_fatura`

O pagamento da fatura é um `lancamento` (D2). Altera `lancamento` (`fatia-2.md` §2.2):
- Elementos: `fatura_id` BIGINT UNSIGNED NULL, FK `fatura`; `uq_lancamento_fatura_id (fatura_id)` (no máximo um pagamento por fatura; `NULL` não colide); `ck_lancamento_tipo` passa a aceitar `pagamento_fatura` (a revisão apaga e recria a `CHECK`); `ck_lancamento_fatura` `(tipo = 'pagamento_fatura') = (fatura_id IS NOT NULL)`. Nomes das `CHECK` com `op.f` (D-030).
- As demais `CHECK` de `lancamento` já servem: `valor > 0`, `categoria_id`, `conta_destino_id` e `dono_usuario_id` nulos para o tipo novo.
- **Ordem do `upgrade()`:** coluna, `uq_lancamento_fatura_id`, FK, `ck_lancamento_tipo` (drop e create), `ck_lancamento_fatura`.
- **Ordem do `downgrade()`:** `ck_lancamento_tipo` restaurada **primeiro** (falha, com a mensagem do MySQL, se houver `pagamento_fatura` gravado), depois `ck_lancamento_fatura`, a FK, `uq_lancamento_fatura_id` e a coluna. Motivo: o MySQL recusa apagar índice usado por FK (a FK sai antes de `uq_`) e coluna citada em `CHECK` (`ck_lancamento_fatura` sai antes da coluna); restaurar `ck_lancamento_tipo` primeiro faz o `downgrade()` falhar logo, sem deixar a migração pela metade.

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória; ids de outro casal respondem `404 NAO_ENCONTRADO` (`comum.md` §6.3). Referência a recurso **no corpo** que não existe ou é de outro casal: `422 VALIDACAO` genérico (`fatia-2.md` §3, D10). `{mes}` no caminho é `AAAA-MM` validado por `tempo.validar_mes`. Dinheiro e porcentagem conforme `comum.md` §6.2.

### 3.0 Objetos de saída
```
CartaoSaida = { "id": 2, "nome": "Nubank", "conta_id": 3, "dono_usuario_id": 1 | null,   // null = conta conjunta
                "limite": "5000.00", "dia_fechamento": 10, "dia_vencimento": 17, "bandeira": "Visa" | null,
                "conta_arquivada": false,
                "limite_usado": "1500.00", "limite_disponivel": "3500.00", "uso_porcentagem": "30.00",
                "fatura_corrente": FaturaResumo }              // fatura cujo mes_ref é o mês de hoje() (RF-4.06)
FaturaResumo = { "cartao_id": 2, "cartao_nome": "Nubank", "conta_id": 3, "mes": "2026-03", "id": 14 | null,   // nulo = sem linha em `fatura` (a linha pode existir sem item; D-040, D-043)
                 "status": "aberta" | "fechada" | "vencida" | "zerada" | "paga",
                 "fechamento": "2026-03-10", "vencimento": "2026-03-17", "valor": "800.00",
                 "pagamento": null | { "lancamento_id": 90, "data": "2026-03-12", "situacao": "confirmada" | "prevista", "valor": "800.00" } }
ItemFaturaSaida = { "id": 7, "tipo": "compra" | "estorno" | "ajuste",
                    "valor": "-50.00",                  // valor NA FATURA: compra positiva, estorno negativo, ajuste com sinal
                    "data": "2026-03-05",
                    "descricao": "Geladeira (1/6)", "descricao_base": "Geladeira",   // "(n/N)" só em série parcelada
                    "categoria": null | { "id": 5, "nome": "Mercado", "pai_nome": "Gastos variáveis", "cor": "#F9A825", "icone": "shopping-cart" },
                    "tags": [ TagSaida ], "observacao": null,
                    "serie": null | { "id": 4, "tipo": "parcelada" | "recorrente", "numero": 1, "total": 6 | null },
                    "item_origem_id": null, "fatura_mes": "2026-03", "fatura_paga": false,
                    "criado_por": { "id": 1, "nome": "Ana" } }
FaturaSaida = FaturaResumo + { "bruto": "800.00",
                               "credito_recebido": "0.00",     // crédito de estorno de fatura anterior aplicado aqui (exibido como linha "Crédito de estorno")
                               "credito_repassado": "0.00",    // crédito que sobrou e segue para a próxima fatura
                               "itens": [ ItemFaturaSaida ],   // ordem: data, id
                               "conta_arquivada": false,
                               "pode_pagar": true,             // conta ativa, valor > 0 e sem pagamento (confirmado ou previsto)
                               "editavel": true }              // conta ativa e fatura não paga (RF-4.18, RF-4.19)
```
`valor` da fatura = `max(bruto − crédito recebido, 0)` para fatura não paga (§4.1); para fatura paga, o valor do pagamento. O front não soma nada (`front.md` §7).

### 3.1 Cartões (RF-4.01, RF-4.05, RF-4.06, RF-4.18)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/cartoes` | `?arquivadas=true\|false` (padrão `false`: cartões de conta ativa; `true`: de conta arquivada, só consulta) | `{ "cartoes": [CartaoSaida], "limite_disponivel_total": "…", "total_faturas_mes": "…" }`; os dois totais somam só cartões de conta **ativa** (`null` com `arquivadas=true`). `total_faturas_mes` (D-012, RF-4.06) = soma do `valor` das faturas do **mês exibido** (a tela Cartões não tem seletor de mês: o mês corrente), pagas ou não, dos cartões de conta ativa; equivale à soma de `fatura_corrente.valor` dos `cartoes` da resposta. Já `limite_disponivel_total` usa `limite_usado`, que continua somando **todas** as faturas não pagas, de qualquer mês (§4.2). O campo teve o nome trocado porque o nome anterior descrevia a regra antiga | 422 |
| `POST /api/cartoes` | `{ nome, conta_id, limite, dia_fechamento, dia_vencimento, bandeira? }` | `201` `CartaoSaida` | 409 `CONTA_ARQUIVADA`; 422 (`limite` ≤ 0, dia fora de 1..31, ausentes; `conta_id` inexistente ou de outro casal) |
| `GET /api/cartoes/{id}` | - | `CartaoSaida` | 404 |
| `PATCH /api/cartoes/{id}` | `{ nome?, limite?, dia_fechamento?, dia_vencimento?, bandeira? }` (a conta dona não muda) | `CartaoSaida` | 404; 409 `CONTA_ARQUIVADA`; 422 |
| `DELETE /api/cartoes/{id}` | - | `204` (só sem nenhum item, série nem pagamento de fatura) | 404; 409 `CARTAO_COM_COMPRAS`; 409 `CONTA_ARQUIVADA` |

### 3.2 Faturas (RF-4.03, RF-4.04, RF-4.07)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/cartoes/{id}/faturas/{mes}` | - | `FaturaSaida` (mês sem linha em `fatura`: valor `0.00`, `id` nulo) | 404; 422 `mes` |
| `GET /api/cartoes/{id}/faturas` | `?de=AAAA-MM&ate=AAAA-MM` (janela de até 36 meses; padrão: do mês de hoje −2 a +12) e `?data=AAAA-MM-DD` (opcional) | `{ "sugerida": "2026-04" \| null, "faturas": [FaturaResumo] }`; `sugerida` = fatura onde cai uma compra nessa data (RF-4.03); alimenta o seletor "fatura de destino" (a fatura paga vem marcada pelo `status`) | 404; 422 |

`?data=` passa por `tempo.validar_data(data, hoje)` (erro em `campos.data`); `de` e `ate` por `tempo.validar_mes` (erro em `campos.mes`, como o `{mes}` do caminho).

### 3.3 Compras, estornos, ajuste, edição e exclusão (RF-4.08 a 4.13, 4.16 a 4.19)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `POST /api/cartoes/{id}/compras` | `CompraEntrada` (abaixo) | `201` `ItemFaturaSaida` da **primeira** parcela ou ocorrência (ou da compra) | 409 `CONTA_ARQUIVADA`, `FATURA_PAGA`, `CATEGORIA_TIPO_INVALIDO`, `CATEGORIA_ARQUIVADA`; 422 |
| `POST /api/cartoes/{id}/estornos` | `EstornoEntrada` | `201` `ItemFaturaSaida` | 409 `CONTA_ARQUIVADA`, `FATURA_PAGA`, `ESTORNO_SUPERA_COMPRA`, `CATEGORIA_*`; 422 |
| `POST /api/cartoes/{id}/faturas/{mes}/ajuste` | `{ "valor_banco": "760.00" }` (zero ou maior) | `200` `{ "item": ItemFaturaSaida \| null, "fatura": FaturaSaida }` (não é `201`: a resposta pode não ter criado item); `item` nulo quando a diferença é zero (CA-4.17) | 404; 409 `CONTA_ARQUIVADA`, `FATURA_PAGA`; 422 (valor negativo) |
| `GET /api/itens-fatura/{id}` | - | `ItemFaturaSaida` | 404 |
| `PATCH /api/itens-fatura/{id}` | campos de `CompraEntrada`/`EstornoEntrada` opcionais, mais `fatura_mes?`; `?alcance=somente_este\|este_e_pendentes\|todos` | `ItemFaturaSaida` (o item escolhido) | 404; 409 `CONTA_ARQUIVADA`, `FATURA_PAGA`, `ITEM_NAO_EDITAVEL` (ajuste), `ESTORNO_SUPERA_COMPRA`; 422 |
| `DELETE /api/itens-fatura/{id}` | `?alcance=` | `204` | 404; 409 `CONTA_ARQUIVADA`, `FATURA_PAGA`, `COMPRA_COM_ESTORNO` |

```
CompraEntrada  = { "valor": "1200.00",          // > 0; em compra parcelada é o valor TOTAL
                   "data": "2026-03-05", "descricao": "Geladeira", "categoria_id": 5,
                   "fatura_mes"?: "2026-03",     // omitido = fatura sugerida pela data (RF-4.03)
                   "tag_ids"?: [1], "observacao"?: "…",
                   "parcelas"?: 6,               // inteiro de 2 a 36
                   "recorrencia"?: { "modo": "sem_fim" } | { "modo": "n_meses", "meses": 12 } }   // 2 a 60, igual a fatia-3.md §3.1
EstornoEntrada = { "valor": "50.00", "data", "descricao", "categoria_id", "fatura_mes"?, "item_origem_id"?: 7, "tag_ids"?, "observacao"? }
```
- Não há campo de dono, conta nem situação (RF-4.02, RF-4.13).
- **Onde cada validação mora** (`main.py` manda todo erro de `model_validator` do schema para `campos.corpo`, então a regra que precisa de chave própria fica no service): `parcelas` fora de 2..36 fica no **schema** (`Field`, `campos.parcelas`; 1x e 37x recusados, CA-4.09). `parcelas` e `recorrencia` juntos e `recorrencia.meses` fora de 2..60 ficam no **service** (`itens_base.validar_item`), com `422` em `campos.parcelas` ("Escolha parcelada ou recorrente") e `campos.recorrencia`. A última parcela também respeita o limite de `tempo.validar_mes`.
- `data` passa por `tempo.validar_data(data, hoje)` (2000-01-01 a `hoje + 10 anos`, erro em `campos.data`); `fatura_mes` por `tempo.validar_mes`, com o erro reescrito para `campos.fatura_mes` (a função devolve `campos.mes`); `descricao` 1 a 120; `observacao` até 500; `tag_ids` sem repetição (iguais a `fatia-2.md` §3.4).
- `alcance` é obrigatório quando o item pertence a uma série (`serie != null`): ausente -> `422` (`campos.alcance`); item avulso ignora `alcance` (CA-4.11). Regras de `alcance` em série (mesma regra de §4.5 Editar, D7 e D-045; fora delas, `422` em `campos.alcance`): (a) o modelo da recorrente (`serie_cartao` e `serie_cartao_tag`) só muda em `este_e_pendentes` e `todos`, `somente_este` não o toca; (b) `fatura_mes` na recorrente só em `somente_este`; (c) `data` na parcelada só em `somente_este`; (d) `valor` e `fatura_mes` na parcelada só em `somente_este`, e em `este_e_pendentes`/`todos` valem `descricao`, `categoria_id`, `tag_ids`, `observacao`; (e) na recorrente, `valor`, `descricao`, `categoria_id`, `tag_ids`, `observacao` valem em qualquer alcance; (f) `data` da recorrente: `somente_este` muda só a data daquele item (modelo intacto, `fatia-3.md` §4.5); `este_e_pendentes` e `todos` exigem `data` no mês nominal da ocorrência `n` (`mes_ref(data_do_item(serie, n))`, erro em `campos.data`), o dia enviado vira `serie.dia` e cada item do conjunto recebe `data_do_item(serie, k)`; (g) em `todos`, o estado resultante de cada item é validado na fatura do próprio item, ignorando fatura paga; em `somente_este` e `este_e_pendentes` a fatura paga continua recusando (`FATURA_PAGA`).

### 3.4 Pagamento da fatura (RF-4.14, RF-4.20)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `POST /api/cartoes/{id}/faturas/{mes}/pagamento` | `{ "data"?: "2026-03-12" }` (padrão hoje) | `201` `FaturaSaida` | 404; 409 `CONTA_ARQUIVADA`, `FATURA_ZERADA`, `FATURA_JA_PAGA`, `PAGAMENTO_PREVISTO_EXISTE`; 422 `data` |
| `POST /api/cartoes/{id}/faturas/{mes}/pagamento/confirmar` | - | `FaturaSaida` | 404; 409 `CONTA_ARQUIVADA`, `PAGAMENTO_INEXISTENTE`, `PAGAMENTO_JA_CONFIRMADO`, `FATURA_ZERADA` |
| `DELETE /api/cartoes/{id}/faturas/{mes}/pagamento` | - | `204` (desfaz o pagamento confirmado **ou** cancela o previsto) | 404; 409 `CONTA_ARQUIVADA`, `PAGAMENTO_INEXISTENTE` |

O valor do pagamento é sempre o total da fatura no momento (não há campo de valor nem de conta de origem, CA-4.14). Editar, excluir ou confirmar o `lancamento` do pagamento pelas rotas de `fatia-2.md` §3.4 é recusado (`LANCAMENTO_NAO_EDITAVEL`, §4.7).

### 3.5 Códigos de erro da fatia (acrescentados em `errors.py`)
Todos 409: `FATURA_PAGA` ("Fatura já paga: escolha outra fatura ou desfaça o pagamento"), `FATURA_ZERADA`, `FATURA_JA_PAGA`, `PAGAMENTO_PREVISTO_EXISTE`, `PAGAMENTO_INEXISTENTE`, `PAGAMENTO_JA_CONFIRMADO`, `CARTAO_COM_COMPRAS`, `ESTORNO_SUPERA_COMPRA`, `COMPRA_COM_ESTORNO`, `ITEM_NAO_EDITAVEL`. Reutiliza `CONTA_ARQUIVADA`, `CATEGORIA_*`, `LANCAMENTO_NAO_EDITAVEL`, `NAO_ENCONTRADO`, `VALIDACAO`.

## 4. Regras dos services

### 4.1 Cálculo puro (`services/fatura_calculo.py`; sem `Session`, sem `fastapi`, sem `float`)
- `dia_no_mes(mes_ref, dia) -> date` = `min(dia, último dia do mês)` ("dia inexistente vale o último dia", RF-4.01).
- `datas_da_fatura(mes_ref, dia_fech, dia_venc) -> (fechamento, vencimento)`: `vencimento = dia_no_mes(mes_ref, dia_venc)`; o fechamento cai em `mes_ref` se `dia_venc > dia_fech` (comparação dos **números** dos dias, não das datas ajustadas) e no mês anterior caso contrário; `fechamento = dia_no_mes(mês do fechamento, dia_fech)`.
- `mes_da_fatura(data, dia_fech, dia_venc) -> date` (`mes_ref`): `fecha_neste = data.day <= dia_no_mes(mes_ref(data), dia_fech).day`; mês de fechamento = `mes_ref(data)` se `fecha_neste`, senão o seguinte; `mes_ref` = mês de fechamento, mais um mês quando `dia_venc <= dia_fech`. Confere CA-4.03 (fecha 10/vence 17: 10/03 e 05/03 -> março, 11/03 -> abril; fecha 25/vence 5: 20/03 -> abril, 26/03 -> maio).
- `status_fatura(total, paga, hoje, fechamento, vencimento) -> str`: `paga` se paga; `aberta` se `hoje <= fechamento`; `zerada` se `total == 0`; `fechada` se `hoje <= vencimento`; senão `vencida`. A fatura zerada nunca vira vencida; se o total voltar a ser positivo o status volta pelas datas (RF-4.04).
- **Totais em cadeia** (RF-4.05, RF-4.16): `totais_em_cadeia(faturas: Sequence[EntradaFatura]) -> list[TotalFatura]`, com `EntradaFatura(mes, bruto, pago)` ordenadas por `mes` e `TotalFatura(mes, total, credito_recebido, credito_repassado)`. `bruto` = soma dos itens com sinal (compra +, estorno −, ajuste ±); `pago` = valor do pagamento **confirmado** ou `None`. Com `carry` (crédito pendente) começando em 0:
  - fatura não paga: `total = max(bruto − carry, 0)`; `carry_novo = max(carry − bruto, 0)`; `credito_recebido = min(carry, max(bruto, 0))`;
  - fatura paga: `total = pago`; `absorvido = max(bruto − pago, 0)`; `carry_novo = max(carry − absorvido, 0)`; `credito_recebido = min(carry, absorvido)` (a fatura paga está congelada e não recebe crédito novo, mas o que absorveu até pagar não é reaproveitado depois);
  - `credito_repassado = carry_novo`; o `carry` segue para a próxima fatura da lista (meses sem linha em `fatura` não absorvem nada).
  Confere CA-4.23: estorno 900 em 800 com seguinte 700 -> 0 e 600; estorno 1000 em 800 (bruto −200) com 50 e 300 -> 0, 0 e 150. Nenhum total é negativo.
- `dividir_parcelas(total, n) -> list[Decimal]`: em centavos inteiros, `base = total_c // n` para todas e a primeira recebe `total_c − base * (n − 1)` (RF-4.09). Confere 100,00 em 3x (33,34 + 33,33 + 33,33) e em 7x (14,32 + 6 x 14,28).
- Usa `money.porcentagem(parte, total) -> Decimal | None` (já existe em `app/money.py`: "meio para cima" em 2 casas de percentual, `None` se `total == 0`; é a mesma de `fatia-3.md` §4.6 e vale também para as fatias 5, 6 e 7). Esta fatia não altera `money.py`.

### 4.2 Carga das faturas, limite e ganchos (`services/faturas.py`)
`FaturaCalculada` (dataclass): `cartao_id`, `conta_id`, `mes`, `id | None`, `fechamento`, `vencimento`, `bruto`, `total`, `credito_recebido`, `credito_repassado`, `status`, `tem_itens`, `pagamento` (`PagamentoInfo(lancamento_id, data, situacao, valor)` ou `None`).

- `calcular(db, cartao_ids, *, ate_mes=None, mes_corte_recorrente=None, hoje=None) -> dict[int, list[FaturaCalculada]]`: **duas consultas** para todos os cartões: (1) `fatura` (com `mes_ref <= ate_mes`, se vier) com `bruto = SUM(CASE tipo WHEN 'estorno' THEN -valor ELSE valor END)` e a contagem de itens, `LEFT JOIN` em `item_fatura` (com `mes_corte_recorrente`, ignora itens de série `recorrente` cuja fatura tem `mes_ref > corte`); (2) pagamentos (`lancamento.fatura_id` dessas faturas). Monta `EntradaFatura` por cartão (ordem de `mes_ref`), chama `totais_em_cadeia` e `datas_da_fatura` (dias lidos de `cartao`), `status_fatura`. Cálculo é todo em `Decimal`.
- `fatura_virtual(cartao, mes, hoje) -> FaturaCalculada`: função **sem consulta**; fatura de um mês sem linha em `fatura` (`id` nulo, bruto e total 0, sem pagamento, `tem_itens = False`), com `fechamento`/`vencimento` de `datas_da_fatura` e `status_fatura` por data.
- `calcular_mes(db, cartao, mes, hoje=None) -> FaturaCalculada`: `calcular(db, [cartao.id], ate_mes=mes)` (a cadeia até o mês, para o crédito) e escolhe a fatura de `mes`; se não há linha, `fatura_virtual(cartao, mes, hoje)`. Não faz consulta própria por cartão.
- `obter_ou_criar(db, cartao, mes) -> Fatura`: `INSERT ... ON DUPLICATE KEY UPDATE id = id` (`sqlalchemy.dialects.mysql.insert(...).on_duplicate_key_update(id=Fatura.id)`) e `SELECT` (a corrida é decidida por `uq_fatura_cartao_id_mes_ref`; só a chave única é absorvida, qualquer outro erro propaga, I6); usada só na escrita. **Leituras nunca criam `fatura`.**
- `travar_cartao(db, ctx, cartao_id, conta_ativa=True) -> Cartao` (D-046): `cartao_visivel` (404), depois `SELECT ... FOR UPDATE` do cartão com `populate_existing=True`; com `conta_ativa`, conta arquivada -> `CONTA_ARQUIVADA`. É a **única** trava de cartão: toda escrita que muda o total de uma fatura (compra, estorno, ajuste, edição e exclusão de item, geração de série, pagamento) passa por ela. `garantir_ate` passa `conta_ativa=False` (já filtra conta ativa e reconfere a série travada).
- `limite_usado(db, cartao_ids) -> dict[int, Decimal]`: soma do `total` das faturas **não pagas** de qualquer mês, chamando `calcular` com `mes_corte_recorrente = mes_ref(hoje)` (ocorrências futuras de compra recorrente não ocupam limite hoje; parcelas ocupam todas, D6). `limite_disponivel = limite − usado` (pode ficar negativo; não é truncado); `uso_porcentagem = money.porcentagem(usado, limite)` (CA-4.05: 1.500 de 5.000 = 30,00%).
- `faturas_do_mes(db, ctx, mes, conta_ids=None) -> list[FaturaCalculada]`: faturas de cartões das contas visíveis (ativas, ou as de `conta_ids`) com `mes_ref == mes` e `tem_itens` **ou** pagamento, previsto ou confirmado (D-040, D-043): só a fatura sem itens **e** sem pagamento deixa de virar linha (RF-5.07); a fatura que já tem pagamento continua na lista mesmo sem itens (por exemplo, depois de `todos`, RF-4.11). Usada pela fatia 5 (lista, início).
- `gasto_cartao(db, conta_ids, mes) -> list[GastoCartao]` com `GastoCartao(cartao_id, conta_id, categoria_id | None, status, paga, total)`: uma consulta agrupada por `(cartao, conta, categoria, fatura)` dos itens cuja fatura tem `mes_ref == mes`, com `total = compras + ajustes − estornos` (nível de **item**, RF-4.15: o crédito repassado não muda o gasto do mês, só a obrigação de pagar); `status` e `paga` vêm da fatura calculada. É o insumo de balanço, categorias, orçamento e base do aporte (fatias 5, 7).
- `sincronizar_pagamentos(db, cartao_id)`: depois de **toda** mutação de item, para cada fatura do cartão com pagamento **previsto**: recalcula o total; se `0`, apaga o `lancamento` do pagamento; senão grava o novo `valor` (o pagamento previsto acompanha a fatura até ser confirmado, D4). Pagamento confirmado nunca é tocado.
- **Ganchos** (`services/ganchos.py`, `fatia-2.md` §4.9 e `fatia-3.md` §4.8):
  - `ajuste_cartao_previsto(db, conta_ids, ate) -> dict[int, Decimal]`: para cada conta, soma do `total` das faturas dos cartões da conta com `mes_ref <= mes_ref(ate)`, `vencimento <= ate`, `total > 0` e **sem nenhum pagamento** (nem confirmado nem previsto); vale também para conta arquivada (é regra de saldo, não de escrita). Faturas com pagamento previsto já entram em `saldos_previstos` pelo próprio lançamento previsto na data do pagamento (sem dupla contagem, CA-4.24); fatura paga já está no saldo atual. Valor positivo, subtraído por `saldos_previstos`. O dicionário traz **toda** conta de `conta_ids`, com `0.00` se ela não tiver fatura nessas condições: `saldos_previstos` faz `ajustes[c]` e uma conta ausente daria `KeyError` (t88r S2).
  - `base_cartao_conjunta(db, casal_id, mes) -> Decimal`: soma de `gasto_cartao` das contas conjuntas do casal (`conta.casal_id = casal_id`) no mês da fatura, todas as situações (RF-4.15, CA-4.15).
  - `antes_de_ler_periodo(db, ctx, ate)` passa a chamar também `series_cartao.garantir_ate`.

### 4.3 Cartões (`services/cartoes.py`)
- `criar`: `conta_visivel` (corpo inválido -> `VALIDACAO`), conta arquivada -> `CONTA_ARQUIVADA`; sem restrição de dono (a pessoa pode cadastrar cartão na individual do parceiro, RG-02, como lança despesa nela). `limite > 0`, dias 1..31 (também no schema).
- `editar`: conta arquivada -> `CONTA_ARQUIVADA`. Mudar os dias **não move itens** de fatura: só recalcula as datas das faturas existentes (D3).
- `excluir`: existe item ou série do cartão, **ou fatura com pagamento** (`lancamento.fatura_id`, previsto ou confirmado), -> `CARTAO_COM_COMPRAS`; senão apaga as `fatura` sem item e sem pagamento e o cartão. Motivo: fatura que ficou sem itens depois de `todos` (RF-4.11) ainda pode ter pagamento, e apagá-la violaria a FK de `lancamento.fatura_id` (500).
- `listar(db, ctx, arquivadas)`: cartões por `cartao_visivel`/`filtro_contas` (arquivada = conta arquivada); `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(hoje))` antes; `faturas.limite_usado` e uma única chamada de `faturas.calcular(db, ids_dos_cartões, ate_mes=mes_ref(hoje))` para **todos** os cartões; a `fatura_corrente` de cada um é a de `mes_ref(hoje)` dessa carga ou, onde não há linha, `faturas.fatura_virtual(cartao, mes_ref(hoje), hoje)` (nada de `calcular_mes` em laço: seria uma carga por cartão). Totais em `Decimal`: `limite_disponivel_total` por `limite_usado`; `total_faturas_mes` = Σ `valor` das `fatura_corrente` dos cartões de conta ativa (nenhuma consulta nova, §3.1).
- `acesso.py` ganha `cartao_visivel(db, ctx, id) -> Cartao` e `item_fatura_visivel(db, ctx, id) -> ItemFatura` (pela `conta_id`), ambos `AppError(404, NAO_ENCONTRADO)`.

### 4.4 Itens: compra, estorno, ajuste (`services/itens_base.py` e `services/itens_fatura.py`)
`itens_base.py` (primitivas, sem casos de uso; importado por séries e itens). **Não importa `services.lancamentos`** (nem `invalido`, `validar` ou `substituir_tags` de lá): `ganchos` -> `series_cartao` -> `itens_base` -> `lancamentos` -> `ganchos` fecharia um ciclo de importação. Tem **erro próprio** (`invalido(campo, mensagem) -> AppError(422, VALIDACAO, campos={campo: mensagem})`, no mesmo formato de `lancamentos.invalido`) e valida categoria e tags direto por `acesso.py` (`categoria_visivel` etc.) e pelos modelos; o que `lancamentos` já faz para a mesma regra não é chamado, é reescrito aqui (duplicação pequena aceita para manter `ganchos` sem ciclo):
- `validar_item(db, ctx, cartao, dados, tipo, mes=None, ignorar_fatura_paga=False)`: `mes` (opcional) é o mês da fatura **do item** validado e é usado no lugar de `fatura_mes`/`mes_da_fatura` (a edição de série valida o estado resultante de cada item na fatura dele, §4.5); `ignorar_fatura_paga` (padrão falso; só o alcance `todos` passa verdadeiro, D-045) suprime a recusa por fatura paga abaixo, sem reabrir a fatura. Os outros chamadores não mudam. Conta do cartão arquivada -> `CONTA_ARQUIVADA` (RF-4.18); categoria (compra e estorno): `categoria_visivel` (senão `VALIDACAO`), tipo `despesa` (`CATEGORIA_TIPO_INVALIDO`), não arquivada (`CATEGORIA_ARQUIVADA`, exceto manter a mesma na edição); tags visíveis; fatura de destino: `fatura_mes` ou a sugerida por `mes_da_fatura`; **fatura paga (pagamento confirmado) -> `FATURA_PAGA`** (RF-4.19, também ao mover item para outra fatura); `fatura_mes` dentro de `validar_mes` (erro em `campos.fatura_mes`); `data` por `validar_data`; `parcelas` junto de `recorrencia` e `recorrencia.meses` fora de 2..60 (§3.3).
- `gravar_item(...)`: usa `faturas.obter_ou_criar`, grava `item_fatura` (com `conta_id = cartao.conta_id`, `criado_por_id` só na criação) e `item_fatura_tag`.
- `saida_item(...)`: monta `ItemFaturaSaida` (valor com sinal; "(n/N)" só em série `parcelada`: `numero`/`total`; `descricao_base`); carrega categorias e tags por `IN`.

`itens_fatura.py` (casos de uso, uma transação cada; termina com `faturas.sincronizar_pagamentos` e `commit`):
- **Trava do cartão (D-046).** `criar_compra`, `criar_estorno`, `ajustar`, `editar` e `excluir` de item avulso chamam `faturas.travar_cartao(db, ctx, cartao_id)` (§4.2) **antes** de validar e de ler a fatura: a trava faz a visibilidade (`cartao_visivel`, 404) e a recusa de conta arquivada (`CONTA_ARQUIVADA`), então a recusa de conta vem antes de qualquer outra regra. No avulso o `cartao_id` vem da fatura do item (`_conferir_avulso`); no de série, de `series_cartao` (§4.5). O motivo é fechar a corrida com `pagar`/`confirmar` (o pagamento gravado teria total diferente do da fatura); alternativa descartada: aceitar o risco como em D-032 (o erro é dinheiro e não se corrige sozinho).
- `criar_compra(db, ctx, cartao_id, dados)`: valida; sem `parcelas`/`recorrencia` grava **um** item. Com `parcelas` chama `series_cartao.criar_parcelada`; com `recorrencia`, `series_cartao.criar_recorrente`. Nenhum `lancamento` é criado e nenhum saldo muda (RF-4.10, CA-4.10). Data futura ou passada recebe o mesmo tratamento (RF-4.13).
- `criar_estorno`: valida; se `item_origem_id`: o item deve ser `compra` **do mesmo cartão**, senão `VALIDACAO`; a soma dos estornos já vinculados a ela mais o novo valor não pode passar do valor da compra/parcela (`ESTORNO_SUPERA_COMPRA`, D8). Estorno sem vínculo é aceito (CA-4.16).
- `ajustar(db, ctx, cartao_id, mes, valor_banco)`: conta arquivada/fatura paga recusam; `valor_banco < 0` -> `VALIDACAO`. Se `valor_banco == total atual` (exibido) não cria nada. Senão cria `item_fatura(tipo='ajuste', valor = valor_banco + c − bruto, categoria_id=NULL, descricao='Reajuste de fatura', data=hoje())`, com `c = credito_recebido + credito_repassado + min(bruto, 0)` (o crédito que entra na fatura; vale nos três casos de `totais_em_cadeia`, §4.1), de modo que o total passe a ser exatamente `valor_banco` mesmo quando o crédito pendente é maior que o bruto (t153r I1). Sem crédito pendente `c = 0` e a fórmula vira `valor_banco − bruto` (CA-4.17: 750 -> 760 cria +10; 750 -> 740 cria −10). A resposta é `200` (§3.3).
- `editar(db, ctx, id, dados, alcance)` e `excluir(db, ctx, id, alcance)`: item de série delega a `series_cartao` (4.5); item avulso: conta arquivada -> `CONTA_ARQUIVADA`; fatura do item paga -> `FATURA_PAGA` (corrigir fatura paga = desfazer o pagamento, RF-4.19); `ajuste`: só excluir (editar -> `ITEM_NAO_EDITAVEL`, D9); editar o valor de compra abaixo da soma dos estornos vinculados -> `ESTORNO_SUPERA_COMPRA`; editar o valor de **estorno vinculado** confere o teto da compra de origem (os outros estornos dela, sem contar o próprio, mais o novo valor não passam do valor da compra; `ESTORNO_SUPERA_COMPRA`, t153c/t153r I2); excluir compra com estorno vinculado -> `COMPRA_COM_ESTORNO`. `PATCH` valida o **estado resultante** (`fatia-2.md` D9).
- `detalhe(db, ctx, cartao_id, mes) -> FaturaSaida` e `janela(db, ctx, cartao_id, de, ate, data) -> dict` (§3.2): `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))` primeiro; `pode_pagar` e `editavel` calculados aqui.

### 4.5 Séries: parceladas e recorrentes (`services/series_cartao.py`)
- `criar_parcelada(db, ctx, cartao, dados)`: `serie_cartao(tipo='parcelada', valor=total, dia=data.day, numero_final=N, gerado_ate=N)`; gera os N itens **de uma vez**, o `k`-ésimo na fatura `mes_fatura_inicial + (k − 1)` meses, com `valor = dividir_parcelas(total, N)[k − 1]`, `data = data da compra` (igual em todas), `numero_serie = k`. Todas as faturas de destino devem estar não pagas (`FATURA_PAGA`); a soma é exatamente o total (RNF-02). Total abaixo de `N` centavos (`valor < 0,01 x N`) -> `422` em `campos.parcelas` ("Valor pequeno demais para N parcelas"): a parcela zero violaria `ck_item_fatura_valor` e daria 500.
- `criar_recorrente(db, ctx, cartao, dados)`: `serie_cartao(tipo='recorrente', valor, dia=data.day, numero_final = meses ou NULL, gerado_ate=0)` e `serie_cartao_tag`; chama `gerar(db, serie, ate_mes = max(mes_fatura_inicial, mes_ref(hoje)))`, de modo que o item 1 sempre existe.
- `data_do_item(serie, k)` = `recorrencias.data_ocorrencia(mes_ref(data_inicial), serie.dia, k)` (`fatia-3.md` §4.1: o `dia` da primeira data, ajustado ao último dia do mês; `serie.dia` muda só pela edição de `data` com `este_e_pendentes`/`todos`, abaixo). Ocorrência `k` mora na fatura `mes_fatura_inicial + (k − 1)`.
- `gerar(db, serie, ate_mes)`: mesmo mecanismo de `fatia-3.md` §4.3 passo 3 e de `recorrencias.gerar`. Para `gerado_ate + 1 .. k_max` (limitado por `numero_final`), cada `item_fatura` (`valor` e demais campos do modelo) é inserido dentro de `db.begin_nested()` + `flush`, capturando `IntegrityError` **só** da chave `uq_item_fatura_serie_id_numero_serie` (confere o nome em `str(erro.orig)`; qualquer outro erro, como `CHECK`, `NOT NULL` ou truncamento, **propaga**, a transação inteira falha e `gerado_ate` não avança). As tags de `serie_cartao_tag` só são copiadas **se a linha entrou**; na duplicidade, `continue`. A ocorrência cuja fatura já está **paga** é pulada (o contador avança e ela não é gerada depois: fatura paga não recebe item novo, RF-4.19). `gerado_ate = max(gerado_ate, k_max)`. Alternativas descartadas: o `INSERT` com atualização em chave duplicada, como em `obter_ou_criar` (não diz se a linha entrou, e as tags só vão para a linha nova) e o modificador `IGNORE` do `INSERT` (no MySQL silencia `CHECK` e `NOT NULL`: ocorrência perdida sem erro).
- `garantir_ate(db, ctx, ate)`: séries `recorrente` das contas visíveis, **de conta ativa**, com `numero_final IS NULL OR gerado_ate < numero_final`, **ordenadas por `(cartao_id, id)`** (ordem estável entre sessões, para não haver impasse); para cada uma que precisa gerar, **trava o cartão antes da série** (`faturas.travar_cartao(db, ctx, serie.cartao_id, conta_ativa=False)`, D-046; a conta já foi filtrada como ativa na consulta e é reconferida abaixo), depois relê a série com `FOR UPDATE` e `execution_options(populate_existing=True)` (como `recorrencias.garantir_ate`), reconfere `gerado_ate` e chama `gerar`; gera até `mes_ref(ate)`; `commit` próprio só se gerou algo (exceção deliberada, igual a `fatia-3.md` §4.3 e D5). Conta arquivada: não gera (consulta apenas, RF-4.18); desarquivar retoma.
- **Alcance** (RF-4.11, RF-4.12; mesmos valores de `fatia-3.md` §3.1): o item escolhido é o de `numero_serie = n`; `editar` e `excluir` travam primeiro o **cartão** (`faturas.travar_cartao`, com o `cartao_id` lido da série sem trava, só para a trava; D-046) e depois a série com `FOR UPDATE`, na mesma ordem de `garantir_ate` (cartão, série).

| Alcance | Conjunto |
|---|---|
| `somente_este` | só o item `n` |
| `este_e_pendentes` | o item `n` mais os de `numero_serie > n` **em faturas não pagas** ("pendentes" = faturas não pagas, RF-4.11) |
| `todos` | todos os itens da série, inclusive em faturas já pagas |

  Regras comuns: nos alcances `somente_este` e `este_e_pendentes` o item escolhido precisa estar em fatura não paga (`FATURA_PAGA`); `todos` pode tocar fatura paga, **sem reabri-la e sem alterar o pagamento** (o total de uma fatura paga é o valor do pagamento, §4.1). Conta arquivada -> `CONTA_ARQUIVADA`.
  - **Editar** (D-045; regra única, repetida em §3.3 sem diferença): monta o estado resultante e o valida como na criação, **item a item**: `validar_item(..., mes=<fatura do próprio item>, ignorar_fatura_paga=(alcance == 'todos'))`; em `somente_este` e `este_e_pendentes` a fatura paga continua recusando (`FATURA_PAGA`). Aplica só os campos enviados a cada item do conjunto (tags substituídas). Campo por alcance:
    - **modelo da recorrente** (`serie_cartao` e `serie_cartao_tag`, para valer nas ocorrências ainda não geradas): só muda em `este_e_pendentes` e `todos`; `somente_este` não o toca;
    - `fatura_mes` na recorrente: só em `somente_este`; na parcelada, `valor` e `fatura_mes`, também só em `somente_este` (mover/alterar uma parcela não altera as outras; a soma deixa de ser o total original e isso é esperado, D7);
    - `data` na parcelada: só em `somente_este`;
    - `data` na recorrente: `somente_este` muda só a data daquele item (caminho simples, modelo intacto, `fatia-3.md` §4.5); `este_e_pendentes` e `todos` exigem `data` no **mês nominal** da ocorrência `n` (`mes_ref(data_do_item(serie, n))`), senão `422` em `campos.data`; o dia enviado vira `serie.dia` e cada item do conjunto recebe `data_do_item(serie, k)` (também desfaz deslocamentos de "somente este" nos atingidos);
    - qualquer outra combinação de campo e alcance: `422` em `campos.alcance`.
  - **Excluir**: `somente_este` apaga o item (o contador não recua, as demais não mudam); `este_e_pendentes` apaga o conjunto e, em `recorrente`, `numero_final = n − 1`; `todos` apaga todos os itens e a série (`serie_cartao_tag` junto). Item da série com estorno vinculado -> `COMPRA_COM_ESTORNO`. Em parcelada o total `N` não é renumerado (D7).
  - Termina com `sincronizar_pagamentos`; tudo numa transação.

### 4.6 Pagamento da fatura (`services/pagamento_fatura.py`)
Os três casos de uso abrem com `faturas.travar_cartao(db, ctx, cartao_id)` (§4.2; visibilidade 404, conta arquivada -> `CONTA_ARQUIVADA` e trava `FOR UPDATE` da linha do cartão, D-046), em lugar de uma trava local; as escritas de item (§4.4) e a geração de série (§4.5) travam o mesmo cartão, então `pagar` e `confirmar` não correm contra elas.
- `pagar(db, ctx, cartao_id, mes, data=None)`: `travar_cartao`; `calcular_mes`; `total == 0` -> `FATURA_ZERADA`; pagamento confirmado -> `FATURA_JA_PAGA`; previsto -> `PAGAMENTO_PREVISTO_EXISTE`. Cria `lancamento(tipo='pagamento_fatura', valor=total, data, situacao = confirmada se data <= hoje() senão prevista (RF-2.16), descricao='Fatura {cartão} {mm/aaaa}', conta_id=cartao.conta_id, fatura_id, criado_por_id)`. O pagamento é saída **só** da conta dona (CA-4.14). A fatura vira `paga` quando o pagamento é confirmado.
- `confirmar(...)`: `travar_cartao` (conta arquivada recusa); sem pagamento -> `PAGAMENTO_INEXISTENTE`; confirmado -> `PAGAMENTO_JA_CONFIRMADO`; total da fatura `0` -> `FATURA_ZERADA` (não confirma pagamento de zero); `situacao = 'confirmada'`, **mantém a data** e **regrava `valor = total`** da fatura calculada no momento (t152r S1: `series_cartao.gerar` não sincroniza o pagamento previsto, então o valor gravado pode estar velho; o pagamento confirmado congela o total).
- `desfazer(...)`: `travar_cartao` (conta arquivada -> `CONTA_ARQUIVADA`, CA-4.22); sem pagamento -> `PAGAMENTO_INEXISTENTE`; apaga o `lancamento`. O saldo atual da conta dona recupera o valor (saldo é derivado), a fatura volta ao status pelas datas e volta a contar no limite usado (CA-4.21).

### 4.7 Extensões em código de fatias anteriores (feitas nesta fatia)
- `services/saldos.py` (`fatia-2.md` §4.1) **não muda**: `_saldos` soma `+valor` só para `receita` e `reajuste` e usa `else_=-valor` para os demais tipos da conta de origem, e `pagamento_fatura` cai nesse ramo (`−valor` na conta de origem); `situacao_exibida` vale para ele. Esta fatia não edita `saldos.py`.
- `services/lancamentos.py` (`fatia-2.md` §4.6): `editar`, `excluir` e `confirmar` de `tipo = 'pagamento_fatura'` -> `LANCAMENTO_NAO_EDITAVEL` com mensagem "Use as ações da fatura"; `listar_mes` e `GET /api/lancamentos` **não listam** `pagamento_fatura` (a linha da fatura o representa, RF-5.07). `GET /api/lancamentos/{id}` o devolve.
- `services/alvos_vinculo.py` (`fatia-2.md` §4.4): acrescenta `item_fatura.categoria_id` e `serie_cartao.categoria_id` em `ALVOS_CATEGORIA`, e `item_fatura_tag`, `serie_cartao_tag` em `ALVOS_TAG`, todos com `conta_id` (colunas denormalizadas, D2).
- `services/ganchos.py`: `ajuste_cartao_previsto`, `base_cartao_conjunta`, `antes_de_ler_periodo` (também `series_cartao.garantir_ate`).

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4)
| Rota | Tela | Observações |
|---|---|---|
| `/cartoes` | Cartões | `CardsResumo` com limite disponível total e `total_faturas_mes` (faturas do mês corrente, D-012); um `CardCartao` por cartão (nome, status da fatura do mês, valor, vencimento, barra de limite com usado e porcentagem, disponível, botão "Pagar fatura"); seção "Contas arquivadas" colapsada para cartões de conta arquivada; `EstadoVazio` com "Cadastrar cartão" (CA-4.06). Sem `SeletorMes` (`front.md` §3) |
| `/cartoes/novo` | Cadastro do cartão | nome, conta dona (as contas ativas visíveis), limite (máscara), dia de fechamento, dia de vencimento, bandeira (opcional) |
| `/cartoes/:cartaoId` | Cartão | editar nome, limite, dias, bandeira (conta dona só leitura); atalho "Ver fatura atual"; "Excluir cartão" (recusado com mensagem se tem compras) |
| `/cartoes/:cartaoId/faturas/:mes` | Detalhe da fatura | navegação própria por mês da fatura (anterior/seguinte, `front.md` §3); cabeçalho com status (ícone + texto), fechamento, vencimento, valor, crédito de estorno recebido quando houver; lista de itens com data, descrição ("(n/N)"), categoria, valor (estorno negativo, `Dinheiro`); ações por item: editar e excluir (somem em fatura paga ou conta arquivada); ações da fatura: Pagar fatura, Confirmar pagamento / Cancelar pagamento previsto, Desfazer pagamento (com `DialogoConfirmacao`), Ajustar fatura, Lançar estorno; `EstadoVazio` sem itens |

**Formulário "Despesa no cartão"** (`FormulariosProvider.abrir("cartao")`, `front.md` §8; é a quarta opção do "+"): essenciais = valor, data (atalhos Hoje/Ontem/Outra data), descrição, categoria (só de despesa, ativas), cartão (preselecionado se aberto a partir da fatura), fatura de destino (seletor de `GET .../faturas?data=`, sugerida pela data e editável; faturas pagas desabilitadas). "Mais detalhes": tags, observação, **Recorrente** (`CampoRecorrencia` da fatia 3) e **Parcelada** (número de parcelas de 2 a 36; excludente com Recorrente). Sem campos de dono, conta ou situação (CA-4.02, CA-4.13). "Salvar" e "Salvar e criar nova" (RF-0.06). Erros de campo vindos de `ApiError.campos`.
**Estorno** e **Ajustar fatura** abrem como `BottomSheet` local da tela da fatura (não são rota nem tipo do provider). Estorno: valor, data, descrição, categoria (vem da compra quando vinculado), vínculo opcional a uma compra do cartão, fatura. Ajustar: valor da fatura conforme o banco.
Editar item de **compra** abre o formulário de compra em modo edição; editar **estorno** abre `FormEstorno`, não o de compra; **ajuste** só se exclui (D9, sem "editar"). `DialogoAlcance` (fatia 3) abre antes de salvar/excluir quando `serie != null` (CA-0.10). Para compras ele ganha as props opcionais `titulo` e `rotulos` (`{ somente_este, este_e_pendentes, todos }`); o uso das compras passa os rótulos "Somente esta", "Esta e as pendentes", "Todas (incluindo efetivadas)" (RF-4.11); sem as props o diálogo da fatia 3 fica como está (padrão preservado).
"Pagar fatura" do `CardCartao` leva a `/cartoes/:id/faturas/:mes?pagar=1` (mês da `fatura_corrente`), onde `Fatura.tsx` abre a confirmação de pagamento ao montar; o parâmetro é lido uma vez e removido da URL.

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | Compras, estornos e ajustes em **tabela própria** (`item_fatura`), não em `lancamento` | RF-4.10: compra nunca altera o saldo. Com tabela própria isso vale por construção; em `lancamento`, toda consulta de saldo, balanço, aporte e projeção teria de excluir os tipos de cartão (esquecimento vira erro de dinheiro) | Tipos `compra_cartao` em `lancamento` |
| D2 | Pagamento da fatura é `lancamento` (`pagamento_fatura`) com `fatura_id`; `item_fatura` e `serie_cartao` guardam `conta_id` copiado do cartão | O pagamento é saída da conta dona com situação confirmada/prevista (RF-4.14): entra sozinho no saldo atual e previsto pelo mecanismo existente; `uq` impede dois pagamentos. O `conta_id` copiado uniformiza os `ALVOS_*` e os balanços por conta, e é seguro porque a conta dona não muda | Tabela `pagamento_fatura` com saldo recalculado à parte; join cartão -> conta em toda consulta |
| D3 | Datas da fatura **calculadas** dos dias do cartão; conta dona não muda; mudar os dias não move itens | Evita guardar estado que diverge; RF-4.03 define tudo por regra. Custo: mudar os dias do cartão muda as datas exibidas das faturas existentes (aceito; o cadastro avisa) | Gravar fechamento/vencimento por fatura; permitir trocar a conta dona |
| D4 | Pagamento **previsto** acompanha o total da fatura até ser confirmado; confirmado congela | RF-4.14 exige valor = total; sem isso, editar um item deixaria o pagamento previsto errado | Pagamento previsto com valor fixo |
| D5 | Ajuste sem categoria, exibido como "Reajuste de fatura" | RF-4.17 pede categoria "própria"; criar categoria por casal exigiria ganchos no vínculo/desvínculo (fatia 2 §4.8). Relatórios mostram esse grupo com nome fixo (fatias 5 e 7) | Categoria real semeada por casal |
| D6 | Total da fatura e crédito calculados **na leitura** em cadeia; limite usado ignora ocorrências futuras de compra recorrente; fatura paga congela no valor do pagamento | RF-4.16 (crédito em cascata) e RNF-02 sem estado gravado; parcelas ocupam o limite todo, assinatura futura não (e não depende do quanto o usuário navegou) | Gravar linhas de crédito; contar tudo que foi gerado |
| D7 | Em parcelada: `N` imutável, sem renumerar; `valor`, `fatura_mes` e `data` só em "somente este"; na recorrente, `fatura_mes` só em "somente este" (D-045: `data` com vários itens só na recorrente, via `serie.dia`) | O requisito só exemplifica descrição (CA-4.11); mudar valor em várias parcelas é ambíguo (total ou por parcela) | Reratear o total entre as parcelas restantes |
| D8 | Estornos vinculados somados não passam o valor da compra/parcela | RF-4.16 diz "não pode superar"; a soma impede dois estornos que juntos superam | Validar cada estorno isolado |
| D9 | Ajuste não é editável (só excluível) | Mesma razão de `fatia-2.md` D7 (um só caminho para o valor da fatura) | Editar o valor do ajuste |
| D10 | Séries de cartão têm tabela própria (`serie_cartao`), não reusam `recorrencia` | A recorrência da fatia 3 gera `lancamento` por data; aqui a ocorrência é por fatura e vive em `item_fatura`. O padrão (modelo + contador + `begin_nested` com `IntegrityError` só da chave única + alcance) é o mesmo | Estender `recorrencia` com cartão e fatura |
| D11 | Gasto do mês por **item** (`gasto_cartao`), não pelo total da fatura | Categorias e orçamento (fatias 5 e 7) precisam do item; ao longo do tempo a soma bate com o que se paga (o crédito de estorno só adia o pagamento). Num mês com estorno maior que a fatura o gasto do mês pode sair negativo | Usar o total da fatura (perde categoria) |
| D12 | Pagamento previsto é confirmado e cancelado pelas rotas da fatura, na tela de detalhe | Os requisitos não dizem como confirmar/cancelar um pagamento previsto (a linha da fatura não tem ações, RF-5.07); o detalhe da fatura é o lugar | Ações na lista do Controle |
| D13 | D-046: toda escrita que muda o total da fatura trava o cartão (`faturas.travar_cartao`) antes de validar; ordem de trava **conta, cartão, série**; `confirmar` regrava `valor = total` e recusa total zero (`FATURA_ZERADA`) | A corrida `pagar` x escrita de item deixaria pagamento com valor diferente do total da fatura, dinheiro errado sem autocorreção (t152r I1). A ordem única evita impasse entre `garantir_ate`, `editar` e `excluir` de série. A conta, na prática, não é travada (só lida): `pagar` confirmado, `confirmar` e `desfazer` mudam o saldo da conta sem travá-la, risco aceito de D-032 (t152r S2), então a ordem efetiva é cartão, série | Aceitar a corrida como em D-032; travar a fatura em vez do cartão (a fatura pode nem existir ainda) |

Riscos:
- **Crédito de estorno e fatura paga**: a regra de `totais_em_cadeia` para fatura paga (absorvido = bruto − pago) é a parte mais sutil; o roteiro de teste é CA-4.23 mais "estorno, pagar a seguinte, conferir que a terceira não recebe o crédito de novo". Esse caso é conferido na revisão e nos testes de integração.
- **Recálculo por cartão em toda leitura**: `calcular` agrega por fatura, não por item; custo proporcional ao número de faturas com linha (dezenas). A medição de CA-N.06 é feita nos testes de integração.
- **Geração de recorrente dentro de leitura** (`garantir_ate`): mesma exceção e mesmos riscos de `fatia-3.md` D5; a revisão confere que só ela escreve em `GET`.
- **Fatura paga e `todos`**: editar itens de fatura paga deixa a lista diferente do valor pago (esperado por RF-4.11); a tela deve mostrar o valor do pagamento como valor da fatura.
- **Edição dos dias do cartão** reclassifica datas, mas não faturas dos itens existentes (D3).
- **`ALVOS_*`**: os alvos novos usam `conta_id` denormalizado; a revisão confere que `item_fatura.categoria_id`, `serie_cartao.categoria_id` e as duas tabelas de tag estão listados (checklist de `fatia-2.md` §6).
