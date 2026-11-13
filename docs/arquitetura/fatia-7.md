# Fatia 7: Planejamento (orçamento, cenários e plano de metas)

> Só o que é da fatia 7. Convenções: `comum.md` §4, §5.2, §6, §7.3. Proporção, `rateio` e `soma de Salário`: `fatia-3.md` §4.6 e §4.7. Gasto por categoria (somente leitura): `fatia-5.md` §4.6. `money.porcentagem`: `fatia-4.md` §4.1. `CASAL_ENCERRADO`, `SEM_VINCULO`: `fatia-6.md` §3.3, `fatia-1.md` §3.4. Telas: `front.md`.
> Pré-requisito: fatias 1 a 6 integradas. Migração desta fatia: `0011`.

## 1. Escopo e RF cobertos

Orçamento mensal por categoria (assistente em dois passos, resumo, copiar do mês anterior, comparação com o real), cenários hipotéticos (rendas e despesas, proporção, aporte e sobra) e plano de metas (cálculo na hora, nada gravado). **Esta fatia nunca escreve fora das suas quatro tabelas** (RF-7.01, D1).

## 2. Tabelas e migrações

Convenções de `comum.md` §4. Dinheiro `DECIMAL(12,2)`; FKs `RESTRICT`; `criado_em`/`atualizado_em`. **Não há tabela de plano de metas**: o resultado é só calculado e não é salvo (RF-7.13, CA-7.13; `comum.md` §5.1).

### 2.1 Migração `0011_planejamento`

**`orcamento`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| casal_id | BIGINT UNSIGNED | NOT NULL, FK casal |
| mes_ref | DATE | NOT NULL, dia 1 |
| renda | DECIMAL(12,2) | NOT NULL, `ck_orcamento_renda` `renda >= 0` |
| percentual_economia | DECIMAL(5,2) | NOT NULL, `ck_orcamento_percentual` entre 0 e 100 (dado **digitado** pela pessoa, não derivado: exceção consciente a `comum.md` §4 "porcentagens não são gravadas", D6) |
| criado_em, atualizado_em | DATETIME(6) | |

`uq_orcamento_casal_id_mes_ref (casal_id, mes_ref)`: no máximo um orçamento por casal e mês, garantido pelo banco (RF-7.03, CA-7.03).

**`orcamento_item`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| orcamento_id | BIGINT UNSIGNED | NOT NULL, FK orcamento |
| categoria_id | BIGINT UNSIGNED | NOT NULL, FK categoria |
| limite | DECIMAL(12,2) | NOT NULL, `ck_orcamento_item_limite` `limite >= 0` |

`uq_orcamento_item_orcamento_id_categoria_id`, `ix_orcamento_item_categoria_id`. Uma linha por limite **definido pela pessoa**: ou na categoria-mãe (sem limites nas filhas) ou nas subcategorias (e então a mãe não tem linha). O limite efetivo da mãe é derivado na leitura (§4.3, D2).

**`cenario`**: `id`, `casal_id` (FK casal, NOT NULL), `nome` VARCHAR(80) NOT NULL, `criado_em`, `atualizado_em`; `ix_cenario_casal_id`.

**`cenario_item`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| cenario_id | BIGINT UNSIGNED | NOT NULL, FK cenario |
| tipo | VARCHAR(10) | NOT NULL, `ck_cenario_item_tipo` IN (`renda`,`despesa`) |
| dono_usuario_id | BIGINT UNSIGNED | NULL, FK usuario; `ck_cenario_item_dono` `tipo <> 'renda' OR dono_usuario_id IS NOT NULL` (renda sempre de A ou B; despesa nula = casal) |
| descricao | VARCHAR(120) | NOT NULL |
| valor | DECIMAL(12,2) | NOT NULL, `ck_cenario_item_valor` `valor > 0` |
| criado_em, atualizado_em | DATETIME(6) | |

`ix_cenario_item_cenario_id`. Que o dono é A ou B do casal do cenário é validado no service.
As únicas FKs saem para `casal`, `categoria` e `usuario` (e entre estas quatro tabelas): nada aponta para `lancamento`, `conta`, `cartao`, `fatura` ou `meta` (RF-7.01).

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória; ids de outro casal respondem `404 NAO_ENCONTRADO`; referência a recurso no corpo inexistente ou de outro casal: `422 VALIDACAO` genérico. Mês no caminho: `AAAA-MM` validado por `tempo.validar_mes`. **Escrita só com casal ativo** (`SEM_VINCULO`) e só no recurso do casal ativo (`CASAL_ENCERRADO`, `fatia-6.md` §3.3). As listas e `GET .../{mes}` mostram só o casal **ativo** (D8).

### 3.0 Objetos
```
OrcamentoSaida = { "id": 4 | null, "mes": "2026-10", "renda": "10000.00", "percentual_economia": "20.00",
  "orcamento_gastos": "8000.00", "economia": "2000.00",                       // renda x (1 - p) e renda x p (RF-7.04)
  "categorias": [ { "categoria_id": 5, "nome": "Moradia/Casa", "icone": "house", "cor": "#6D4C41", "arquivada": false,
                    "limite": "3000.00",                 // efetivo: soma das subcategorias, se houver; senão o limite próprio
                    "por_subcategoria": false,           // true = limite derivado das subcategorias (não editável direto)
                    "subcategorias": [ { "categoria_id": 7, "nome": "Mercado", "arquivada": false, "limite": "400.00" } ] } ],
  "total_categorizado": "5000.00", "falta_distribuir": "3000.00", "excedente": "0.00",    // falta e excedente nunca negativos; só um é > 0
  "resumo": { "renda": "10000.00", "gastos_planejados": "5000.00", "balanco_planejado": "5000.00",
              "economia_planejada": "50.00" | null } }                        // null sem renda (RF-7.06)
ComparacaoLinha = { "categoria_id": 5 | null, "nome": "Mercado", "icone": "…", "cor": "…", "arquivada": false,
                    "limite": "2000.00" | null,          // null = sem limite
                    "gasto": "2300.00", "restante": "-300.00" | null, "consumo": "115.00" | null,
                    "acima_do_limite": true }                                 // consumo > 100, ou limite 0 com gasto > 0 (RF-7.10)
ComparacaoSaida = { "mes": "2026-10", "linhas": [ ComparacaoLinha + { "subcategorias": [ ComparacaoLinha ] } ],
                    "total": { "planejado": "8000.00", "gasto": "3000.00", "restante": "5000.00", "consumo": "37.50" | null, "acima_do_limite": false } }
CenarioSaida = { "id": 2, "nome": "Morar juntos",
  "itens": [ { "id": 9, "tipo": "renda" | "despesa", "dono_usuario_id": 1 | null, "dono_nome": "Ana" | "Casal",
               "descricao": "Salário", "valor": "6000.00" } ],
  "resultado": { "total_rendas": "10000.00", "total_despesas": "2800.00", "saldo_mensal": "7200.00",
                 "sem_proporcao": false,                  // true = nenhuma renda: sem porcentagem, aporte nem sobra
                 "base_casal": "2500.00",                 // despesas de dono casal
                 "pessoas": [ { "usuario_id": 1, "nome": "Ana", "renda": "6000.00", "porcentagem": "60.00" | null,
                                "aporte": "1500.00" | null, "despesas_proprias": "0.00", "sobra": "4500.00" | null } ] } }   // [pessoa A, pessoa B]
```
O front não soma nem arredonda nada (`front.md` §7): todo número exibido vem destes objetos.

### 3.1 Orçamento (RF-7.03 a 7.10)
```
OrcamentoEntrada = { "renda": "10000.00", "percentual_economia": "20.00",
                     "categorias": [ { "categoria_id": 5, "limite": "3000.00" },
                                     { "categoria_id": 6, "subcategorias": [ { "categoria_id": 7, "limite": "400.00" } ] } ] }
```
Regras do corpo (422 em `campos.renda`, `campos.percentual_economia`, `campos.categorias`): `renda >= 0`; percentual de 0 a 100 (101 recusado, CA-7.04); cada `categoria_id` é categoria-**mãe** de **despesa** do casal, sem repetição; uma categoria tem **exatamente um** entre `limite` e `subcategorias` (esta com ao menos uma): os dois, ou nenhum dos dois, é 422 em `campos.categorias`; cada subcategoria pertence à mãe informada; `limite >= 0` (negativo recusado, CA-7.05); categoria **arquivada** só é aceita se já está neste orçamento (RF-7.07). A presença de uma categoria no corpo é o "Gerenciar categorias": a não listada não entra (CA-7.05).

| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/orcamentos/{mes}` | - | `{ "mes", "orcamento": OrcamentoSaida \| null, "renda_sugerida": "10000.00" }` (a renda sugerida vem também sem orçamento; sem casal ativo, `orcamento` nulo e `renda_sugerida` `"0.00"`) | 422 |
| `POST /api/orcamentos/{mes}` | `OrcamentoEntrada` | `201` `OrcamentoSaida` | 409 `SEM_VINCULO`, `ORCAMENTO_JA_EXISTE`; 422 |
| `PUT /api/orcamentos/{mes}` | `OrcamentoEntrada` (substitui renda, percentual e **todos** os limites) | `OrcamentoSaida` | 404 (não há orçamento no mês); 409 `SEM_VINCULO`; 422 |
| `DELETE /api/orcamentos/{mes}` | - | `204` | 404; 409 `SEM_VINCULO` |
| `POST /api/orcamentos/{mes}/copiar-do-anterior` | `{ "substituir": false }` | `201` `OrcamentoSaida` | 409 `SEM_VINCULO`; 409 `ORCAMENTO_ANTERIOR_INEXISTENTE` (informa e não cria); 409 `ORCAMENTO_JA_EXISTE` (quando existe e `substituir` é falso: o front pede confirmação e repete com `true`) |
| `GET /api/orcamentos/{mes}/comparacao` | - | `ComparacaoSaida` | 404 (sem orçamento no mês); 422 |
| `POST /api/previa-orcamento` | `OrcamentoEntrada` | `OrcamentoSaida` com `id` nulo, **sem gravar** (alimenta os totais do assistente a cada alteração, sem somar no cliente; aceita categoria arquivada e não exige casal). **Visibilidade (I4, RNF-06, CA-7.14)**: todos os `categoria_id` (mães e subcategorias) passam **de uma vez** por `acesso.categorias_visiveis` (§4.7; `comum.md` §7.3: do casal ativo, ou da própria pessoa quando não há casal); o id que não vier no resultado responde `422 VALIDACAO` genérico (`campos.categorias`), igual a categoria inexistente (não revela que existe em outro casal). Nome, ícone e cor só são lidos das categorias já devolvidas por essa função, nunca de outra consulta. As regras "mãe", "despesa" e "subcategoria da mãe informada" são conferidas na própria linha da `categoria` já tida como visível, com ou sem casal | 422 |

`previa-orcamento` não leva `{mes}` no caminho para não colidir com `POST /api/orcamentos/{mes}`. `PUT` é exceção declarada aos verbos de `comum.md` §6.1 (que lista `GET`, `POST`, `PATCH` e `DELETE`): substitui o recurso inteiro (D7).

### 3.2 Cenários (RF-7.11, 7.12)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/cenarios` | - | `[ { "id", "nome", "total_rendas", "total_despesas", "saldo_mensal" } ]` (do casal ativo, por nome) | - |
| `POST /api/cenarios` | `{ nome }` (1 a 80) | `201` `CenarioSaida` (sem itens) | 409 `SEM_VINCULO`; 422 |
| `GET /api/cenarios/{id}` | - | `CenarioSaida` | 404 |
| `PATCH /api/cenarios/{id}` | `{ nome }` | `CenarioSaida` | 404; 409 `CASAL_ENCERRADO`; 422 |
| `DELETE /api/cenarios/{id}` | - | `204` (apaga os itens) | 404; 409 `CASAL_ENCERRADO` |
| `POST /api/cenarios/{id}/itens` | `{ tipo, dono_usuario_id?, descricao, valor }` | `201` `CenarioSaida` (com o resultado já recalculado) | 404; 409 `CASAL_ENCERRADO`; 422 (valor ≤ 0; renda sem dono ou dono fora do casal; despesa com dono fora do casal) |
| `PATCH /api/cenarios/{id}/itens/{item_id}` | campos do `POST`, opcionais (`tipo` não muda) | `CenarioSaida` | 404; 409 `CASAL_ENCERRADO`; 422 |
| `DELETE /api/cenarios/{id}/itens/{item_id}` | - | `200` `CenarioSaida` (devolve o resultado atualizado; exceção ao `204` de `comum.md` §6.1, D9) | 404; 409 `CASAL_ENCERRADO` |

`dono_usuario_id` de renda: A ou B do casal do cenário. De despesa: A, B ou `null` (casal). No `PATCH` de item, o service lê `model_fields_set` (como `MetaEdicao`, fatia 6): `dono_usuario_id` **ausente** não muda o dono; `null` enviado vale para **despesa** (passa a ser do casal); para **renda**, `null` é 422 em `campos.dono_usuario_id`.

### 3.3 Plano de metas (RF-7.13)
`GET /api/plano-de-metas/calculo?valor_alvo=12000.00&valor_atual=0.00&mes_alvo=2027-09` -> `{ "meses": 12, "aplicacao_mensal": "1000.00", "total_a_aplicar": "12000.00", "atingida": false }`. `GET` sem efeito colateral; nada é salvo; exige só sessão (sem casal). Dinheiro em string no parâmetro, mesmo formato de `comum.md` §6.2. Erros `422 VALIDACAO`: `valor_alvo` ≤ 0 ou `valor_atual` < 0; `mes_alvo` anterior ao mês corrente (`campos.mes_alvo`: "A data-alvo não pode ser anterior ao mês atual"; CA-7.13 recusa 09/2026 em 10/2026) ou acima do limite de `tempo.validar_mes`. O front preenche os campos a partir de uma meta (`GET /api/metas`, fatia 6) e pode alterá-los sem alterar a meta.

### 3.4 Códigos de erro da fatia (acrescentados em `errors.py`; ambos 409)
`ORCAMENTO_JA_EXISTE`, `ORCAMENTO_ANTERIOR_INEXISTENTE`. Reutiliza `SEM_VINCULO`, `CASAL_ENCERRADO`, `NAO_ENCONTRADO`, `VALIDACAO`.

## 4. Regras dos services

### 4.1 Isolamento do Controle (RF-7.01; regra de importação)
Os módulos `orcamentos`, `orcamento_comparacao`, `cenarios`, `plano_metas` e `planejamento_calculo` **só escrevem** em `orcamento`, `orcamento_item`, `cenario`, `cenario_item`. Podem **importar para leitura**, entre os **serviços de outras fatias**, apenas: `movimentos.gasto_por_categoria` (`fatia-5.md` §4.6), `proporcao.soma_salarios_mes` e `proporcao.rateio` (`fatia-3.md`), `ganchos.antes_de_ler_periodo` (a geração idempotente de recorrências é a exceção já documentada, `fatia-3.md` D5), `acesso`, `tempo`, `money`. Não importam `lancamentos`, `contas`, `cartoes`, `itens_fatura`, `metas*`, `pagamento_fatura`, `categorias`, `tags`.

Fora dos serviços, também são permitidos `app.errors`, `app.deps`, `app.schemas.*`, `app.models.{casal,categoria,usuario,planejamento}` e os módulos da própria fatia. São **proibidos** `app.models.{lancamento,conta,cartao,item_fatura,meta,recorrencia}`. `planejamento_calculo` importa **só** `proporcao.rateio` (função pura): o critério "sem `sqlalchemy`" vale para o import direto, já que `proporcao` o importa por dentro.

Revisão: `grep` dos imports e dos pontos de escrita; CA-7.01 (linhas e saldos de `lancamento` e `conta` iguais antes e depois de criar, editar e excluir orçamento, cenário e consulta de plano) é conferido por leitura do código; a execução fica nos testes de integração. **Medição de CA-7.01 (S5)**: três operações chamam `antes_de_ler_periodo` e podem inserir ocorrências de recorrência (exceção da fatia 3 D5), o que faria a contagem de `lancamento` variar sem culpa do planejamento: `GET /api/orcamentos/{mes}` (renda sugerida), `GET /api/orcamentos/{mes}/comparacao` (`gasto_por_categoria` chama `carregar_mes`, que aciona o gancho) e `POST /api/orcamentos/{mes}/copiar-do-anterior` (renda sugerida do destino). Quem executar CA-7.01 lê uma vez cada mês envolvido antes da primeira contagem (gerando as recorrências), ou exclui da contagem os lançamentos com `recorrencia_id` não nulo. Nenhuma outra rota chama o gancho; fora essa geração, nenhuma escreve fora das quatro tabelas do planejamento.

### 4.2 Cálculo puro (`services/planejamento_calculo.py`; sem `Session`, sem `fastapi`, sem `float`)
- `dividir_renda(renda, percentual) -> (orcamento_gastos, economia)`: `economia = quantizar(renda * percentual / 100)` (`ROUND_HALF_UP`, `money.py`), `orcamento_gastos = renda − economia` (a soma fecha a renda). 10.000 a 20% -> 8.000 e 2.000 (CA-7.04).
- `resumo_orcamento(renda, orcamento_gastos, limites_das_categorias) -> dict`: `gastos_planejados = soma`; `total_categorizado` igual a ela; `falta_distribuir = max(orcamento_gastos − total, 0)`, `excedente = max(total − orcamento_gastos, 0)`; `balanco_planejado = renda − gastos_planejados`; `economia_planejada = money.porcentagem(balanco, renda)` (`None` se `renda = 0`). CA-7.05 e CA-7.06.
- `linha_comparacao(limite | None, gasto) -> (restante, consumo, acima_do_limite)`: sem limite, `restante` e `consumo` nulos e `acima_do_limite = False`; com limite, `restante = limite − gasto` (pode ser negativo), `consumo = money.porcentagem(gasto, limite)` (nulo se `limite = 0`), `acima_do_limite = gasto > limite` (limite 0 com gasto 10 é acima; exatamente 100,00% não é; CA-7.10).
- `plano_de_metas(alvo, atual, mes_corrente, mes_alvo) -> dict`: `meses = (ano_alvo − ano_corrente) * 12 + (mes_alvo − mes_corrente) + 1`; `total = max(alvo − atual, 0)`; `atingida = alvo <= atual` (mensal `0.00`); `aplicacao_mensal` = `total` dividido por `meses`, **arredondado para cima ao centavo** (em centavos inteiros: `(total_c + meses − 1) // meses`). CA-7.13: 12.000/12 = 1.000,00; (10.000 − 1.000)/3 = 3.000,00; 1.000/3 = 333,34.
- `resultado_cenario(renda_a, renda_b, despesas_casal, despesas_a, despesas_b) -> dict`: `total_rendas`, `total_despesas`, `saldo_mensal`; `sem_proporcao = (total_rendas == 0)`; se há renda, `porcentagem = money.porcentagem(renda_p, total_rendas)` e `aporte_a, aporte_b = proporcao.rateio(despesas_casal, renda_a, renda_b)` (a **mesma função** de RF-3.15: centavo de diferença com a maior porcentagem, e com A em empate); `sobra_p = renda_p − aporte_p − despesas_proprias_p`. Sem renda: `porcentagem`, `aporte` e `sobra` nulos. Confere CA-7.12 (1.500/1.000, sobras 4.500 e 2.700; 6.500/4.000 com base 2.500 -> 1.547,62 e 952,38; rendas iguais com base 100,01 -> 50,01 e 50,00).

### 4.3 Orçamento (`services/orcamentos.py`)
**Ordem em toda operação**: (1) casal ativo, quando a operação exige (`SEM_VINCULO`); (2) o gancho `antes_de_ler_periodo`, nas operações que o usam (`obter` e `copiar_do_anterior`; a geração de recorrências pode **confirmar a transação**, `fatia-3.md` D5, e isso soltaria uma trava já tomada); (3) a trava (abaixo); (4) leitura do que a regra precisa, validação e escrita. Ou seja, o gancho roda antes de qualquer trava ou escrita.

- `obter(db, ctx, mes)`: orçamento do **casal ativo** no mês (ou `None`); `renda_sugerida`. **Sem casal ativo, não chama o gancho nem a soma**: `orcamento = None` e `renda_sugerida = "0.00"`. **Renda sugerida** (RF-7.04): `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))` e `proporcao.soma_salarios_mes(db, casal, mes)` -> `S_A + S_B`: receitas de categoria Salário (raiz `fixa` e suas subcategorias) de dono A ou B no mês, com o `valor` já "confirmado se confirmada, previsto nas demais" (`fatia-3.md` §4.6, passo 1). Receita de dono casal não entra. `soma_salarios_mes` já é pública em `proporcao.py` (a consulta da fatia 3); este módulo só a chama. O gancho vem antes de ler o orçamento.
- `montar_saida(db, orcamento_ou_entrada)` (comum a `obter`, `previa` e escritas): antes de carregar qualquer dado de categoria, chama **uma vez** `acesso.categorias_visiveis(db, ctx, ids)` (§4.7) com todos os `categoria_id` da entrada, mães e subcategorias, sem repetição (categoria do casal ativo, ou da própria pessoa quando não há casal, `comum.md` §7.3); id ausente do resultado -> `422 VALIDACAO` genérico em `campos.categorias` (I4). As categorias devolvidas já trazem nome, ícone, cor, `arquivado`, tipo e `categoria_pai_id`: nenhuma outra consulta de categoria para esses ids. Em `obter`, os ids vêm das linhas já gravadas do orçamento do casal ativo e são carregados por um `IN` (sem a checagem, que foi feita na escrita). **Limite efetivo da mãe** = soma das linhas das subcategorias se houver, senão a linha própria; usa `dividir_renda` e `resumo_orcamento`. Categoria arquivada depois da criação continua no orçamento com `arquivada = true` (RF-7.07).
- `travar_orcamento(db, ctx, mes) -> Orcamento` (padrão de D-053 e de `metas.travar_meta`): `acesso.orcamento_do_mes` (sem orçamento -> `404 NAO_ENCONTRADO`) e depois relê a linha com `select(Orcamento).where(Orcamento.id == id).with_for_update().execution_options(populate_existing=True)`; se sumiu entre as duas leituras -> `404`. Sem a trava, dois `PUT` do mesmo mês fariam `delete` e `insert` cruzados e colidiriam em `uq_orcamento_item_orcamento_id_categoria_id` (500). É a **única** trava da operação; nenhuma operação trava conta, cartão, meta ou lançamento.
- `criar`: casal ativo (`SEM_VINCULO`); valida o corpo (§3.1); grava `orcamento` e os itens; **sem trava** (a linha ainda não existe): duas criações simultâneas decidem-se por `uq_orcamento_casal_id_mes_ref` (`IntegrityError` -> `ORCAMENTO_JA_EXISTE`). `substituir` (`PUT`): casal ativo, `travar_orcamento`, valida o corpo (a regra da categoria arquivada lê os itens do orçamento já travado), `delete` dos itens e `insert` dos novos, atualiza renda e percentual, uma transação. `excluir`: casal ativo, `travar_orcamento`, apaga itens e orçamento; **não toca o Controle** (CA-7.07).
- `copiar_do_anterior(db, ctx, mes, substituir)`: casal ativo; renda sugerida do mês de destino (gancho e soma, passo 2 da ordem acima); orçamento do `mes − 1` do casal ativo; inexistente -> `ORCAMENTO_ANTERIOR_INEXISTENTE` (nada é criado); destino existente e `substituir` falso -> `ORCAMENTO_JA_EXISTE`. Copia o `percentual_economia` e as linhas de limite **exceto** as de categorias (ou subcategorias) arquivadas no momento da cópia (uma mãe arquivada leva as filhas); a `renda` é a sugerida do mês de destino (RF-7.04). Com `substituir` e destino existente, `travar_orcamento` do destino e troca numa só transação (se a linha sumiu na trava, `404`, como nas demais). Sem `substituir`, não há trava: o `uq` decide.
- `previa(db, ctx, entrada)`: `montar_saida` (com `categorias_visiveis` acima) sem gravar nada, sem trava, sem gancho e sem exigir casal; categoria arquivada é aceita.

### 4.4 Comparação com o real (`services/orcamento_comparacao.py`; RF-7.09, 7.10)
`comparar(db, ctx, mes)`: orçamento do casal ativo (senão 404; sem casal ativo, 404 antes de qualquer gancho); `gastos = movimentos.gasto_por_categoria(db, ctx, mes)` (chama `carregar_mes`, que aciona `antes_de_ler_periodo`: **este `GET` também gera ocorrências de recorrência**, §4.1; sem trava) (**previsto**, todos os donos, cartão no mês da fatura com estornos e ajustes, todas as situações; transferência, aporte, reajuste, pagamento de fatura, aplicação e resgate já ficam de fora: `fatia-5.md` §4.2, §4.6). O gasto de uma categoria-mãe é o próprio mais o das suas subcategorias.
- Linhas, na ordem: cada categoria do orçamento (por nome) com `limite` efetivo e, quando tem limites por subcategoria, as linhas das subcategorias **com limite** (o gasto de subcategoria sem limite fica só na soma da mãe); depois as categorias com gasto diferente de zero **que não estão no orçamento**, com `limite = null` ("sem limite", CA-7.09), inclusive o grupo `Reajuste de fatura` (`categoria_id = null`).
- `total`: `planejado` = `gastos_planejados`; `gasto` = soma de **todos** os gastos do mês (igual às saídas previstas do Controle, CA-5.01); `restante`, `consumo` e `acima_do_limite` por `linha_comparacao`.
- Aritmética em `Decimal`; categorias lidas por `IN`, inclusive arquivadas.

### 4.5 Cenários (`services/cenarios.py`)
- `listar`: cenários do casal ativo, cada um com o resultado (itens carregados por `IN`, sem N+1); `criar` (casal ativo, senão `SEM_VINCULO`): cenário novo **sem itens** (CA-7.11).
- `travar_cenario(db, ctx, cenario_id) -> Cenario` (padrão de D-053 e de `metas.travar_meta`): `acesso.cenario_gravavel` (404; casal desfeito -> `CASAL_ENCERRADO`) e depois relê a linha com `with_for_update()` e `populate_existing=True`; sumiu -> `404`. **Escrita de item** (`POST`, `PATCH`, `DELETE` de item) e **exclusão do cenário** travam o cenário, antes de ler os itens: sem isso, um item inserido durante a exclusão bate na FK `RESTRICT` (500) e o resultado devolvido pode sair de leitura velha. O `PATCH` de nome não trava (só troca `nome`, vale a última escrita). Uma trava por operação; nenhuma em conta, cartão ou meta. O item é buscado depois da trava e deve pertencer ao cenário (senão 404).
- Itens: valida valor > 0 (também no schema), `tipo`, e o dono contra `casal.pessoa_a_id`/`pessoa_b_id` do **casal do cenário** (renda: A ou B; despesa: A, B ou nulo). Escrita em cenário de casal desfeito -> `CASAL_ENCERRADO`; leitura por id continua (visível se `casal_id ∈ casais_ids`).
- `resultado`: soma rendas por pessoa (A, B) e despesas em três grupos (`dono_usuario_id` nulo, A, B) em `Decimal` e chama `resultado_cenario` (§4.2); `pessoas` na ordem `[A, B]` com `usuario_id` e `nome`.
- Itens do cenário **não** são lançamentos e **não** são lidos pelo Controle; o cenário não lê o Controle (RF-7.11).

### 4.6 Plano de metas (`services/plano_metas.py`)
`calcular(valor_alvo, valor_atual, mes_alvo)`: valida o mês (`>= mes_ref(hoje())`, `<= hoje + 120 meses`) e chama `plano_de_metas`. `tempo.validar_mes` responde o erro em `campos.mes`; aqui o parâmetro é `mes_alvo`, então `calcular` captura o `AppError` de `validar_mes` e o relança como `422 VALIDACAO` com `campos.mes_alvo`, para formato inválido e para mês acima do limite; o mês anterior ao corrente também sai em `campos.mes_alvo` (§3.3). Sem `Session`, sem casal. O cálculo não considera rendimento e não cria aplicação (RF-7.01, RF-7.13).

### 4.7 Visibilidade (`acesso.py`)
`orcamento_do_mes(db, ctx, mes) -> Orcamento | None` (casal ativo), `cenario_visivel(db, ctx, id) -> Cenario` (visível se `casal_id ∈ casais_ids`, senão `404`) e `cenario_gravavel(...)` (visível **e** do casal ativo, senão `CASAL_ENCERRADO`). Itens de cenário e itens de orçamento herdam do pai.

`categorias_visiveis(db, ctx, ids) -> dict[int, Categoria]`: em lote, **um** `select(Categoria).where(Categoria.id.in_(ids), _de_escopo_visivel(Categoria, ctx))`, o mesmo critério de `categoria_visivel`, e devolve `{id: categoria}` só do que é visível. Não levanta erro: o service compara os ids pedidos com as chaves e responde `422 VALIDACAO` genérico para o que faltar (inexistente e de outro casal ficam indistinguíveis, I4). Motivo: `categoria_visivel` levanta 404 e faz uma consulta por id, e a prévia roda a cada alteração do assistente. `categoria_visivel` fica como está para as demais fatias; `ids` vazio devolve `{}` sem consulta.

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4)
| Rota | Tela | Observações |
|---|---|---|
| `/planejamento` | Menu da aba | exatamente 3 entradas: Orçamento do mês, Cenários, Plano de metas (CA-7.02) |
| `/planejamento/orcamento` | Orçamento do mês | `SeletorMes` **próprio** (`useMes` com `?mes` desta tela; não herda nem altera o mês do Controle); mês sem orçamento: `EstadoVazio` com "Definir novo orçamento" e "Copiar do mês anterior" (se já existe orçamento no destino, `DialogoConfirmacao` antes de repetir com `substituir: true`); com orçamento: cards de resumo (renda, gastos planejados, balanço planejado, economia planejada), lista de comparação por categoria com barra e, quando `acima_do_limite`, destaque laranja **com** o texto "acima do limite" (RNF-08), linha "sem limite" e linha de total; ações Editar e Excluir (com confirmação) |
| `/planejamento/cenarios` | Cenários | lista com nome e saldo mensal; criar, renomear, excluir (com confirmação); `EstadoVazio` |
| `/planejamento/cenarios/:cenarioId` | Cenário | itens de renda e despesa (adicionar, editar, excluir), resultado (totais, saldo, porcentagem, aporte e sobra por pessoa; "sem proporção" quando não há renda); nenhuma soma no cliente |
| `/planejamento/plano-de-metas` | Plano de metas | escolher uma meta existente (preenche alvo, atual e mês) ou digitar valores; mês-alvo (mês e ano); resultado com meses, aplicação mensal e total, ou "meta já atingida"; aviso de que o plano não é salvo |

**Assistente do orçamento** (`BottomSheet` em tela cheia, aberto da tela de orçamento; não é rota, `front.md` §8): passo 1 = renda (preenchida com `renda_sugerida`, editável) e percentual a economizar (0 a 100), com orçamento de gastos e economia mostrados vindos de `previa-orcamento`; passo 2 = limite por categoria de despesa e, opcionalmente, por subcategoria (a mãe com limites nas filhas mostra o total derivado e não é editável), "Gerenciar categorias" marca quais categorias entram, e a cada alteração a tela consulta `previa-orcamento` para mostrar total categorizado, falta distribuir e excedente (laranja, com texto). **Prévia**: a consulta sai depois de uma pausa curta na digitação (não há espera pronta no projeto: o assistente guarda o temporizador no próprio componente e o limpa ao desmontar), e a resposta velha não sobrescreve a nova (cada consulta leva um número crescente, ou um `AbortController`, e só a última aplicada atualiza a tela). **Corpo enviado**: categoria marcada com campo vazio vai com `"0.00"`; subcategoria com campo vazio **não** é enviada (e a mãe sem nenhuma subcategoria preenchida vai com `limite`, nunca com `subcategorias` vazio: §3.1 exige exatamente um dos dois). Salvar com valor a distribuir diferente de zero é permitido. Erros de campo vêm de `ApiError.campos` (RNF-09).

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | Planejamento só escreve nas suas 4 tabelas, sem FK para o Controle, e só **lê** por funções nomeadas (§4.1) | RF-7.01 é a regra central da fatia; FK e import proibidos tornam a violação visível na revisão (e, depois, na verificação de CA-7.01) | Permitir import dos services de escrita "com cuidado" |
| D2 | `orcamento_item` guarda só limites digitados; o limite da mãe com filhas é derivado | RF-7.05: a mãe "não é editada diretamente"; uma única fonte evita mãe e filhas divergirem | Gravar também a linha da mãe com a soma |
| D3 | `orcamento_item` **fora** de `ALVOS_CATEGORIA` | RF-7.07: categoria arquivada continua no orçamento; se arquivar/mover reapontasse os itens, o orçamento mudaria sozinho e poderia colidir em `uq_orcamento_item_…` (exceção ao checklist de `fatia-2.md` §6, declarada aqui) | Reapontar os itens ao arquivar |
| D4 | Gasto vem de `movimentos.gasto_por_categoria` (previsto, por item de cartão no mês da fatura) | RF-7.09 manda ler o Controle e usar o mesmo critério do balanço (CA-5.01); uma só regra | Consulta própria do planejamento (duas regras para o mesmo gasto) |
| D5 | `POST /api/previa-orcamento` calcula totais do assistente no servidor | O front não soma dinheiro (`front.md` §7) e o passo 2 precisa de "falta distribuir" a cada digitação | Somar no cliente |
| D6 | `percentual_economia` é gravado (`DECIMAL(5,2)`) | É dado digitado, necessário para recalcular e para copiar o mês; renda sozinha não o reconstrói | Derivar de `renda` e dos limites |
| D7 | `PUT` substitui renda, percentual e todos os limites; criação é `POST` separado | O assistente envia o estado inteiro; `POST` + `ORCAMENTO_JA_EXISTE` implementa "criar de novo abre o existente ou pede para substituir" (CA-7.03) | Mesclar parcialmente os itens |
| D8 | Listas e `GET {mes}` só do casal ativo; por id, cenário de casal desfeito é legível e não gravável | Os requisitos só pedem consulta do passado para contas, cartões e metas (RF-2.05, 4.18, 6.14); orçamento é por mês e sem navegação a casais antigos | Expor planejamento de casais antigos |
| D9 | Exclusão de item de cenário devolve `200` com o cenário | O resultado precisa atualizar a cada alteração (RF-7.12) sem segunda chamada | `204` e nova consulta |
| D10 | Cenário reutiliza `proporcao.rateio` e `money.porcentagem` | RF-7.12 manda a mesma regra do centavo de RF-3.15 | Nova função de rateio |
| D11 | Plano de metas como `GET` de cálculo, sem tabela | RF-7.13: "apenas calculado, não salvo" | `POST` que grava o plano |
| D12 | Assistente e formulários do planejamento em `BottomSheet`, sem rota nova | `front.md` §8: formulário não é rota; mantém a tabela de rotas de `front.md` §4 | Subrota `/planejamento/orcamento/editar` |
| D13 | Travas por linha (`FOR UPDATE` + `populate_existing`) em `travar_orcamento` (`PUT`, `DELETE`, `copiar` com `substituir`) e `travar_cenario` (escrita de item, exclusão de cenário); uma por operação; o gancho roda antes (§4.3) | Mesmo padrão de D-053 e `metas.travar_meta`; sem a trava, dois `PUT` colidem em `uq_orcamento_item_…` e dão 500, e item inserido durante a exclusão do cenário bate na FK | `IntegrityError` capturado e repetido (esconde o erro e não protege a leitura); travar conta, cartão ou meta (viola RF-7.01) |
| D14 | `acesso.categorias_visiveis` em lote, sem levantar erro | A prévia roda a cada alteração do assistente; `categoria_visivel` faz uma consulta por id e levanta 404, que aqui deve virar o 422 genérico de I4 | Chamar `categoria_visivel` em laço (N consultas) |

Riscos:
- **Violação silenciosa de RF-7.01**: um import de service de escrita passaria na validação bruta. Mitigação: regra de §4.1 (incluindo os modelos proibidos) no checklist de revisão; CA-7.01 executado nos testes de integração.
- **Gancho de recorrências**: `antes_de_ler_periodo` gera ocorrências, é a única escrita fora das quatro tabelas e já está documentada (`fatia-3.md` D5). Três operações o acionam: `GET /api/orcamentos/{mes}` e `POST .../copiar-do-anterior` (renda sugerida) e `GET .../comparacao` (via `gasto_por_categoria`/`carregar_mes`). Como a geração pode confirmar a transação, o gancho roda antes de qualquer trava ou escrita (§4.3); uma trava tomada antes seria solta.
- **Concorrência**: `PUT`, `DELETE` e `copiar` com `substituir` sem `travar_orcamento` colidem em `uq_orcamento_item_orcamento_id_categoria_id` (500); escrita de item e exclusão de cenário sem `travar_cenario` batem na FK. Mitigação: D13; a revisão confere que a trava vem antes de apagar ou gravar item. `criar` e `copiar` sem `substituir` não travam: o `uq` decide.
- **Gasto previsto negativo** em categoria com estorno maior que as compras do mês: `consumo` negativo é possível e fica como está (D11 da `fatia-4.md`).
- **Categoria renomeada ou arquivada**: o orçamento guarda o id; nome e `arquivada` vêm sempre do cadastro atual.
- **Mês muito distante**: `validar_mes` limita a `hoje + 120 meses`; o plano de metas usa o mesmo limite.
