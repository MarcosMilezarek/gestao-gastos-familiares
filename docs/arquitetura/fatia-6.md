# Fatia 6: Metas e patrimônio

> Só o que é da fatia 6. Convenções: `comum.md` §4, §5.2, §6, §7.3. Lançamentos, saldos e situação: `fatia-2.md` §2.2, §3.4, §4.1, §4.6. Lista do Controle e projeção (que já tratam `aplicacao`/`resgate`): `fatia-5.md` §4. `ganchos`, `tempo.py`: `fatia-1.md` §4.9, §4.10. Telas: `front.md`.
> Pré-requisito: fatias 1 a 5 integradas. Migrações desta fatia: `0009` e `0010`.

## 1. Escopo e RF cobertos

Meta do casal (sem dono, sem metas individuais), valor inicial, aplicação e resgate (movimentos da conta **conjunta**), rendimento manual, cálculos derivados (valor atual, falta, porcentagem, situação), patrimônio total, histórico e as regras de exclusão e de conta arquivada. Os modelos de meta (RF-6.02) existem só no front.

## 2. Tabelas e migrações

Convenções de `comum.md` §4. Dinheiro `DECIMAL(12,2)`; FKs `RESTRICT`; `criado_em`/`atualizado_em`.

### 2.1 Migração `0009_meta`

**`meta`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| casal_id | BIGINT UNSIGNED | NOT NULL, FK casal |
| nome | VARCHAR(80) | NOT NULL |
| valor_alvo | DECIMAL(12,2) | NOT NULL, `ck_meta_valor_alvo` `valor_alvo > 0` |
| data_alvo | DATE | NULL |
| valor_inicial | DECIMAL(12,2) | NOT NULL DEFAULT 0, `ck_meta_valor_inicial` `valor_inicial >= 0` |
| cor | CHAR(7) | NOT NULL (`#RRGGBB`) |
| icone | VARCHAR(40) | NOT NULL (nome do ícone, `front.md` §6) |
| descricao | VARCHAR(500) | NULL |
| criado_em, atualizado_em | DATETIME(6) | |

Índice `ix_meta_casal_id`. Não há `usuario_id` nem dono: meta é do casal (RF-6.01).

**`meta_rendimento`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| meta_id | BIGINT UNSIGNED | NOT NULL, FK meta |
| data | DATE | NOT NULL |
| valor | DECIMAL(12,2) | NOT NULL, `ck_meta_rendimento_valor` `valor <> 0` (com sinal) |
| criado_por_id | BIGINT UNSIGNED | NOT NULL, FK usuario |
| criado_em, atualizado_em | DATETIME(6) | |

Índice `ix_meta_rendimento_meta_id_data (meta_id, data)`. O rendimento **não é lançamento**: não toca saldo de conta nem balanço (RF-6.06, D5).

### 2.2 Migração `0010_lancamento_meta`

Altera `lancamento` (`fatia-2.md` §2.2, já alterada pela `fatia-4.md` §2.3):
- `ck_lancamento_tipo` passa a aceitar `aplicacao` e `resgate` (a revisão recria a `CHECK` com a lista completa: `despesa`, `receita`, `transferencia`, `reajuste`, `pagamento_fatura`, `aplicacao`, `resgate`); `meta_id` BIGINT UNSIGNED NULL, FK `meta`; `ck_lancamento_meta` `(tipo IN ('aplicacao','resgate')) = (meta_id IS NOT NULL)`; índice `ix_lancamento_meta_id_situacao (meta_id, situacao)`.
- As demais `CHECK` já servem (`valor > 0`; `categoria_id`, `conta_destino_id`, `dono_usuario_id` nulos para os tipos novos; `descricao` pode ser nula). `conta_id` é a conta conjunta do casal da meta.
- `upgrade()`, nesta ordem: coluna `meta_id`; índice `ix_lancamento_meta_id_situacao` (sustenta a FK); FK; `ck_lancamento_tipo` recriada (drop e create, como a `0008`); `ck_lancamento_meta`.
- `downgrade()`, nesta ordem: (1) um **único** `ALTER TABLE lancamento DROP CHECK ck_lancamento_tipo, ADD CONSTRAINT ck_lancamento_tipo CHECK (tipo IN ('despesa', 'receita', 'transferencia', 'reajuste', 'pagamento_fatura'))`, a lista da `0008`, como o `downgrade` da `0008`: com aplicação ou resgate gravados o MySQL recusa a `CHECK` nova e nada muda (um único `ALTER` é atômico); (2) `ck_lancamento_meta`; (3) FK; (4) índice (a FK sai antes do índice que a sustenta); (5) coluna `meta_id` (a `CHECK` sai antes da coluna).

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória; ids de outro casal respondem `404 NAO_ENCONTRADO`. Referência no corpo a recurso inexistente ou de outro casal: `422 VALIDACAO` genérico. Meta é visível se `casal_id ∈ casais_ids`; **escrita só se `casal_id == casal_ativo_id`** (`comum.md` §7.3).

### 3.0 Objetos de saída
```
MetaSaida = { "id": 3, "nome": "Reserva", "valor_alvo": "30000.00", "data_alvo": "2027-09-30" | null,
              "valor_inicial": "1000.00", "cor": "#00897B", "icone": "shield", "descricao": null | "…",
              "valor_atual": "3300.00", "aplicado_liquido": "2200.00", "rendeu": "100.00", "falta": "6700.00",
              "porcentagem": "33.00",                     // pode passar de 100.00
              "situacao": "em_andamento" | "concluida",   // derivada de valor_atual >= valor_alvo
              "casal_encerrado": false }
MovimentoMeta = { "tipo": "inicial" | "aplicacao" | "resgate" | "rendimento",
                  "id": 90 | null,                         // id do lançamento (aplicação, resgate) ou do rendimento; null no inicial
                  "data": "2026-10-05",
                  "valor": "500.00",                       // efeito NA META: aplicação +, resgate −, rendimento ±, inicial +
                  "situacao": "confirmada" | "prevista" | "atrasada" | null,   // null em inicial e rendimento
                  "descricao": null | "…" }
MetaDetalhe = MetaSaida + { "movimentos": [ MovimentoMeta ] }       // ordem: data desc, id desc; o inicial usa a data de criação da meta (no fuso APP_TZ)
RendimentoSaida = { "id": 5, "meta_id": 3, "data": "2026-10-29", "valor": "100.00" }
```
`LancamentoSaida` (`fatia-2.md` §3) ganha `meta: null | { "id": 3, "nome": "Reserva" }` e os `tipo` `aplicacao`, `resgate` (com `categoria`, `dono_usuario_id`, `conta_destino_id`, `tags` vazios/nulos). Movimentos **previstos** aparecem no histórico e **não** entram nos cálculos (§4.1).

### 3.1 Metas (RF-6.01, 6.07 a 6.13)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/metas` | - | `{ "patrimonio_total": "6600.00", "metas": [MetaSaida] }` (metas de `casais_ids`; `patrimonio_total` soma o `valor_atual` das do casal **ativo**, em andamento e concluídas; sem casal ativo, `"0.00"`); o front separa as abas por `situacao` | - |
| `POST /api/metas` | `{ nome, valor_alvo, data_alvo?, valor_inicial?, cor, icone, descricao? }` | `201` `MetaSaida` | 409 `SEM_VINCULO`; 422 (nome vazio ou > 80, `valor_alvo` ≤ 0, `valor_inicial` < 0, cor fora de `#RRGGBB`, `descricao` > 500) |
| `GET /api/metas/{id}` | - | `MetaDetalhe` | 404 |
| `PATCH /api/metas/{id}` | qualquer campo do `POST`, todos opcionais (`data_alvo: null` remove a data) | `MetaSaida` | 404; 409 `CASAL_ENCERRADO`, `META_FICARIA_NEGATIVA` (reduzir `valor_inicial` deixaria o valor atual negativo); 422 |
| `DELETE /api/metas/{id}` | - | `204` | 404; 409 `CASAL_ENCERRADO`, `META_COM_MOVIMENTOS` (qualquer aplicação, resgate ou rendimento, em qualquer situação) |

### 3.2 Aplicação, resgate e rendimento (RF-6.04 a 6.06, 6.12, 6.14)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `POST /api/metas/{id}/aplicacoes` | `{ valor, data, descricao?, situacao? }` | `201` `LancamentoSaida` (`tipo = "aplicacao"`) | 404; 409 `CONTA_ARQUIVADA`; 422 (valor ≤ 0, data) |
| `POST /api/metas/{id}/resgates` | `{ valor, data, descricao?, situacao? }` | `201` `LancamentoSaida` (`tipo = "resgate"`) | 404; 409 `CONTA_ARQUIVADA`, `RESGATE_SUPERA_META` (`campos.valor`: "O resgate não pode ser maior que o valor atual da meta (R$ …)"); 422 |
| `POST /api/metas/{id}/rendimentos` | `{ "valor_atual": "1600.00" }` (valor atual informado, zero ou maior; sem `data`: o service grava `hoje()`, RF-6.06) | `{ "rendimento": RendimentoSaida \| null, "meta": MetaSaida }` (`null` quando a diferença é zero, CA-6.06) | 404; 409 `CASAL_ENCERRADO`; 422 |
| `PATCH /api/metas/{id}/rendimentos/{rendimento_id}` | `{ valor?, data? }` (`valor` com sinal, ≠ 0) | `RendimentoSaida` | 404; 409 `CASAL_ENCERRADO`, `META_FICARIA_NEGATIVA`; 422 (inclui `data` fora de `tempo.validar_data`) |
| `DELETE /api/metas/{id}/rendimentos/{rendimento_id}` | - | `204` | 404; 409 `CASAL_ENCERRADO`, `META_FICARIA_NEGATIVA` |

`situacao` omitida: `confirmada` se `data <= hoje()`, senão `prevista` (RF-2.16). Não há campo de conta nem de dono (RF-6.04): a conta é a conjunta do casal da meta.
**Editar, excluir e confirmar** aplicação e resgate usam as rotas de lançamento (`PATCH`/`DELETE /api/lancamentos/{id}` e `POST /api/lancamentos/{id}/confirmar`, `fatia-2.md` §3.4), que delegam à regra da meta (§4.3). Na edição valem `valor`, `data`, `descricao`, `situacao`; **qualquer outro campo enviado** (`meta_id`, `tag_ids`, `observacao`, `categoria_id`, `dono_usuario_id`, `conta_id`, `conta_destino_id`) -> `422 VALIDACAO` (`campos.<campo>`). Como `LancamentoEdicaoEntrada` não tem `meta_id` e Pydantic ignora campo desconhecido, o schema ganha `meta_id: int | None = None` **só para a recusa** (a checagem usa `model_fields_set`). `data` é validada por `tempo.validar_data`. `confirmar` mantém `LANCAMENTO_JA_CONFIRMADO` para movimento já confirmado. Erros adicionais dessas rotas para estes tipos: `RESGATE_SUPERA_META`, `META_FICARIA_NEGATIVA`, `CONTA_ARQUIVADA`.
Schemas reaproveitam `Cor` e `Icone` (`schemas/categoria.py`), `ValorPositivo`, `Descricao` e `Situacao` (`schemas/lancamento.py`) em vez de redefini-los; `Dinheiro` vem de `money.py`.

### 3.3 Códigos de erro da fatia (acrescentados em `errors.py`; todos 409)
`META_COM_MOVIMENTOS`, `RESGATE_SUPERA_META`, `META_FICARIA_NEGATIVA`, `CASAL_ENCERRADO` (também usado pela fatia 7). `errors.py` só tem constantes de código: as mensagens abaixo vão no `raise AppError(409, CODIGO, "…")` de cada service, não no módulo de erros.
- `META_FICARIA_NEGATIVA`: "Isso deixaria o valor da meta negativo: um resgate passaria a superar o valor atual".
- `CASAL_ENCERRADO`: "O casal foi desfeito; este item só pode ser consultado".
- `RESGATE_SUPERA_META`: ver §3.2 (`campos.valor`).
Reutiliza `SEM_VINCULO`, `CONTA_ARQUIVADA`, `NAO_ENCONTRADO`, `VALIDACAO`, `LANCAMENTO_NAO_EDITAVEL`.

## 4. Regras dos services

### 4.1 Cálculos (`services/metas_calculo.py`, puro; `services/metas.py` para a carga)
`indicadores(valor_alvo, valor_inicial, aplicacoes, resgates, rendimentos) -> Indicadores` com `aplicado_liquido = aplicacoes − resgates`, `rendeu = rendimentos`, `valor_atual = valor_inicial + aplicado_liquido + rendeu`, `falta = max(valor_alvo − valor_atual, 0)`, `porcentagem = money.porcentagem(valor_atual, valor_alvo)` (já existe em `money.py`; 2 casas, pode passar de 100, `fatia-4.md` §4.1; a fatia só usa), `situacao = concluida` se `valor_atual >= valor_alvo`, senão `em_andamento`. Entradas em `Decimal`; sem `float`. Confere CA-6.07 (3.300,00 / 6.700,00 / 33,00%) e CA-6.08 (999,99 -> em andamento; +0,01 -> concluída).
`metas.carregar_indicadores(db, meta_ids) -> dict[int, Indicadores]`: **duas consultas** para todas as metas: `SUM(valor)` de `lancamento` com `meta_id IN …` e `situacao = 'confirmada'`, agrupado por `(meta_id, tipo)`; e `SUM(valor)` de `meta_rendimento` por `meta_id`, **sem filtro de data nem de situação** (rendimento não tem situação; com data futura conta na hora, RF-6.06, D-052, CA-6.06). **Só lançamentos confirmados contam** (RF-6.07); o previsto passa a contar ao ser confirmado.
`saldos.py` (`fatia-2.md` §4.1): não há tabela de efeitos; o `case` de `saldos._movimentos` soma `receita` e `reajuste` e subtrai todo o resto. Só `resgate` entra na soma (passa a constar da lista do `case`); `aplicacao` já cai no `else` (`−valor`). Assim a aplicação confirmada reduz o saldo atual da conjunta e a prevista entra no saldo previsto (CA-6.04). O valor inicial e o rendimento **não** passam por `saldos` (RF-6.03, RF-6.06).
`tempo.para_data_local(dt: datetime) -> date` (instante UTC -> data civil em `APP_TZ`) já existe; a fatia só a usa, para a data do movimento "inicial".

### 4.2 Metas (`services/metas.py`)
- `listar`, `detalhe`: `meta_visivel`; `detalhe` monta `movimentos` com lançamentos da meta (todas as situações, `situacao` por `saldos.situacao_exibida`), rendimentos e o inicial (omitido se `valor_inicial = 0`); `casal_encerrado` = o casal da meta tem `encerrado_em`.
- `criar`: sem casal ativo -> `SEM_VINCULO`; grava com `casal_id = ctx.casal_ativo_id`. Qualquer das duas pessoas cria e opera (RG-02).
- `editar`, `excluir`: travam a meta (`travar_meta(..., gravavel=True)`); meta de casal encerrado -> `CASAL_ENCERRADO`; `excluir` com algum lançamento de `meta_id` ou rendimento -> `META_COM_MOVIMENTOS`. Mudar `valor_alvo`/`data_alvo`/dados não toca movimentos; mudar `valor_inicial` passa pelo invariante (§4.4), que `editar` também usa: por isso `travar_meta` e `verificar_invariante` ficam **neste módulo**, e `metas_movimentos` os importa.
- `travar_meta(db, ctx, meta_id, gravavel: bool = False) -> Meta`: `meta_gravavel` se `gravavel`, senão `meta_visivel`; depois relê a linha com `select(Meta).where(Meta.id == meta_id).with_for_update().execution_options(populate_existing=True)`, como `faturas.travar_cartao`, para o invariante e os indicadores verem o estado travado (D3).
- `meta_visivel(db, ctx, meta_id) -> Meta` e `meta_gravavel(...)` (visível e do casal ativo, senão `CASAL_ENCERRADO`) em `acesso.py`.

### 4.3 Movimentos (`services/metas_movimentos.py`)
Toda operação trava a linha da meta com `metas.travar_meta` (`FOR UPDATE`, §4.2) antes de ler os indicadores (duas pessoas mexendo ao mesmo tempo, D3). Aplicar, resgatar e editar travam **a meta, não a conta**.
- `aplicar` / `resgatar(db, ctx, meta_id, dados)`: `meta_visivel`; a conta é a **conjunta do casal da meta** (`conta.casal_id = meta.casal_id`); arquivada (inclui casal desfeito) -> `CONTA_ARQUIVADA` (RF-6.14). Cria `lancamento(tipo, valor, data, situacao, descricao, conta_id, meta_id, criado_por_id)`. `resgatar`: `valor <= valor_atual` (confirmado) senão `RESGATE_SUPERA_META` (vale também para resgate previsto no momento do lançamento; é reconferido ao confirmar, pelo invariante).
- `editar_movimento` / `excluir_movimento` / `confirmar_movimento(db, ctx, lancamento, …)`: chamados por `lancamentos.editar/excluir/confirmar` (`fatia-2.md` §4.6) quando `tipo IN ('aplicacao','resgate')`. Conta arquivada recusa (`CONTA_ARQUIVADA`). `confirmar` aceita ajustar o `valor`; `situacao` pode ir de `prevista` a `confirmada` e de volta. O `meta_id` vem do lançamento já carregado (não é editável); depois de `travar_meta`, o service **relê o lançamento** com `populate_existing` (como `faturas.travar_cartao`), porque a leitura anterior à trava pode estar velha; se sumiu, `404 NAO_ENCONTRADO`. **Resgate que continua previsto** (RF-6.12 × D9): o invariante só vê movimentos confirmados e não pegaria o excesso, então, ao criar um resgate `prevista`, ou ao editar um que continua `prevista` **e cujo `valor` muda**, o `valor` é comparado com o `valor_atual` (confirmado) e, se maior, `RESGATE_SUPERA_META`; editar só `descricao` ou `data` não é comparado nem recusado (D-054). É a mesma regra de RF-6.05 e RF-6.12, não uma nova. Ao confirmar, o invariante cobre.
- `atualizar_valor(db, ctx, meta_id, valor_atual)` (rendimento): meta de casal encerrado -> `CASAL_ENCERRADO`; `diferenca = valor_atual − indicadores.valor_atual`; `0` não cria registro; senão grava `meta_rendimento(valor=diferenca, data=hoje())` (a criação não pede data, RF-6.06). Como `valor_atual >= 0`, o valor atual resultante nunca é negativo. `editar_rendimento`/`excluir_rendimento` passam pelo invariante; `editar_rendimento` valida `data` com `tempo.validar_data`, e a data editada para o futuro não tira o rendimento do valor atual (§4.1, CA-6.06).
- Todas terminam com **`verificar_invariante`** e um `commit`.

### 4.4 Invariante do valor atual
`verificar_invariante(db, meta_id, codigo)` (em `services/metas.py`, junto de `travar_meta`; §4.2): depois de aplicar a mudança (já gravada na sessão, antes do `commit`), recalcula `valor_atual` da meta; se `< 0`, lança `AppError(409, codigo)` e a transação é desfeita. Código: `RESGATE_SUPERA_META` quando a operação cria, edita ou confirma um **resgate**; `META_FICARIA_NEGATIVA` nos demais casos (excluir ou reduzir aplicação, editar `valor_inicial`, editar ou excluir rendimento). Esta única regra substitui "resgate ≤ valor atual" em cada caminho (CA-6.05 e CA-6.12: editar uma aplicação de modo que um resgate passe a superar o valor atual é recusado). **Limite:** o invariante só enxerga confirmados; o resgate que continua previsto e tem o `valor` alterado na edição recebe a comparação direta com o valor atual descrita em §4.3 (D9, D-054); editar só descrição ou data dele não é comparado.

### 4.5 Integração com outras fatias (feita nesta fatia)
- `services/lancamentos.py` e `schemas/lancamento.py`: delegações de §4.3, com `from app.services import metas_movimentos` **dentro** da função (como já faz com `recorrencias_alcance`; evita ciclo de importação entre os dois services); corpo de `PATCH` limitado a quatro campos para os tipos novos (§3.2); `LancamentoSaida.meta: MetaRefSaida | None` (`MetaRefSaida = { id, nome }`, definido em `schemas/lancamento.py`) carregado por `IN` em `montar_saidas`. `POST /api/lancamentos` continua sem aceitar `aplicacao`/`resgate` (só pelas rotas de meta).
- `services/lista_controle.py` e `schemas/controle.py`: o campo real é `ItemLancamentoLista.meta` (hoje `meta: None = None`), que passa a `MetaRefSaida | None` (importado de `schemas/lancamento.py`), com o **mesmo valor** de `LancamentoSaida.meta` do item; o service o preenche a partir dele. Os rótulos ("Aplicação em meta", "Resgate de meta") e o filtro `tipo=aplicacao_resgate` **já existem** (fatia 5); não se refazem.
- **Conferido, não muda** (fatia 5, D8): balanço (`movimentos.py`), Início (RF-5.17 lista só `despesa`, `receita`, `transferencia`, então aplicação e resgate previstos não aparecem em "pendentes"), relatórios, proporção, projeção (já soma `aplicacoes_menos_resgates`) e `saldo_dia`. `aplicacao_resgate` fica fora de entradas e saídas, fora da base do aporte (só `despesa`) e do gasto do orçamento.
- `alvos_vinculo.py`: nenhuma tabela desta fatia aponta para `categoria` ou `tag`; sem alvos novos. A cópia no desvínculo (`fatia-2.md` §4.8) não toca metas: o casal desfeito mantém as suas, só para consulta.

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4)
| Rota | Tela | Observações |
|---|---|---|
| `/metas` | Metas | `CardsResumo` com o patrimônio total (do servidor); abas "Em andamento" e "Concluídas" (filtro por `situacao`, sem somar nada); `CardMeta` (nome, ícone, cor, valor atual, alvo, falta, porcentagem em texto e barra, data-alvo quando houver); "Nova meta"; `EstadoVazio` com "Criar meta" (RF-0.07, CA-6.09); metas de casal desfeito aparecem sem ações de escrita |
| `/metas/:metaId` | Detalhe da meta | dados, rendeu, aplicado líquido, falta, porcentagem; histórico (`MovimentoMeta`) com ícone e texto de situação; botões Aplicar, Resgatar, Atualizar valor atual; editar e excluir meta (`DialogoConfirmacao`; a exclusão recusada mostra a mensagem do servidor); em cada aplicação, resgate e rendimento: editar, excluir e (se não confirmado) Confirmar |

**Formulário de meta** (`BottomSheet`, não é rota): modelo (personalizado, reserva de emergência, entrada do apê, casamento, mudança, viagem; escolher um preenche nome, ícone e cor, tudo editável; o valor-alvo continua em branco; não há "meta individual"), nome, valor-alvo, data-alvo (opcional), valor inicial (padrão 0), `SeletorCor`, `SeletorIcone`, descrição (opcional). **Aplicar/Resgatar**: valor, data (atalhos Hoje/Ontem/Outra data), descrição opcional, situação ("Foi aplicado"/"Foi resgatado", padrão por RF-2.16); sem campo de conta nem de dono. **Atualizar valor atual**: um campo de valor. Erros de campo vêm de `ApiError.campos`.
Na lista do Controle (fatia 5), Editar e Excluir de aplicação/resgate levam ao detalhe da meta (D11); Confirmar funciona na lista.

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | Aplicação e resgate são `lancamento` (`aplicacao`, `resgate`) com `meta_id` e `conta_id` = conjunta | RF-6.04/6.05: movem o saldo da conjunta, têm situação prevista/confirmada, entram na lista e no filtro de tipo; o mecanismo de saldo e a lista já existem (`comum.md` §5.1) | Tabela própria de movimentos de meta (duplicaria saldo e lista) |
| D2 | Valor atual, falta, porcentagem e situação **calculados** | Editar/excluir/confirmar movimentos recalcula sozinho (RF-6.12); `comum.md` §4 | Coluna de valor atual mantida por service |
| D3 | Linha da meta travada (`FOR UPDATE`) em toda escrita de movimento | Duas pessoas resgatando ao mesmo tempo não podem estourar o valor atual | Checagem sem trava |
| D4 | Um **invariante** (valor atual ≥ 0 depois de toda mutação) em vez de regras separadas por caminho | RF-6.05 e RF-6.12 (editar aplicação que sustenta um resgate) são o mesmo fato; a regra única não deixa caminho sem verificação | `valor <= valor atual` só na criação do resgate |
| D5 | Rendimento em tabela própria, não em `lancamento` | RF-6.06: não toca saldo nem balanço; `lancamento` exigiria excluí-lo de toda consulta | Tipo `rendimento` em `lancamento` |
| D6 | Valor inicial é coluna de `meta` | RF-6.03: patrimônio que já existe, sem movimento de conta | Lançamento "inicial" (alteraria saldo) |
| D7 | Modelos de meta só no front | RF-6.02: "o modelo não é guardado"; são valores sugeridos | Tabela de modelos |
| D8 | Meta não arquiva; exclusão recusada com movimentos | RF-6.13; arquivar meta está fora da v1 (D-052) | Arquivar meta |
| D9 | Resgate previsto também é limitado ao valor atual no lançamento, e reconferido ao confirmar; na edição, só é comparado quando o `valor` muda (D-054) | RF-6.05 diz "no momento do resgate"; o invariante cobre a confirmação; editar descrição ou data não piora a situação | Aceitar resgate previsto sem limite |
| D10 | Patrimônio soma só as metas do casal ativo | RF-6.10 fala em "metas do casal"; as de casal desfeito são só histórico (RF-6.14) | Somar também as encerradas |
| D11 | Editar/Excluir de aplicação e resgate na lista do Controle levam ao detalhe da meta | Evita novo tipo de formulário no `FormulariosProvider` (`front.md` §8) e mantém a edição onde o limite do resgate é mostrado | Abrir o formulário da meta pelo provider |
| D12 | `PATCH` de aplicação/resgate só altera `valor`, `data`, `descricao`, `situacao` | O requisito não dá tags, observação nem troca de meta a esses movimentos | Permitir todos os campos de lançamento |

Riscos:
- **Delegação em `lancamentos.py`**: se um caminho de edição, exclusão ou confirmação de lançamento não passar pela delegação, a regra da meta é contornada. A revisão procura toda função de `lancamentos.py` que escreva e confere o desvio para `tipo IN ('aplicacao','resgate')`.
- **Invariante e ordem das operações**: o `verificar_invariante` tem de rodar com a mudança já na sessão (flush) e antes do `commit`; os casos de CA-6.05 e CA-6.12 são conferidos por leitura do código e executados nos testes de integração.
- **Trava na meta, não na conta**: aplicar, resgatar e editar travam a linha da meta (D3), não a da conta; o risco já aceito em D-032 para lançamentos de conta se estende a esses tipos (dois movimentos de metas diferentes na mesma conta conjunta não se serializam).
- **Casal desfeito**: aplicação ou resgate previsto de casal desfeito fica só para consulta, como previsto ou atrasado, sem efeito no valor da meta (consequência de RF-6.14: só confirmados contam e a conta arquivada recusa confirmar).
- **Conta conjunta de casal desfeito** é arquivada (`fatia-2.md` §4.8): aplicar e resgatar são recusados por `CONTA_ARQUIVADA`, sem regra extra; rendimento e edição da meta usam `CASAL_ENCERRADO`.
- **Data do valor inicial** no histórico vem da data de criação da meta; editar o valor inicial não muda essa data.
