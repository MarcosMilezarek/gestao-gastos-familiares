# Fatia 2: Contas, categorias, tags e lançamentos

> Só o que é da fatia 2. Convenções: `comum.md` §4 (modelo físico), §5.2 (propriedade e visibilidade), §6 (API, dinheiro, erros), §7.3 (autorização). Fatia 1 (`Contexto`, ganchos): `fatia-1.md`; datas: `tempo.py`. Telas e componentes: `front.md`. Validação e execução: `comum.md` §9.
> Pré-requisito: fatia 1.

## 1. Escopo e RF cobertos

Contas (3 por casal, saldo derivado, reajuste, arquivar), categorias de 2 níveis com a lista padrão e a categoria fixa Salário, tags, e lançamentos de despesa, receita, transferência (aporte incluído) e reajuste, com confirmação, atraso derivado, edição, exclusão e a união/cópia de categorias e tags no vínculo/desvínculo. Recorrência e cálculo de aporte são da fatia 3; cartão, da 4.

## 2. Tabelas e migrações

Convenções de `comum.md` §4. Dinheiro `DECIMAL(12,2)`. Enumerações `VARCHAR` + `CHECK`. Todas as FKs `ON DELETE RESTRICT`. Colunas de texto de nome usam a collation `utf8mb4_0900_as_ci`.

**Chave de escopo (convenção da fatia, usada por `categoria` e `tag`).** Nome único "por pessoa ou por casal" não pode ser um índice sobre `(usuario_id, casal_id, nome)`: uma das duas colunas é sempre `NULL` e o MySQL aceita duplicados com `NULL`. Por isso há uma coluna gerada `escopo VARCHAR(24) STORED = IF(usuario_id IS NOT NULL, CONCAT('u', usuario_id), CONCAT('c', casal_id))`, e o índice único usa `escopo`. Compatível com as FKs (todas `RESTRICT`).

### 2.1 Migração `0003_conta_categoria_tag`

**`conta`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| usuario_id | BIGINT UNSIGNED | NULL, `fk_conta_usuario_id` |
| casal_id | BIGINT UNSIGNED | NULL, `fk_conta_casal_id` |
| nome | VARCHAR(60) | NOT NULL |
| instituicao | VARCHAR(60) | NULL |
| tipo | VARCHAR(20) | NOT NULL, `ck_conta_tipo` IN (`conta_corrente`,`dinheiro`,`poupanca`,`investimentos`,`vr_va`,`outros`) |
| cor | CHAR(7) | NOT NULL (`#RRGGBB`) |
| saldo_inicial | DECIMAL(12,2) | NOT NULL DEFAULT 0 (pode ser negativo) |
| arquivado | TINYINT(1) | NOT NULL DEFAULT 0 |
| criado_em, atualizado_em | DATETIME(6) | |

`ck_conta_dono`: `(usuario_id IS NULL) <> (casal_id IS NULL)` (exatamente um dono, `comum.md` §5.2). `uq_conta_usuario_id (usuario_id)` e `uq_conta_casal_id (casal_id)`: uma individual por pessoa e uma conjunta por casal, garantidas pelo banco (`NULL` não colide). Isso implementa "exatamente três contas fixas" (RF-2.01) sem rota de criação nem exclusão.

**`categoria`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| usuario_id, casal_id | BIGINT UNSIGNED | NULL, FKs; `ck_categoria_dono` exatamente um |
| categoria_pai_id | BIGINT UNSIGNED | NULL, FK `categoria` (auto-relação; só 2 níveis, validado no service) |
| tipo | VARCHAR(10) | NOT NULL, `ck_categoria_tipo` IN (`despesa`,`receita`); a subcategoria repete o tipo do pai |
| nome | VARCHAR(60) COLLATE as_ci | NOT NULL |
| icone | VARCHAR(40) | NOT NULL (nome do ícone, `front.md` §6) |
| cor | CHAR(7) | NULL; **só a raiz tem cor** (a subcategoria herda na leitura): `ck_categoria_cor` `(categoria_pai_id IS NULL) = (cor IS NOT NULL)` |
| fixa | TINYINT(1) | NOT NULL DEFAULT 0 (só a raiz Salário; `ck_categoria_fixa`: `fixa = 0 OR categoria_pai_id IS NULL`) |
| arquivado | TINYINT(1) | NOT NULL DEFAULT 0 |
| escopo | VARCHAR(24) | gerada (chave de escopo) |
| pai_chave | BIGINT UNSIGNED | gerada `STORED = COALESCE(categoria_pai_id, 0)` |
| criado_em, atualizado_em | DATETIME(6) | |

`uq_categoria_escopo_tipo_pai_chave_nome (escopo, tipo, pai_chave, nome)`: nome único entre irmãs, sem distinguir maiúsculas e distinguindo acento (CA-1.02/RF-2.08). Índices `ix_categoria_usuario_id`, `ix_categoria_casal_id`, `ix_categoria_categoria_pai_id`.

**`tag`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| usuario_id, casal_id | BIGINT UNSIGNED | NULL, FKs; `ck_tag_dono` exatamente um |
| nome | VARCHAR(40) COLLATE as_ci | NOT NULL |
| escopo | VARCHAR(24) | gerada (chave de escopo) |
| criado_em, atualizado_em | DATETIME(6) | |

`uq_tag_escopo_nome (escopo, nome)`; `ix_tag_usuario_id`, `ix_tag_casal_id`.

### 2.2 Migração `0004_lancamento`

**`lancamento`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| tipo | VARCHAR(20) | NOT NULL, `ck_lancamento_tipo` IN (`despesa`,`receita`,`transferencia`,`reajuste`) (fatias 4 e 6 acrescentam por migração própria) |
| valor | DECIMAL(12,2) | NOT NULL; `ck_lancamento_valor`: `(tipo = 'reajuste' AND valor <> 0) OR (tipo <> 'reajuste' AND valor > 0)` (o reajuste é com sinal) |
| data | DATE | NOT NULL |
| situacao | VARCHAR(20) | NOT NULL, `ck_lancamento_situacao` IN (`prevista`,`confirmada`); `atrasada` **não** é gravada (RG-05); `ck_lancamento_reajuste`: `tipo <> 'reajuste' OR situacao = 'confirmada'` |
| descricao | VARCHAR(120) | NULL (obrigatória no service para despesa e receita) |
| conta_id | BIGINT UNSIGNED | NOT NULL, FK conta (origem na transferência) |
| conta_destino_id | BIGINT UNSIGNED | NULL, FK conta; `ck_lancamento_destino`: `(tipo = 'transferencia') = (conta_destino_id IS NOT NULL)` e `conta_destino_id IS NULL OR conta_destino_id <> conta_id` |
| categoria_id | BIGINT UNSIGNED | NULL, FK categoria; `ck_lancamento_categoria`: `(tipo IN ('despesa','receita')) = (categoria_id IS NOT NULL)` |
| dono_usuario_id | BIGINT UNSIGNED | NULL, FK usuario (nulo = casal); `ck_lancamento_dono`: `tipo IN ('despesa','receita') OR dono_usuario_id IS NULL` |
| observacao | VARCHAR(500) | NULL |
| criado_por_id | BIGINT UNSIGNED | NOT NULL, FK usuario (RF-2.23) |
| criado_em, atualizado_em | DATETIME(6) | |

Índices: `ix_lancamento_conta_id_data (conta_id, data)` (saldo e lista do mês, `comum.md` §4), `ix_lancamento_conta_destino_id_data (conta_destino_id, data)`, `ix_lancamento_categoria_id`. A fatia 3 acrescenta `recorrencia_id` e `numero_recorrencia`.

**`lancamento_tag`**: `lancamento_id` (FK), `tag_id` (FK), PK `(lancamento_id, tag_id)`, índice `ix_lancamento_tag_tag_id`.

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória em todas. Ids de outro casal respondem `404 NAO_ENCONTRADO` (`comum.md` §6.3). Referência a recurso **no corpo** que não existe ou é de outro casal responde `422 VALIDACAO` com `campos.<campo>` genérico ("Categoria não encontrada"), sem revelar existência. Mês: `?mes=AAAA-MM` (padrão: mês de `hoje()`), validado por `tempo.validar_mes`.

**Objetos de saída**
```
ContaSaida = { "id": 3, "nome": "Conta de Ana", "instituicao": "Nubank" | null, "tipo": "conta_corrente",
               "cor": "#1E88E5", "saldo_inicial": "1000.00", "dono_usuario_id": 1 | null,   // null = conjunta
               "arquivado": false, "casal_encerrado": false,
               "saldo_atual": "900.00", "saldo_previsto": "850.00" }
CategoriaSaida = { "id": 4, "nome": "Gastos variáveis", "tipo": "despesa", "icone": "shopping-bag", "cor": "#F9A825",
                   "fixa": false, "arquivado": false, "categoria_pai_id": null,
                   "subcategorias": [ CategoriaSaida sem "subcategorias"; "cor" = a da categoria-pai ] }
TagSaida = { "id": 1, "nome": "essencial" }
LancamentoSaida = { "id": 10, "tipo": "despesa", "valor": "120.50", "data": "2026-10-29",
                    "situacao": "confirmada" | "prevista" | "atrasada",      // atrasada é derivada (§4.1)
                    "descricao": "Compra do mês" | null,
                    "categoria": null | { "id": 5, "nome": "Mercado", "pai_nome": "Gastos variáveis", "cor": "#F9A825", "icone": "shopping-cart" },
                    "dono_usuario_id": null,            // null = casal (despesa e receita)
                    "conta_id": 3, "conta_destino_id": null,
                    "aporte": false,                    // transferência de individual para conjunta (RF-2.21)
                    "tags": [ TagSaida ], "observacao": null,
                    "criado_por": { "id": 1, "nome": "Ana" }, "criado_em": "2026-10-29T14:03:11.000000Z" }
```

### 3.1 Contas (RF-2.01 a 2.06)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/contas` | `?mes`, `?arquivadas=true\|false` (padrão `false`) | `{ "mes": "2026-10", "contas": [ContaSaida], "total_saldo_atual": "…", "total_saldo_previsto": "…" }`; totais somam só as contas **ativas** listadas (`null` quando `arquivadas=true`) | 422 `VALIDACAO` |
| `GET /api/contas/{id}` | `?mes` | `ContaSaida` | 404 |
| `PATCH /api/contas/{id}` | `{ nome?, instituicao?, tipo?, cor?, saldo_inicial? }` | `ContaSaida` | 404; 409 `CONTA_ARQUIVADA`; 422 |
| `POST /api/contas/{id}/arquivar` | - | `ContaSaida` (idempotente) | 404 |
| `POST /api/contas/{id}/desarquivar` | - | `ContaSaida` (idempotente) | 404; 409 `CONTA_DE_CASAL_ENCERRADO` (a conjunta de casal desfeito só é consultada) |
| `POST /api/contas/{id}/reajuste` | `{ "saldo_real": "900.00" }` (pode ser negativo ou zero) | `{ "conta": ContaSaida, "lancamento": LancamentoSaida \| null }` (`null` quando a diferença é zero, CA-2.04) | 404; 409 `CONTA_ARQUIVADA`; 422 |

Não existem `POST /api/contas` nem `DELETE /api/contas/{id}` (RF-2.01, CA-2.01).

### 3.2 Categorias (RF-2.07 a 2.11)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/categorias` | `?tipo=despesa\|receita`, `?incluir_arquivadas=true` (padrão `false`) | `[CategoriaSaida]` (raízes, cada uma com as subcategorias), ordem: nome | 422 |
| `POST /api/categorias` | `{ tipo, nome, icone, cor, categoria_pai_id? }`; subcategoria: `tipo` e `cor` vêm do pai (se enviados, devem coincidir ou são ignorados) | `201` `CategoriaSaida` | 409 `CATEGORIA_JA_EXISTE` (`campos.nome`); 409 `CATEGORIA_NIVEL_INVALIDO` (pai é subcategoria, CA-2.07); 409 `CATEGORIA_ARQUIVADA` (pai arquivado); 422 |
| `PATCH /api/categorias/{id}` | `{ nome?, icone?, cor? }` (`cor` só na raiz) | `CategoriaSaida` | 404; 409 `CATEGORIA_FIXA` (alterar o **nome** de Salário); 409 `CATEGORIA_JA_EXISTE`; 409 `CATEGORIA_ARQUIVADA` |
| `POST /api/categorias/{id}/arquivar` | `{ "mover_para_id": 7 }` (obrigatório se ela ou suas subcategorias têm lançamentos) | `CategoriaSaida` (arquivada, subcategorias também) | 404; 409 `CATEGORIA_FIXA`; 409 `CATEGORIA_EM_USO` (`campos.mover_para_id`: "Escolha a categoria para onde os lançamentos serão movidos"); 409 `CATEGORIA_DESTINO_INVALIDO` |
| `POST /api/categorias/{id}/mover-lancamentos` | `{ "destino_id": 7 }` | `{ "movidos": 3 }` | 404; 409 `CATEGORIA_DESTINO_INVALIDO` |

Destino válido (arquivar e mover): visível ao contexto, **mesmo tipo**, não arquivado, diferente da origem e fora da subárvore da origem. Não há `DELETE` de categoria (RF-2.10: arquivar).

### 3.3 Tags (RF-2.12)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/tags` | - | `[TagSaida]` ordenadas por nome | - |
| `POST /api/tags` | `{ nome }` (1 a 40) | `201` `TagSaida` | 409 `TAG_JA_EXISTE` (`campos.nome`); 422 |
| `PATCH /api/tags/{id}` | `{ nome }` | `TagSaida` | 404; 409 `TAG_JA_EXISTE` |
| `DELETE /api/tags/{id}` | - | `204`; remove a tag dos lançamentos e apaga a tag | 404 |

### 3.4 Lançamentos (RF-2.13 a 2.23)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/lancamentos` | `?mes` (padrão mês atual), `?conta_id` (opcional: lançamentos em que a conta é origem ou destino) | `[LancamentoSaida]` ordenados por `data DESC, id DESC`; inclui reajustes e transferências (uma vez só); legível se ao menos uma ponta é visível (`comum.md` §7.3 regra 1) | 404 (`conta_id` de outro casal); 422 |
| `GET /api/lancamentos/{id}` | - | `LancamentoSaida` | 404 (nenhuma ponta visível) |
| `POST /api/lancamentos` | corpo por `tipo` (abaixo) | `201` `LancamentoSaida` | abaixo |
| `PATCH /api/lancamentos/{id}` | campos do corpo de criação, todos opcionais; `tipo` não muda | `LancamentoSaida` | abaixo |
| `DELETE /api/lancamentos/{id}` | - | `204` | 404; 409 `CONTA_ARQUIVADA`; 409 `LANCAMENTO_SOMENTE_LEITURA` |
| `POST /api/lancamentos/{id}/confirmar` | `{ "valor": "3150.00" }` (opcional: valor real) | `LancamentoSaida` | 404; 409 `LANCAMENTO_JA_CONFIRMADO`; 409 `CONTA_ARQUIVADA`; 409 `LANCAMENTO_SOMENTE_LEITURA`; 422 |

**Corpo de criação** (união discriminada por `tipo`; `reajuste` não é aceito na criação, só por `POST /api/contas/{id}/reajuste`):
```
despesa | receita: { "tipo", "valor": "120.50", "data": "2026-10-29", "descricao": "…", "categoria_id": 5,
                     "dono_usuario_id": 1 | null, "conta_id": 3,
                     "situacao"?: "prevista" | "confirmada", "tag_ids"?: [1,2], "observacao"?: "…" }
transferencia:      { "tipo", "valor", "data", "conta_id": 3 /*origem*/, "conta_destino_id": 4,
                     "situacao"?, "descricao"?, "tag_ids"?, "observacao"? }
```
`situacao` omitida: `confirmada` se `data <= hoje()`, senão `prevista` (RF-2.16). `valor` > 0 e ≤ 9.999.999.999,99 (`comum.md` §6.2); `data` entre 2000-01-01 e `hoje + 10 anos`; `descricao` 1 a 120 (despesa e receita); `observacao` até 500; `tag_ids` sem repetição.

**Erros de criação e edição:** 422 `VALIDACAO` (`campos`: `valor`, `data`, `descricao`, `categoria_id`, `conta_id`, `conta_destino_id`, `tag_ids`; inclui origem igual ao destino, CA-2.19); 409 `DONO_CONTA_INCOMPATIVEL` (`campos.conta_id`, RG-04/RF-2.15, CA-2.14); 409 `CONTA_ARQUIVADA` (conta ou destino arquivados, CA-2.21); 409 `CATEGORIA_TIPO_INVALIDO` (categoria de receita em despesa e vice-versa); 409 `CATEGORIA_ARQUIVADA` (categoria arquivada em lançamento novo ou ao trocar a categoria; manter a mesma na edição é permitido); 409 `LANCAMENTO_NAO_EDITAVEL` (editar reajuste; o reajuste só pode ser excluído); 409 `LANCAMENTO_SOMENTE_LEITURA` (`PATCH` de lançamento com uma ponta invisível, `comum.md` §7.3 regra 2). Na saída, `conta_id` e `conta_destino_id` são só ids, então uma ponta invisível não revela nome (§7.3 regra 1).

### 3.5 Códigos de erro da fatia (acrescentados em `errors.py`)
Todos 409, salvo indicação: `CONTA_ARQUIVADA`, `CONTA_DE_CASAL_ENCERRADO`, `DONO_CONTA_INCOMPATIVEL`, `CATEGORIA_JA_EXISTE`, `CATEGORIA_FIXA`, `CATEGORIA_NIVEL_INVALIDO`, `CATEGORIA_TIPO_INVALIDO`, `CATEGORIA_ARQUIVADA`, `CATEGORIA_EM_USO`, `CATEGORIA_DESTINO_INVALIDO`, `TAG_JA_EXISTE`, `LANCAMENTO_JA_CONFIRMADO`, `LANCAMENTO_NAO_EDITAVEL`, `LANCAMENTO_SOMENTE_LEITURA` (regra de `comum.md` §7.3; usado também pela fatia 3).

## 4. Regras dos services

### 4.1 Saldos e situação (`services/saldos.py`; RG-05, RG-06, RF-2.03, RNF-02)
Efeito de um lançamento no saldo, por conta:

| Tipo | Conta de origem (`conta_id`) | Conta de destino |
|---|---|---|
| despesa | `-valor` | - |
| receita | `+valor` | - |
| transferência | `-valor` | `+valor` |
| reajuste | `+valor` (com sinal) | - |

- **Saldo atual** da conta `c` = `saldo_inicial` + soma dos efeitos dos lançamentos `situacao = 'confirmada'` que tocam `c` (origem ou destino), **qualquer data**.
- **Saldo previsto** da conta `c` no mês `M` = saldo atual + soma dos efeitos dos lançamentos `situacao = 'prevista'` com `data <= fim_do_mes(M)` (inclui atrasadas de meses anteriores, RF-5.24 dos requisitos) − `ganchos.ajuste_cartao_previsto(db, [c], fim_do_mes(M))[c]` (faturas de cartão a debitar, RG-06; zero até a fatia 4).
- Funções: `saldos_atuais(db, conta_ids) -> dict[int, Decimal]` e `saldos_previstos(db, conta_ids, ate: date) -> dict[int, Decimal]`. Cada uma é **uma consulta** com `SUM` de `DECIMAL` agrupada por conta (origem e destino numa `UNION ALL`), resultado quantizado em 2 casas; nenhuma conversão para `float` (RNF-02). `total_saldo_*` somam em `Decimal` os valores já calculados das contas ativas.
- **Situação exibida** (`situacao_exibida(situacao, data, hoje) -> str`): `confirmada` se confirmada; senão `atrasada` se `data < hoje`; senão `prevista` (data de hoje não é atrasada). `hoje` vem de `tempo.hoje()`.
- **Aporte** (RF-2.21): `lancamento.tipo = 'transferencia'` com a conta de origem individual (`usuario_id` preenchido) e a de destino conjunta (`casal_id` preenchido). Derivado na leitura, não gravado.

### 4.2 Visibilidade (`acesso.py`; `comum.md` §7.3)
Acrescenta ao `acesso.py` da fatia 1: `filtro_contas(ctx)` (condição SQLAlchemy: `Conta.usuario_id IN {ctx.usuario_id, ctx.parceiro_id}` **ou** `Conta.casal_id IN ctx.casais_ids`); `conta_visivel`, `lancamento_visivel` (legível), `lancamento_gravavel` e `filtro_lancamentos(ctx)`, com a regra única de `comum.md` §7.3 (legível se ao menos uma ponta é visível; gravável só se as duas são; não repetida aqui), `categoria_visivel`, `tag_visivel` (dono = pessoa do contexto ou `casal_id == casal_ativo_id`), todos lançando `AppError(404, NAO_ENCONTRADO)`; e `dono_da_lista(ctx) -> tuple[str, int]` (`("casal_id", casal_ativo_id)` se vinculada, senão `("usuario_id", usuario_id)`), usado para criar categoria e tag no escopo certo. Nenhum service escreve a própria regra de visibilidade.

### 4.3 Contas (`services/contas.py`)
- `listar(db, ctx, mes, arquivadas)`: `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))`; contas por `filtro_contas` com `arquivado = :arquivadas`; saldos pelas funções de §4.1; `casal_encerrado = conta.casal_id` preenchido e o casal com `encerrado_em` (aparece na lista de arquivadas, CA-1.10).
- `editar(...)`: conta arquivada -> `CONTA_ARQUIVADA` (arquivada é somente leitura, exceto desarquivar). Dono e vínculo nunca mudam.
- `arquivar`: `arquivado = 1`; `ganchos.ao_arquivar_conta(db, conta)`; commit. `desarquivar`: conta com `casal_id` de casal encerrado -> `CONTA_DE_CASAL_ENCERRADO`; senão `arquivado = 0`. Contas do desvínculo já nascem arquivadas (§4.8).
- `reajustar(db, ctx, conta_id, saldo_real)`: trava a linha da conta (`FOR UPDATE`, que só serializa reajustes entre si e roda sob READ COMMITTED, D-032; `comum.md` §3.1, `db.py`); conta arquivada recusa; `diferenca = saldo_real - saldo_atual(conta)`; se `diferenca == 0` não cria nada (devolve `lancamento: null`); senão cria `lancamento(tipo='reajuste', valor=diferenca, data=hoje(), situacao='confirmada', descricao='Reajuste de saldo', conta_id, criado_por_id)`. Como o reajuste é só um movimento confirmado, o saldo atual passa a ser exatamente `saldo_real`, e ele não é entrada nem saída nos totais de balanço (a fatia 5 exclui `tipo='reajuste'`; RG-09).

### 4.4 Categorias (`services/categorias.py`; `services/alvos_vinculo.py`)
- **Alvos de categoria.** `alvos_vinculo.py` mantém a lista `ALVOS_CATEGORIA` das tabelas que apontam para `categoria` e `ALVOS_TAG` das que apontam para `tag`. Nesta fatia: `lancamento.categoria_id` (com `conta_id` para localizar a pessoa) e `lancamento_tag`. A fatia 3 acrescenta `recorrencia`/`recorrencia_tag`; as seguintes, o que precisarem. Todo código que reaponta ou conta usos (mover, arquivar, unir, copiar, excluir tag) percorre a lista, em vez de conhecer tabelas.
- `criar`: escopo por `dono_da_lista`. Raiz exige `cor`; subcategoria: pai visível, **raiz** (senão `CATEGORIA_NIVEL_INVALIDO`) e não arquivado, tipo igual ao do pai. Nome duplicado entre irmãs -> `CATEGORIA_JA_EXISTE` (consulta prévia mais captura de `IntegrityError` de `uq_categoria_escopo_tipo_pai_chave_nome`).
- `editar`: categoria `fixa` -> trocar `nome` dá `CATEGORIA_FIXA`; `icone` e `cor` podem mudar. Subcategoria de Salário (inclusive as quatro padrão) pode ser editada e arquivada; só a raiz é fixa.
- `arquivar(db, ctx, id, mover_para_id)`: raiz `fixa` -> `CATEGORIA_FIXA`. "Em uso" = existe linha em algum alvo com a categoria ou qualquer subcategoria dela. Em uso sem `mover_para_id` -> `CATEGORIA_EM_USO`. Valida o destino (§3.2), reaponta todos os alvos da subárvore para o destino, marca categoria e subcategorias `arquivado = 1`. Categoria arquivada some do `GET` padrão e continua nos lançamentos antigos (RF-2.10). Uma transação.
- `mover_lancamentos(db, ctx, id, destino_id)`: mesmo reapontamento, sem arquivar; conta quantos lançamentos moveu (`movidos`). A "categoria" movida inclui as suas subcategorias quando é raiz (decisão D5).
- `listar`: raízes com subcategorias; `cor` da subcategoria = a da raiz.

### 4.5 Tags (`services/tags.py`)
`criar`/`renomear` no escopo de `dono_da_lista`, nome único por escopo (`TAG_JA_EXISTE`, sem distinguir maiúsculas, CA-2.11). `excluir`: remove as linhas de todos os `ALVOS_TAG` e depois a tag (uma transação); os lançamentos permanecem.

### 4.6 Lançamentos (`services/lancamentos.py`)
**Validação de criação/edição** (a edição aplica o `PATCH` sobre o estado atual e valida o **resultado inteiro**), nesta ordem:
0. Em `editar`, `excluir` e `confirmar`: o lançamento é obtido por `lancamento_gravavel` (`comum.md` §7.3 regra 2: 404, ou `LANCAMENTO_SOMENTE_LEITURA` com uma ponta invisível); na leitura (`GET`, listagens), por `lancamento_visivel` (regra 1). Em `criar`, o passo 1 já exige as duas pontas visíveis.
1. Conta: `conta_visivel`; `arquivado` -> `CONTA_ARQUIVADA`. Transferência: o mesmo para o destino; `conta_id == conta_destino_id` -> `VALIDACAO` (`campos.conta_destino_id`).
2. **Dono e conta (RG-04, RF-2.15)**, só despesa e receita: `dono_usuario_id` nulo exige `conta.casal_id == ctx.casal_ativo_id` e casal ativo existente; dono preenchido exige `dono ∈ {ctx.usuario_id, ctx.parceiro_id}` e `conta.usuario_id == dono`. Violação -> `DONO_CONTA_INCOMPATIVEL`. Transferência e reajuste não têm dono.
3. Categoria (despesa e receita): `categoria_visivel` (senão `VALIDACAO`); `categoria.tipo == tipo` (`CATEGORIA_TIPO_INVALIDO`); não arquivada (`CATEGORIA_ARQUIVADA`), exceto se for a mesma que o lançamento já tem.
4. Tags: todas visíveis (senão `VALIDACAO` em `campos.tag_ids`); a lista substitui as ligações.
5. Situação padrão (RF-2.16), `criado_por_id = ctx.usuario_id` só na criação (RF-2.23).

- `criar`: valida, grava `lancamento` e `lancamento_tag`, commit. A fatia 3 estende com a recorrência.
- `editar`: `tipo = 'reajuste'` -> `LANCAMENTO_NAO_EDITAVEL`; conta (atual ou nova) arquivada -> `CONTA_ARQUIVADA`; aplica os campos enviados; **saldos não são regravados** (derivados, `comum.md` §4), então editar valor, data ou situação "recalcula" por construção (RF-2.19). `situacao` aceita `prevista` e `confirmada` nos dois sentidos; `atrasada` é recusada (RF-2.18).
- `confirmar(db, ctx, id, valor=None)`: `confirmada` -> `LANCAMENTO_JA_CONFIRMADO`; conta arquivada -> `CONTA_ARQUIVADA`; se `valor` vier, substitui (`> 0`); `situacao = 'confirmada'` (RF-2.17). Vale para despesa, receita e transferência.
- `excluir`: remove `lancamento_tag` e o lançamento; conta arquivada recusa; reajuste pode ser excluído.
- `listar_mes(db, ctx, mes, conta_id=None)`: `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))`; seleciona por `data BETWEEN primeiro e último dia do mês` com `filtro_lancamentos(ctx)` (origem **ou** destino visível, `comum.md` §7.3 regra 1); carrega tags e categorias em consultas por `IN` (não por linha); monta `situacao` por `situacao_exibida` e `aporte` conforme §4.1.
- Isolamento (RF-2.23, CA-2.22): lançamento sem nenhuma ponta visível não é visível; id direto -> 404. Saldos e balanço contam o lançamento pelas contas visíveis (as duas pontas continuam compondo o saldo da conta de cada pessoa, `comum.md` §7.3 regra 4b).

### 4.7 Padrões do cadastro (`services/padroes.py`)
- `criar_conta_individual(db, usuario)`: `conta(usuario_id, nome=f"Conta de {nome}"[:60], tipo='conta_corrente', cor='#1E88E5', saldo_inicial=0)` (RF-2.01, CA-2.01). O nome é cortado em 60 caracteres, pois `conta.nome` é VARCHAR(60) e `usuario.nome` vai até 80 (D-031).
- `criar_categorias_padrao(db, usuario_id)` (RF-2.08, referência §10); icones são nomes do `lucide-react` e **devem existir na lista fechada de `componentes/icones.ts`**:

| Categoria (tipo, cor) | Ícone | Subcategorias (ícone) |
|---|---|---|
| Moradia/Casa (despesa, `#6D4C41`) | `house` | - |
| Gastos fixos (despesa, `#1E88E5`) | `receipt` | Contas (`file-text`), Saúde (`heart-pulse`), Transporte (`car`) |
| Gastos variáveis (despesa, `#F9A825`) | `shopping-bag` | Mercado (`shopping-cart`), Compras (`shopping-bag`), Alimentação fora (`utensils`), Assinaturas (`repeat`), Educação (`graduation-cap`), Lazer (`party-popper`) |
| Investimento (despesa, `#00897B`) | `piggy-bank` | - |
| Outros (despesa, `#757575`) | `ellipsis` | - |
| **Salário** (receita, `#2E7D32`, `fixa = 1`) | `banknote` | Salário (`banknote`), 13º (`gift`), Férias (`tree-palm`), Horas extras (`clock`) |

(Nomes de ícone que não existirem na versão instalada do `lucide-react` são trocados em `icones.ts` e em `padroes.py` juntos.)

### 4.8 União e cópia no vínculo e desvínculo (`services/vinculo_dados.py`)
Chamadas por `ganchos.ao_cadastrar`, `ao_vincular`, `ao_desvincular` (fatia 1 §4.9), dentro da transação do chamador. **A comparação de nomes é feita pelo banco** (join pelo nome com a collation `as_ci` da coluna), não em Python, para coincidir exatamente com a unicidade.

- `ao_cadastrar(db, usuario)`: `criar_conta_individual`, `criar_categorias_padrao` (§4.7).
- `ao_vincular(db, casal)`:
  1. **Conta conjunta**: `conta(casal_id=casal.id, nome='Conta conjunta', tipo='conta_corrente', cor='#8E24AA', saldo_inicial=0)` (RF-2.01, RF-1.10: sempre nova).
  2. **União de categorias (RF-2.08, CA-2.23)**, para `A = pessoa_a_id` e `B = pessoa_b_id`:
     - converte **no lugar** todas as categorias de A para o casal (`usuario_id = NULL`, `casal_id = casal.id`); como o `id` não muda, os lançamentos de A não são tocados;
     - para cada raiz de B com raiz de A de mesmo `tipo` e nome: as subcategorias de B de mesmo nome sob o par se fundem na de A (reapontam-se os `ALVOS_CATEGORIA` e apaga-se a de B); as demais subcategorias de B passam a ter o pai de A e o escopo do casal; reaponta-se a raiz de B para a de A e apaga-se. Raiz de B sem par vira do casal com suas subcategorias (`UPDATE` único de dono e pai, para não violar `uq_categoria_...`);
     - cor, ícone e grafia do nome ficam os de A (RF-2.08, D-026); a categoria resultante fica **ativa** se ao menos uma das duas estava ativa.
  3. **União de tags (RF-2.12)**: igual: converte as de A; tag de B com mesmo nome é fundida na de A (`UPDATE IGNORE` nos `ALVOS_TAG` e depois apaga as ligações repetidas e a tag de B); as demais viram do casal.
  Invariante ao fim: a pessoa vinculada não tem categoria nem tag pessoal. (A fatia 2 não trata transferências nem recorrências entre as duas individuais; isso é do `ao_desvincular`, abaixo.)
- `ao_desvincular(db, casal)`:
  1. **Conta conjunta**: `arquivado = 1` e `ganchos.ao_arquivar_conta(db, conjunta)`.
  2. **Cópia (RF-1.10, D-026)**: para cada pessoa `P` em `{A, B}`: copia **todas** as categorias e tags do casal (inclusive arquivadas, ícones, cores e a flag `fixa`) como categorias/tags de `P`, preservando a relação pai-filho; em cada alvo de `ALVOS_CATEGORIA` e `ALVOS_TAG`, reaponta para a cópia de `P` as linhas cuja **conta é a individual de `P`**. Lançamentos da conjunta (arquivada) continuam apontando para as categorias e tags do casal encerrado: aparecem normalmente na leitura da conjunta (nome vem do join), mas essas listas não são editáveis nem listadas (visibilidade exige `casal_ativo_id`).
  3. **Transferências e recorrências entre as duas individuais**: regra 4 de `comum.md` §7.3 (encerrar as recorrências cruzadas, apagar as previstas, manter as confirmadas como histórico somente leitura). Não é implementado aqui: a fatia 3 estende `ao_desvincular` (a tabela `recorrencia` só existe lá). Nesta fatia, a regra 2 de §7.3 já deixa essas transferências somente leitura (`lancamento_gravavel`), e as previstas ficam até a fatia 3.
- Idempotência: `ao_vincular` e `ao_desvincular` rodam uma vez por vínculo/desvínculo, na mesma transação que muda o estado do casal; falha desfaz tudo (CA-2.23).

### 4.9 Ganchos declarados nesta fatia (`services/ganchos.py`)
Além dos três da fatia 1 (agora implementados por `vinculo_dados.py`):

| Gancho | Chamado por | Padrão nesta fatia | Implementado |
|---|---|---|---|
| `antes_de_ler_periodo(db, ctx, ate: date) -> None` | `contas.listar`, `lancamentos.listar_mes` | não faz nada | fatia 3 (gera as ocorrências de recorrência até `ate`) |
| `ao_arquivar_conta(db, conta) -> None` | `contas.arquivar`, `ao_desvincular` | não faz nada | fatia 3 (RF-3.07) |
| `ajuste_cartao_previsto(db, conta_ids, ate: date) -> dict[int, Decimal]` | `saldos_previstos` | `{id: Decimal("0.00")}` | fatia 4 (faturas a debitar até `ate`, RG-06) |

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4; componentes em §2 e §3)
| Rota | Tela | Observações |
|---|---|---|
| `/controle` | Lista do mês (esqueleto) | `SeletorMes` fixo no topo (RF-0.03); `ListaLancamentos` agrupada por data com `SituacaoIcone` (confirmada, prevista, atrasada em laranja com ícone e texto, RF-0.08); ações por item: Confirmar, Editar, Excluir; estado vazio com botão "Novo lançamento" (RF-0.07, CA-0.07); chips de atalho para Contas, Categorias, Tags (a fatia 3 acrescenta Proporção). Cards de resumo e filtros são da fatia 5 |
| `/controle/contas` | Contas | `CardsResumo` com saldo atual total e previsto total; um `CardConta` por conta ativa; toque abre ações: editar, reajustar saldo, arquivar, ver lançamentos |
| `/controle/contas/arquivadas` | Contas arquivadas | cards em leitura; "Desarquivar" (oculto para conjunta de casal encerrado); estado vazio |
| `/controle/contas/:contaId` | Lançamentos de uma conta | rota já na tabela de `front.md` §4: mesma lista, filtrada por `conta_id`; em conta arquivada sem ações de escrita (CA-2.05) |
| `/controle/categorias` | Categorias | abas Despesas / Receitas; árvore com ícone e cor; criar categoria/subcategoria, editar, arquivar (diálogo pede a categoria de destino quando em uso), "Mover lançamentos"; Salário sem editar nome/arquivar |
| `/controle/tags` | Tags | lista, criar, renomear, excluir (com confirmação); estado vazio |

**Formulários** (`front.md` §8; abrem por `FormulariosProvider.abrir`, não são rota):
- **Despesa** e **Receita**: essenciais = valor (máscara em centavos), data (atalhos Hoje / Ontem / Outra data), descrição, categoria ("Categoria > Subcategoria", só ativas), dono (Casal, a própria pessoa, o parceiro; "Casal" só com vínculo), conta (preenchida e **bloqueada** conforme o dono: casal -> conjunta; pessoa -> individual dela, RF-2.15), situação ("Foi paga" / "Foi recebida"; começa marcada se a data é hoje ou passada, RF-2.16). "Mais detalhes": tags (multisseleção) e observação. Dono padrão de abertura: a pessoa logada.
- **Aporte/Transferência**: essenciais = valor, data, conta de origem, conta de destino (diferentes), situação; "Mais detalhes": tags e observação. Origem individual e destino conjunta formam um aporte (identificado na lista com o rótulo "Aporte").
- "Salvar" e "Salvar e criar nova" só na criação (RF-0.06). Erros de campo vêm de `ApiError.campos` (RNF-09). Confirmar abre um pequeno diálogo com o valor real editável (RF-2.17). O detalhe do lançamento mostra "Criado por {nome}" (RF-2.23).

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | `lancamento` guarda um `valor` só; "valor real" ao confirmar sobrescreve o previsto | Os requisitos nunca pedem o previsto depois de confirmado, e a fatia 3 usa "confirmado se confirmado, previsto se prevista" (RF-3.09), que vira "o `valor`" | Colunas `valor_previsto` e `valor_real` |
| D2 | Exatamente 1 conta individual por pessoa e 1 conjunta por casal por índices únicos | Implementa RF-2.01 no banco; `NULL` não colide | Só validar no service |
| D3 | Chave de escopo gerada (`escopo`) para unicidade de nome | `NULL` em `usuario_id`/`casal_id` quebraria o índice único | Índice `(usuario_id, casal_id, nome)` |
| D4 | União no vínculo converte as categorias de A **no lugar** | Não reaponta lançamentos de A, menos escrita e menos risco | Copiar tudo e reapontar |
| D5 | "Mover lançamentos" e "arquivar" de uma raiz incluem as subcategorias | O usuário vê a raiz como total das filhas; arquivar a raiz arquiva as filhas, então elas têm de ir juntas | Mover só os lançamentos diretamente na raiz |
| D6 | Reajuste é um `lancamento` de tipo `reajuste` com valor com sinal | RG-09; entra no saldo e é fácil excluir do balanço por `tipo` | Coluna de ajuste na conta |
| D7 | Reajuste não é editável (só excluível) | É gerado pelo sistema; editar abriria dois caminhos para o mesmo saldo | Permitir editar |
| D8 | Sem `DELETE` de categoria e sem desarquivar categoria | RF-2.10 só pede criar, editar, arquivar; apagar categoria deixaria lançamento sem categoria ou exigiria reapontar | Permitir excluir categoria sem uso e desarquivar (tela e rota sem requisito; a pessoa cria outra com o mesmo nome se precisar) |
| D9 | `PATCH` valida o estado resultante, não só os campos enviados | Regras como RG-04 relacionam dono e conta | Validar campo a campo |
| D10 | Referência inválida no corpo = 422 genérico; no caminho = 404 | Não revelar ids de outro casal (CA-N.05) sem quebrar o contrato de formulário | 404 também no corpo |
| D11 | Rotas de conta sem `POST`/`DELETE` | RF-2.01: três contas fixas (uma individual por pessoa e uma conjunta por casal, criadas pelos ganchos) | Criar e excluir contas livremente (quebra D2 e a regra de dono/conta, RG-04, sem requisito) |
| D12 | Lista do mês sem paginação | RNF-07 (500 por mês), `comum.md` §6.1 | Paginar |

Riscos:
- **Coluna gerada e `IntegrityError` na união**: a conversão no lugar muda `escopo` por `UPDATE`; a ordem de §4.8 (fundir duplicadas antes de converter as de B) evita colisão. O cenário de CA-2.23 roda em MySQL real nos testes de integração.
- **Dupla contagem em `ALVOS_*`**: se uma fatia nova criar tabela que aponte para `categoria` ou `tag` e esquecer de entrar em `alvos_vinculo.py`, arquivar/unir/copiar deixam registros órfãos ou para trás. A revisão confere isso a cada fatia (checklist: "toda FK para `categoria`/`tag` está em `ALVOS_*`"). Conteúdo esperado de `ALVOS_*` ao fim de cada fatia:
  - fatia 2: `ALVOS_CATEGORIA` = `lancamento`; `ALVOS_TAG` = `lancamento_tag`;
  - fatia 3: acrescenta `recorrencia` a `ALVOS_CATEGORIA` e `recorrencia_tag` a `ALVOS_TAG`;
  - fatia 4: acrescenta `item_fatura` e `serie_cartao` a `ALVOS_CATEGORIA`, e as duas tabelas de tag (`item_fatura_tag`, `serie_cartao_tag`) a `ALVOS_TAG`;
  - fatias 5 e 6: nada (não criam FK para `categoria` nem `tag`);
  - fatia 7: **não** acrescenta `orcamento_item`, de propósito (`fatia-7.md` D3); a exceção está declarada lá e não é esquecimento.
- **Saldo por `SUM` com a `UNION ALL` de origem e destino**: o índice `ix_lancamento_conta_destino_id_data` existe para isso; medir em CA-N.06.
- **Nomes de ícone** do `lucide-react` podem diferir por versão: conferir em `componentes/icones.ts`.
- **Comparação de nome pelo banco** na união depende do join respeitar a collation das colunas; os testes validam com "Mercado"/"mercado" e "Saude"/"Saúde".
