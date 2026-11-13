# Fatia 3: Recorrências, proporção do mês e aporte

> Só o que é da fatia 3. Convenções: `comum.md` §4, §6, §7.3. Lançamentos, contas, `ALVOS_*`, ganchos e visibilidade: `fatia-2.md`. Ganchos: `fatia-1.md` §4.9; datas (`tempo.py`): `fatia-1.md` §4.10. Telas: `front.md`. Validação e execução: `comum.md` §9.
> Pré-requisito: fatias 1 e 2 integradas.

## 1. Escopo e RF cobertos

Lançamento recorrente mensal (despesa, receita e transferência/aporte), ciclo de cada ocorrência, alcance de edição e exclusão, comportamento com conta arquivada; porcentagem do mês, base e aporte devido/aportado/faltante, sugestão do valor do aporte e a tela "Proporção e aporte do mês".

## 2. Tabelas e migrações

Convenções de `comum.md` §4. Uma migração.

### 2.1 Migração `0005_recorrencia`

**`recorrencia`** (o modelo da regra; as ocorrências são linhas de `lancamento`, §6 D1)
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| tipo | VARCHAR(20) | NOT NULL, `ck_recorrencia_tipo` IN (`despesa`,`receita`,`transferencia`) |
| valor | DECIMAL(12,2) | NOT NULL, `ck_recorrencia_valor` `valor > 0` |
| descricao | VARCHAR(120) | NULL |
| conta_id | BIGINT UNSIGNED | NOT NULL, FK conta |
| conta_destino_id | BIGINT UNSIGNED | NULL, FK conta |
| categoria_id | BIGINT UNSIGNED | NULL, FK categoria |
| dono_usuario_id | BIGINT UNSIGNED | NULL, FK usuario (nulo = casal) |
| observacao | VARCHAR(500) | NULL |
| criado_por_id | BIGINT UNSIGNED | NOT NULL, FK usuario |
| mes_inicial | DATE | NOT NULL, dia 1 do mês da primeira ocorrência |
| dia | TINYINT UNSIGNED | NOT NULL, `ck_recorrencia_dia` `dia BETWEEN 1 AND 31` |
| numero_final | INT | NULL = "mensal, sem data de fim"; senão o número da última ocorrência permitida (`>= 0`, `ck_recorrencia_final`) |
| gerado_ate | INT | NOT NULL DEFAULT 0: maior número de ocorrência já gerado |
| criado_em, atualizado_em | DATETIME(6) | |

As mesmas `CHECK` de coerência do `lancamento` (`fatia-2.md` §2.2) para `categoria_id`, `conta_destino_id` e `dono_usuario_id` por `tipo`. Índices `ix_recorrencia_conta_id`, `ix_recorrencia_conta_destino_id`.

**`recorrencia_tag`**: `recorrencia_id` (FK), `tag_id` (FK), PK `(recorrencia_id, tag_id)`, `ix_recorrencia_tag_tag_id`. Guarda as tags do modelo para as ocorrências ainda não geradas.

**`lancamento` (alteração)**: `recorrencia_id` BIGINT UNSIGNED NULL FK `recorrencia`; `numero_recorrencia` INT NULL; `ck_lancamento_recorrencia` `(recorrencia_id IS NULL) = (numero_recorrencia IS NULL)`; `uq_lancamento_recorrencia_id_numero_recorrencia (recorrencia_id, numero_recorrencia)` (impede ocorrência duplicada, e `NULL` não colide). O `downgrade()` remove, **nesta ordem**: `ck_lancamento_recorrencia`, a FK `fk_lancamento_recorrencia_id`, `uq_lancamento_recorrencia_id_numero_recorrencia`, as duas colunas, a tabela `recorrencia_tag` e a tabela `recorrencia`. Motivo: o MySQL recusa apagar um índice usado por uma FK e uma coluna citada em `CHECK`; por isso a `CHECK` sai primeiro, a FK antes do índice único (que a sustenta) e só então as colunas. Dar nome explícito à FK (`fk_lancamento_recorrencia_id`) na criação.

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória; erros em `comum.md` §6.4. **Nenhum código de erro novo**: usa `VALIDACAO`, `CONTA_ARQUIVADA`, `NAO_ENCONTRADO`, `SEM_VINCULO` e `LANCAMENTO_SOMENTE_LEITURA` (`fatia-1.md` §3.4, `fatia-2.md` §3.5; regra em `comum.md` §7.3).

### 3.1 Extensões das rotas de lançamento (`fatia-2.md` §3.4)

**`LancamentoSaida`** ganha: `recorrente: bool`, `recorrencia_id: int | null`, `numero_recorrencia: int | null`, `total_ocorrencias: int | null` (o `numero_final` da recorrência; `null` = sem fim ou não recorrente). O front só pergunta o alcance quando `recorrente` é verdadeiro (`front.md` §8).

**Criação** (`POST /api/lancamentos`): despesa, receita e transferência aceitam o campo opcional
```
"recorrencia": { "modo": "sem_fim" }                       // mensal, sem data de fim
             | { "modo": "n_meses", "meses": 12 }          // "repetir N meses", N inteiro de 2 a 60
```
- `data` é a data da **primeira** ocorrência (pode estar no passado, mas não antes de `somar_meses(hoje, -60)`; RF-3.08).
- `situacao` deve vir omitida ou `prevista` (ocorrência nasce prevista; senão `422`, `campos.situacao`).
- `meses` fora de 2..60 -> `422` `VALIDACAO` (`campos.recorrencia`), CA-3.21. **Onde se valida**: no schema `meses` é só tipado (`int`, sem `ge`/`le`) e o range 2..60 é conferido no service (`criar_recorrencia`, §4.2), que levanta `VALIDACAO` com `campos.recorrencia`. Motivo: o corpo de criação é uma união discriminada por `tipo` e o erro do Pydantic prefixaria o caminho (`despesa.recorrencia...`, tratado em `main.py`), mas o contrato pede `campos.recorrencia`. Alternativa descartada: `Field(ge=2, le=60)` no schema (o caminho do erro sairia com o prefixo do tipo).
- Resposta `201`: a **primeira ocorrência** (`LancamentoSaida` com `recorrente = true`).
- Todos os demais campos e erros são os da fatia 2 (RG-04 etc.), validados uma vez contra o modelo.

**Edição e exclusão** (`PATCH` e `DELETE /api/lancamentos/{id}`): novo parâmetro `?alcance=somente_este|este_e_pendentes|todos`.
- Lançamento **não** recorrente: `alcance` é ignorado (CA-3.07).
- Lançamento recorrente sem `alcance` -> `422` `VALIDACAO` (`campos.alcance`: "Escolha o alcance").
- `PATCH` com `este_e_pendentes` ou `todos`: `situacao` não é aceita (`422`, `campos.situacao`: confirmar é uma ocorrência por vez); `data`, se enviada, deve cair no **mês da ocorrência** e só o **dia** vale para as demais; `dono_usuario_id` e `conta_id` (e `conta_destino_id` na transferência) são enviados juntos (RG-04).
- `PATCH` com `somente_este`: igual a editar lançamento simples; `data` livre.
- Resposta do `PATCH`: a ocorrência editada. `DELETE`: `204`.
- `POST /api/lancamentos/{id}/confirmar` não muda: confirma só a ocorrência (RF-3.03), sem `alcance`.

### 3.2 Proporção e aporte (RF-3.09 a 3.20)
| Método e caminho | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/proporcao` | `?mes=AAAA-MM` (padrão mês atual) | `ProporcaoSaida` | 409 `SEM_VINCULO`; 422 |
| `GET /api/proporcao/sugestao-aporte` | `?conta_origem_id=3&data=2026-10-29` | `{ "valor": "500.00" \| null }` (`null` = sem faltante, ou a conta de origem não é individual de uma das duas pessoas do casal ativo, ou não há casal ativo) | 404 (conta de outro casal); 422 |

```
ProporcaoSaida = {
  "mes": "2026-10",
  "base_despesas_casal": "2500.00",
  "origem_porcentagem": "mes" | "herdada" | "padrao_50_50",
  "mes_origem": "2026-09" | null,                 // preenchido só quando "herdada"
  "pessoas": [                                    // sempre 2 itens, na ordem [pessoa A, pessoa B]
    { "usuario_id": 1, "nome": "Ana", "porcentagem": "60.00", "devido": "1500.00",
      "aportado": "1000.00", "faltante": "500.00", "excedente": "0.00" },
    { "usuario_id": 2, "nome": "Bia", "porcentagem": "40.00", "devido": "1000.00",
      "aportado": "0.00", "faltante": "1000.00", "excedente": "0.00" } ] }
```
O front não soma nem arredonda nada; rotula "A"/"B" só se quiser, pela ordem (`comum.md` §5.2, `front.md` §7).

## 4. Regras dos services

### 4.1 Data da ocorrência (`services/recorrencias.py`)
`data_ocorrencia(mes_inicial, dia, k) -> date` (k = 1, 2, ...) = dia `min(dia, último dia do mês)` do mês `mes_inicial + (k-1)` meses. O `dia` é sempre o da **primeira data**, nunca o já ajustado do mês anterior: primeira 31/01 -> 28/02 (29/02 em bissexto) -> 31/03 (RF-3.02, CA-3.02). O mês da ocorrência `k` é o seu **mês nominal**.

### 4.2 Criar recorrência
Dentro de `lancamentos.criar` (`fatia-2.md` §4.6), quando vem `recorrencia`:
1. Valida o modelo como lançamento (RG-04, categoria, tags, conta ativa) e `data >= somar_meses(hoje, -60)`.
2. Grava `recorrencia` (`mes_inicial = mes_ref(data)`, `dia = data.day`, `numero_final = None` ou `meses`, `gerado_ate = 0`) e `recorrencia_tag`.
3. `gerar(db, rec, ate = max(data, fim_do_mes(hoje)))`: gera as ocorrências `1..k` com data `<= ate`, de modo que as passadas existam (previstas, logo atrasadas, RF-3.08, CA-3.09, CA-3.21) e a primeira sempre exista. Commit. Devolve a ocorrência 1.

### 4.3 Geração sob demanda: `garantir_ate(db, ctx, ate: date)`
Implementa o gancho `antes_de_ler_periodo` (`fatia-2.md` §4.9). Algoritmo:
1. Seleciona as recorrências cujas **duas pontas** (`conta_id` e, se houver, `conta_destino_id`) são visíveis ao contexto (`comum.md` §7.3 regra 3; não só a de origem), com conta **e** conta de destino **não arquivadas**, e `numero_final IS NULL OR gerado_ate < numero_final` (isso também deixa de fora a recorrência já encerrada pelo desvínculo, §4.8).
2. Para cada uma: `alvo_k` = número da última ocorrência com `data_ocorrencia <= ate` (`k = diferença em meses entre mes_inicial e o mês de ate, mais 1`; subtrai 1 se `data_ocorrencia(k) > ate`), limitado por `numero_final`. Se `alvo_k <= gerado_ate`, nada.
3. Senão, trava a linha da recorrência (`FOR UPDATE`), reconfere `gerado_ate` e gera `gerado_ate+1 .. alvo_k`: `lancamento(situacao='prevista', recorrencia_id, numero_recorrencia=k, data=data_ocorrencia(...), demais campos copiados do modelo, tags copiadas de recorrencia_tag)`. Cada ocorrência é inserida dentro de um `SAVEPOINT` (`db.begin_nested()` + `flush`) que captura `IntegrityError` **só** da chave única `uq_lancamento_recorrencia_id_numero_recorrencia` (erro 1062 daquele índice): ela descarta corrida e ocorrência confirmada fora do contador (§4.5), e então as tags dessa ocorrência **não** são copiadas. Qualquer outra violação (`CHECK`, `NOT NULL`, truncamento) propaga e desfaz a geração. `gerado_ate = max(gerado_ate, alvo_k)`. Alternativa descartada: o modificador `IGNORE` do `INSERT` (no MySQL também silencia `CHECK` e `NOT NULL`: ocorrência perdida sem erro e contador avançado); `ON DUPLICATE KEY UPDATE id = id` serviria, mas não diz se a linha entrou, e as tags só devem ir para a linha nova.
4. `commit()` se gerou algo. **Exceção deliberada** à regra "commit só no caso de uso" (`comum.md` §3): a geração é idempotente e precisa persistir mesmo em requisição de leitura (D5).
Quem chama: `lancamentos.listar_mes`, `contas.listar` (saldo previsto até o fim do mês exibido), `proporcao.calcular`. As consultas das fatias 4 e 5 que leem lançamentos de um mês (balanço, projeção) também chamam o gancho antes (regra de revisão). O mês da consulta é limitado a `hoje + 120 meses` por `tempo.validar_mes` (`fatia-1.md` §4.10), o que limita o trabalho de uma recorrência "sem fim" a 120 linhas.

### 4.4 Conta arquivada (RF-3.07, CA-3.08)
Implementa o gancho `ao_arquivar_conta(db, conta)`:
- Para cada recorrência com `conta_id` ou `conta_destino_id` igual à conta: apaga as ocorrências `prevista` com `data >= hoje()` (e suas linhas de `lancamento_tag`) e põe `gerado_ate = menor numero_recorrencia apagado - 1`. As confirmadas e as atrasadas (previstas com data passada) permanecem.
- Enquanto a conta está arquivada, `garantir_ate` não gera (§4.3, passo 1). Ao desarquivar, a próxima leitura gera de novo a partir de `gerado_ate+1` (as de datas já passadas nascem previstas e, por isso, atrasadas; as confirmadas fora do contador são descartadas pela chave única, §4.3 passo 3).
- Vale também para a conjunta arquivada pelo desvínculo (`ao_desvincular` chama o gancho, `fatia-2.md` §4.8).
- **Limite conhecido e aceito (D-037)**: ao desarquivar, uma ocorrência futura que foi excluída com "somente este", ou ajustada com "somente este" (data, valor etc.), antes do arquivamento volta como o modelo. O arquivamento apaga as previstas futuras e recua `gerado_ate` (D4), e a regeneração parte do modelo; o histórico "somente este" dessas ocorrências não é guardado. Alternativa descartada: guardar as exceções por ocorrência (tabela nova que nenhum requisito pede).

### 4.5 Editar e excluir com alcance (`services/recorrencias_alcance.py`)
Entrada: a ocorrência `n` (o `numero_recorrencia` do lançamento escolhido), a recorrência `r` (travada com `FOR UPDATE`) e o alcance. A ocorrência é obtida por `lancamento_gravavel` (`comum.md` §7.3 regra 2): se uma ponta de `r` não é visível, qualquer alcance responde `LANCAMENTO_SOMENTE_LEITURA` e nada muda (inclui o alcance sobre as demais ocorrências); as ocorrências do conjunto compartilham as mesmas pontas, então basta checar a escolhida. **Conjunto de ocorrências atingidas**:

| Alcance | Conjunto |
|---|---|
| `somente_este` | só a ocorrência `n` |
| `este_e_pendentes` | a `n` (confirmada ou não) **mais** as de `numero > n` com `situacao = 'prevista'` ("pendentes", RF-3.05; as confirmadas e as anteriores não mudam) |
| `todos` | todas as ocorrências de `r`, inclusive as confirmadas |

**Editar:**
- **Quem decide o caminho**: `lancamentos.editar` e `lancamentos.excluir` tratam sozinhos o lançamento não recorrente e o alcance `somente_este` (que é o caminho simples da fatia 2, com `lancamento_gravavel`). Só o alcance **múltiplo** (`este_e_pendentes`, `todos`) vai a `recorrencias_alcance`, importado **dentro da função** (`from app.services import recorrencias_alcance`), porque `recorrencias_alcance` importa `lancamentos` e um import no topo criaria ciclo. Recorrente sem `alcance` -> `VALIDACAO` (§3.1), conferido em `lancamentos` antes de escolher o caminho. `recorrencias_alcance` expõe `editar_conjunto` e `excluir_conjunto`; o `somente_este` não passa por ele.
- `somente_este`: é o `lancamentos.editar` (`fatia-2.md` §4.6); o modelo `r` não muda.
- `este_e_pendentes` e `todos`: monta o **estado resultante** (modelo atual + campos do `PATCH`) e o valida como na criação (RG-04, categoria, tags, conta ativa; conta arquivada -> `CONTA_ARQUIVADA`); aplica **só os campos enviados** a cada ocorrência do conjunto (tags substituídas); `data`: o dia enviado vira o `dia`, e cada ocorrência `x` do conjunto recebe `data_ocorrencia(mes_inicial, dia, x.numero)` (isso também desfaz deslocamentos de "somente este" nas atingidas); atualiza o modelo `r` (campos, `dia`, `recorrencia_tag`) para valer também nas ocorrências **ainda não geradas**. Os saldos se recalculam sozinhos (derivados).
- Nenhuma ocorrência fora do conjunto é tocada. Em `este_e_pendentes` o modelo muda mas as ocorrências anteriores e as confirmadas, já gravadas, não (CA-3.05, CA-3.12).

**Excluir:**
- `somente_este` (feito por `lancamentos.excluir`): apaga a ocorrência (e `lancamento_tag`). O contador `gerado_ate` **não** diminui, então ela não volta (D3).
- `este_e_pendentes`: apaga o conjunto; `r.numero_final = n - 1` (nenhuma ocorrência posterior é gerada: "encerra na anterior", RF-3.06, CA-3.06). Se não sobrar nenhum lançamento de `r`, apaga `recorrencia_tag` e `r`.
- `todos`: apaga todas as ocorrências, `recorrencia_tag` e `r`; o saldo volta ao valor anterior às confirmadas (CA-3.06).

Todas as variantes numa transação. `confirmar` (fatia 2) não passa por aqui (RF-3.03: confirmar ou ajustar uma ocorrência não altera as demais, CA-3.03).

### 4.6 Porcentagem do mês (`services/proporcao.py`; RG-07, RF-3.09 a 3.13)
`calcular(db, ctx, mes) -> ResultadoProporcao` (dataclass, reaproveitada pelas fatias 5, RF-3.20 e RF-5.29). Sem casal ativo -> `SEM_VINCULO`. Antes de tudo, `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))`.

**Função pública usada por outra fatia**: `soma_salarios_mes(db, casal: Casal, mes: date) -> Decimal` = `S_A + S_B` do mês (definição de "Receita de Salário" abaixo; `confirmado se confirmada, previsto nas demais`), sem herança e sem chamar o gancho (quem chama já o chamou). É a consulta do passo 1; `calcular` a obtém por dono através de `salarios_por_dono(db, casal, mes) -> tuple[Decimal, Decimal]` (também pública) e `soma_salarios_mes` soma os dois. A `fatia-7.md` §4.3 (`orçamentos`) importa `soma_salarios_mes`, definida nesta fatia.

Dados: `A = casal.pessoa_a_id`, `B = casal.pessoa_b_id`. **Receita de Salário** = `lancamento.tipo = 'receita'` cuja categoria é raiz com `fixa = 1` ou subcategoria de raiz com `fixa = 1`, com `dono_usuario_id IN (A, B)` (receita de dono casal fica de fora, RF-3.09, CA-3.11). O `valor` já é o confirmado, se confirmada, ou o previsto, se prevista (`fatia-2.md` §6 D1). Situação não filtra (atrasada conta como prevista).

1. `S_A`, `S_B` = soma dessas receitas do mês `[mes, fim_do_mes(mes)]` por dono. `T = S_A + S_B`.
2. `T > 0`: `origem_porcentagem = "mes"`; usa `S_A`, `S_B`.
3. `T = 0` (RF-3.13): procura o **último mês anterior** a `mes` em que a soma `S_A + S_B > 0` (uma consulta agrupada por mês, `ORDER BY mês DESC LIMIT 1`); se achar, usa as somas daquele mês, `origem_porcentagem = "herdada"`, `mes_origem` = esse mês (a herança "em cadeia" do RF-3.13 dá no mesmo, porque os meses sem Salário no meio herdam do mesmo mês); se não achar, `S_A = S_B = 1`, `origem_porcentagem = "padrao_50_50"`.
4. **Porcentagem exibida** de `p` (razão exata, só então arredondada): em centavos inteiros, `centésimos = (S_p_c * 10000 * 2 + T_c) // (2 * T_c)`, que é o arredondamento "meio para cima" de `S_p / T` em duas casas de percentual; `porcentagem = Decimal(centésimos) / 100` como string de 2 casas. Cada pessoa é arredondada à parte, da razão exata (nunca da porcentagem já arredondada).

Como a porcentagem é calculada na leitura, toda criação, confirmação, ajuste, edição ou exclusão de Salário aparece na hora (RF-3.10) e só afeta o mês da receita e os meses sem Salário que herdam dele (RF-3.11).

### 4.7 Base, devido, aportado, faltante (RF-3.14 a 3.18)
- **Base** = `SUM(valor)` dos lançamentos `tipo = 'despesa'`, `dono_usuario_id IS NULL`, cuja conta tem `casal_id = ctx.casal_ativo_id` (filtro pelo casal **ativo**, para não misturar a conjunta arquivada de outro casal), `data` no mês, **qualquer situação** (prevista, confirmada, atrasada) + `ganchos.base_cartao_conjunta(db, casal_ativo_id, mes)` (compras de cartão da conjunta no mês da fatura, RF-4.15; zero até a fatia 4). Receitas, transferências, aportes, reajustes e pagamentos de fatura não entram (`tipo` já os exclui).
- **Rateio exato do centavo** (`rateio(base, S_A, S_B) -> (devido_A, devido_B)`, função pura): tudo em centavos inteiros. A pessoa de **menor** `S` (em empate, a pessoa A) recebe `dev = (base_c * S_menor_c * 2 + T_c) // (2 * T_c)` (meio centavo para cima); a outra recebe `base_c - dev`. A soma dos dois é sempre a base (RNF-02), e o centavo de diferença fica com a pessoa de maior porcentagem, ou com A em 50/50 (RF-3.15). Conferido à mão: base 2500,00 com 6500/4000 -> B 952,38 e A 1547,62; base 100,01 com 60/40 -> B 40,00 e A 60,01; base 100,01 com 50/50 -> A 50,01 e B 50,00.
- **Aportado** da pessoa `p` = `SUM(valor)` das transferências `situacao = 'confirmada'` cuja conta de origem tem `usuario_id = p`, cuja conta de destino tem `casal_id = casal_ativo`, com `data` no mês (RF-3.16, CA-3.17). Previstas não contam; transferência entre individuais não conta.
- **Faltante** = `max(devido - aportado, 0)`; **excedente** = `max(aportado - devido, 0)`. O devido de um mês não depende do saldo da conjunta nem de excedentes de outros meses (RF-3.18); mês sem despesas do casal tem devido `0.00`.
- **Sugestão do aporte** (`sugestao_aporte(db, ctx, conta_origem_id, data) -> Decimal | None`): `conta_visivel`; se não for individual de `A` ou `B` do casal ativo (ou não houver casal), `None`; senão `faltante` da dona da conta em `calcular(db, ctx, mes_ref(data))`; `None` se for zero (RF-3.19, CA-3.19).

### 4.8 Ganchos e registros desta fatia
- Implementa `antes_de_ler_periodo` (chama `recorrencias.garantir_ate`) e `ao_arquivar_conta` (§4.4) em `services/ganchos.py`.
- **Estende `ao_desvincular(db, casal)`** (fatia 2 já arquiva a conjunta e copia categorias e tags, `fatia-2.md` §4.8): depois desses passos chama `recorrencias.encerrar_entre_individuais(db, casal)`, que aplica a regra 4 de `comum.md` §7.3 (decisão do desvínculo; não repetida aqui). Contrato: acha as contas individuais de A e de B pelo `usuario_id` das duas pessoas (sem `Contexto`) e, para o par, (a) cada `recorrencia` cuja origem é a individual de uma e o destino a da outra: apaga as ocorrências `prevista` (e `lancamento_tag`), põe `numero_final = gerado_ate` (a última gerada vira a final) e, se não sobrar nenhum lançamento, apaga `recorrencia_tag` e a recorrência; (b) apaga as transferências `prevista` avulsas (`recorrencia_id IS NULL`) entre as duas individuais e suas `lancamento_tag`. As transferências `confirmada` não são tocadas: ficam como histórico somente leitura (regra 2) e continuam no saldo das duas contas. Roda na transação do chamador, sem `commit`. A recorrência com a conjunta como ponta continua sendo tratada por `ao_arquivar_conta` (§4.4).
- **Limite conhecido e aceito (D-037; `t96r` S3)**: na transferência entre as duas individuais que sobrevive ao desvínculo (confirmada), a tag do casal fica só na **cópia da origem** (o passo 2 de `fatia-2.md` §4.8 reaponta o vínculo da tag pela conta individual de `P`, e a transferência cruzada tem a individual de A como origem). A outra pessoa, que vê o lançamento pelo destino, continua vendo o nome dessa tag, inclusive depois que a dona a renomear. Nada a implementar nesta fatia; alternativa descartada: copiar o vínculo também para a cópia do destino (mudaria a regra de cópia de tags da fatia 2 para um caso raro).
- Declara `base_cartao_conjunta(db, casal_id: int, mes: date) -> Decimal` (padrão `Decimal("0.00")`; implementada na fatia 4).
- Acrescenta a `services/alvos_vinculo.py` (mesma forma dos itens da fatia 2): `recorrencia.categoria_id` (conta: `recorrencia.conta_id`) em `ALVOS_CATEGORIA` e `recorrencia_tag` (conta: `recorrencia.conta_id`) em `ALVOS_TAG`. Com isso arquivar/mover categoria, unir/copiar no vínculo e excluir tag cobrem o modelo da recorrência sem tocar nesses services.

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4; componentes em §3 e §8)
- **`/controle/proporcao`** (já na tabela de rotas): `SeletorMes` fixo no topo (RF-0.03). `CardsResumo` com a base de despesas do casal; um card por pessoa com nome, porcentagem, "Devido", "Aportado", "Faltante" (ou "Excedente" quando houver). Quando `origem_porcentagem` é `herdada`, uma linha com ícone **e** texto: "Porcentagem herdada de {mês por extenso}"; quando `padrao_50_50`: "50% para cada, por falta de Salário no histórico" (RNF-08). Mês sem despesa do casal: texto "Sem despesas do casal neste mês" e devido `R$ 0,00`. Sem vínculo (`SEM_VINCULO`): `EstadoVazio` com botão para `/configuracoes/vinculo`.
- **Formulário de lançamento** (`fatia-2.md` §5.1): em "Mais detalhes", campo **Recorrente** (ligar/desligar) com as opções "Mensal, sem data de fim" e "Repetir N meses" (N de 2 a 60); aparece em despesa, receita e transferência/aporte (CA-0.05: continua invisível até "Mais detalhes"). Marcando recorrente, a opção "Foi paga/recebida" some (a ocorrência nasce prevista).
- **Alcance múltiplo: o que o front envia** (`PATCH` com `este_e_pendentes` ou `todos`): somente os **campos alterados** (o formulário compara com os valores de abertura) e **nunca `situacao`**. `dono_usuario_id` e `conta_id` vão juntos (e, na transferência, `conta_id` e `conta_destino_id` juntos), se qualquer um mudou. Motivo: o `PATCH` sobrescreve os campos enviados em cada ocorrência do conjunto, e enviar o formulário inteiro trocaria também o `valor` real das ocorrências confirmadas pelo valor da ocorrência aberta. Em `somente_este` e no não recorrente, vale o envio da fatia 2.
- **Aporte** (RF-3.19): ao ter origem individual, destino conjunta e data, o formulário consulta a sugestão e preenche o valor se a pessoa ainda não digitou; ela pode alterar (CA-3.19).
- **Lista do Controle**: itens recorrentes levam um ícone de repetição com texto acessível "Recorrente"; Editar e Excluir abrem o `DialogoAlcance` (`front.md` §8, RF-0.10) antes da chamada **apenas** se `recorrente` for verdadeiro (CA-0.10, CA-3.07).
- `DialogoAlcance({ aberto, acao: "editar" | "excluir", onEscolher(alcance), onCancelar })`, com `Alcance = "somente_este" | "este_e_pendentes" | "todos"`; rótulos: "Somente este", "Este e os pendentes", "Todos (incluindo confirmados)"; operável por teclado, alvos de 44 px.

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | **Materializar** as ocorrências como linhas de `lancamento` (geradas sob demanda até o mês consultado) | Confirmar, ajustar, atrasar e excluir uma ocorrência já é lançamento simples; todo `SUM` de saldo, previsto, base e aporte (fatias 2, 3, 4, 5) continua sendo uma consulta sobre `lancamento`, sem unir ocorrências "virtuais" em cada fatia | Ocorrências virtuais calculadas na leitura (exigiria somar virtuais em cada consulta de cada fatia) |
| D2 | O modelo (`recorrencia`) guarda a regra e é a fonte das ocorrências **ainda não geradas**; "este e os pendentes" e "todos" atualizam modelo **e** linhas | Sem dividir a recorrência em duas; como as não geradas são sempre as últimas, uma edição "daqui para frente" é só mudar o modelo | Dividir a recorrência em duas a cada edição; clonar a última ocorrência |
| D3 | Contador `gerado_ate` (não `MAX(numero)`) | Excluir "somente este" a última ocorrência gerada não pode fazê-la ressurgir | Derivar do `MAX(numero_recorrencia)` |
| D4 | Arquivar conta apaga as ocorrências **previstas com data a partir de hoje** e recua o contador | RF-3.07: deixar de aparecer a partir do arquivamento, preservando confirmadas e atrasadas; desarquivar regenera do modelo | Filtrar na leitura (toda consulta teria de conhecer o arquivamento) |
| D5 | `garantir_ate` faz `commit` dentro de leituras | Geração idempotente, protegida por `uq_lancamento_recorrencia_id_numero_recorrencia` e `FOR UPDATE`; sem isso a leitura desfaria o que gerou | Job periódico (infra nova) ou gerar tudo na criação (sem fim não cabe) |
| D6 | Limites: consulta até `hoje + 120 meses`; primeira data até 60 meses atrás | Limita linhas por recorrência "sem fim" (≤ 120 mais o passado) e o custo de `garantir_ate`; `comum.md` §13 pede limitar o horizonte | Sem limite |
| D7 | Em alcances múltiplos a `data` só altera o **dia** | RF-3.05 não define; mover mês de várias ocorrências seria ambíguo com a numeração. O dia é o que muda na prática (ex.: aluguel passa do dia 10 ao 15) | Recusar `data` em alcances múltiplos; permitir mês arbitrário |
| D8 | `situacao` não é editável em alcances múltiplos | Confirmar é por ocorrência (RF-3.03) | Confirmar várias de uma vez (v2, requisitos §3) |
| D9 | Recorrência só se define na **criação** | RF-3.01 ("na criação"); converter um lançamento existente é outro caso de uso | Botão "tornar recorrente" |
| D10 | Porcentagem e aporte **calculados na leitura**, em centavos inteiros; arredondamento só na saída | Sempre consistente após qualquer mutação (RF-3.10); exatidão (RNF-02); soma dos devidos = base | Gravar porcentagem por mês |
| D11 | Sugestão do aporte em rota própria | Tem parâmetros diferentes (conta e data) e devolve um valor só; o formulário não precisa da tela inteira | Reaproveitar `GET /api/proporcao` e filtrar no cliente (lógica de "dona da conta" no front) |
| D12 | Gancho `base_cartao_conjunta` | A fatia 4 só existe depois; RF-4.15 manda somar o cartão da conjunta à base | Fatia 3 conhecer as tabelas de cartão |

Riscos:
- **Complexidade do alcance**: a regra mexe em ocorrências, modelo e tags ao mesmo tempo; os casos de CA-3.05, CA-3.06 e CA-3.12 (6 ocorrências, 2 confirmadas) são o roteiro de teste e esse trecho deve ser revisado por inteiro.
- **Escrita em leitura**: duas abas abrindo meses futuros ao mesmo tempo disputam o `FOR UPDATE` da recorrência; o pior caso é uma espera curta. Na revisão, confere-se que nenhum `GET` além de `garantir_ate` escreve.
- **Fatia 4**: compra recorrente no cartão (RF-4.12) e parcelas precisarão estender `recorrencia` (cartão/fatura) ou ter estrutura própria; a fatia 3 só garante que o modelo em linhas de `lancamento` pode ser reaproveitado. As migrações seguintes começam em `0006`.
- **Soma dos percentuais exibidos**: arredondar cada pessoa à parte pode, raramente, somar 100,01 (empate no terceiro decimal). Os valores devidos (dinheiro) somam sempre a base exata; a porcentagem é só de exibição (RF-3.09).
- **Salário em conta de pessoa que mudou de casal**: a soma usa `dono_usuario_id IN (A, B)` em qualquer mês, inclusive anteriores ao vínculo atual (a pessoa vê tudo do casal, RG-02); é o comportamento esperado para a herança de RF-3.13.
- **Remapeamento no vínculo**: se `recorrencia` não estiver em `ALVOS_*`, a união e a cópia deixam o modelo apontando para categoria/tag que não existe mais no escopo certo; a geração de recorrências precisa incluir os alvos.
