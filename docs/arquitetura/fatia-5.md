# Fatia 5: Balanço mensal, lista com filtros, tela inicial, projeção e relatórios

> Só o que é da fatia 5. Convenções: `comum.md` §4, §6, §7.3. Saldos, situação exibida, `acesso.py`, ganchos: `fatia-2.md` §4.1, §4.2, §4.9. Proporção, aporte e `rateio`: `fatia-3.md` §4.6 e §4.7. Cartão, fatura e `gasto_cartao`: `fatia-4.md` §4.2. `tempo.py`: `fatia-1.md` §4.10. Telas e componentes: `front.md`.
> Pré-requisito: fatias 1 a 4 integradas. **Esta fatia é só consulta**: nenhuma tabela, nenhuma migração, nenhuma rota de escrita.

## 1. Escopo e RF cobertos

Balanço do mês (total, por conta, por dono), lista do Controle com filtros e saldo do fim do dia, tela Início com 7 blocos, projeção de saldo e relatórios. Aplicações e resgates de meta (fatia 6) já são tratados aqui por tipo, para a fatia 6 não precisar mudar estes serviços (D8).

## 2. Tabelas e migrações

Nenhuma. Os índices existentes bastam: `ix_lancamento_conta_id_data` e `ix_lancamento_conta_destino_id_data` (`fatia-2.md` §2.2), `uq_fatura_cartao_id_mes_ref` e `ix_item_fatura_fatura_id`/`_conta_id` (`fatia-4.md` §2). Se a medição de CA-N.06 mostrar consulta lenta, o índice entra como nova revisão, a próxima livre na cadeia do Alembic (`0009` a `0011` são das fatias 6 e 7), fora desta fatia.

## 3. Contratos das rotas

Prefixo `/api`; sessão obrigatória; ids de outro casal respondem `404 NAO_ENCONTRADO`. **Nenhum código de erro novo**: `VALIDACAO` (422), `NAO_ENCONTRADO` (404), `SEM_VINCULO` (409, `fatia-1.md` §3.4). Mês: `?mes=AAAA-MM` (padrão: mês de `hoje()`), validado por `tempo.validar_mes`. Dinheiro e porcentagem como string (`comum.md` §6.2); o front não soma nem arredonda nada.

### 3.0 Objetos comuns
```
Par     = { "previsto": "10000.00", "realizado": "6000.00" }
Resumo  = { "entradas": Par, "saidas": Par, "saldo": Par }                       // saldo = entradas - saidas, em cada lado
```
`previsto` considera todas as situações (confirmada, prevista, atrasada); `realizado`, só as confirmadas e, no cartão, só itens de fatura **paga** (definições da fatia 5 dos requisitos, RF-4.15).

### 3.1 Balanço (RF-5.01 a 5.04)
`GET /api/balanco?mes=` -> 
```
BalancoMes = { "mes": "2026-10", "total": Resumo,
  "contas": [ { "conta_id": 3, "nome": "Conta conjunta", "dono_usuario_id": null,
                "entradas": Par, "saidas": Par, "transferencias_entrada": Par, "transferencias_saida": Par,
                "saldo": Par,                                                    // entradas - saidas da conta, de `totalizar` (RF-5.18; o front não subtrai)
                "saldo_atual": "-600.00", "saldo_previsto": "-1900.00" } ],      // contas ativas; ordem: conjunta, pessoa A, pessoa B
  "donos":  [ { "dono_usuario_id": 1 | null, "nome": "Ana" | "Casal", "entradas": Par, "saidas": Par, "saldo": Par } ] }   // ordem: A, B, casal
```
`donos` tem 3 itens com casal ativo; sem casal, só a própria pessoa. A soma dos `donos` é igual a `total` em todos os campos (CA-5.03). Erros: 422.

### 3.2 Lista do Controle (RF-5.05 a 5.13)
`GET /api/controle/lista` com `mes` e filtros (todos repetíveis; OU dentro do mesmo parâmetro, E entre parâmetros):

| Parâmetro | Valores |
|---|---|
| `dono` | `casal` ou id de usuário (a própria pessoa ou o parceiro; outro id -> 422 `campos.dono`; `casal` sem casal ativo -> 422 `campos.dono`) |
| `conta_id`, `cartao_id`, `categoria_id` | ids visíveis (senão 404); `categoria_id` de categoria-mãe inclui as subcategorias |
| `tipo` | `despesa_conta`, `receita`, `despesa_cartao`, `transferencia`, `aporte`, `aplicacao_resgate`, `reajuste` (RF-5.10; os atalhos são conjuntos: Despesas = `despesa_conta`+`despesa_cartao`; Receitas = `receita`; Transferências = `transferencia`+`aporte`; "Todas" = sem `tipo`) |
| `situacao` | `confirmada`, `prevista`, `atrasada` |

```
ListaControle = { "mes": "2026-10", "filtros_ativos": false,
  "resumo": { "saldo_atual_total": "4350.00", "entradas": Par, "saidas": Par, "saldo": Par },   // acompanha os filtros (RF-5.09)
  "dias": [ { "data": "2026-10-05", "itens": [ ItemLista ], "saldo_fim_do_dia": "900.00" } ] }  // dias com item, ordem cronológica
ItemLista = { "kind": "lancamento", "lancamento": LancamentoSaida,                 // fatia-2.md §3, com as extensões das fatias 3 e 6
              "conta_nome": "Conta de Ana", "conta_destino_nome": null | "Conta conjunta",
              "rotulo": "Despesa" | "Receita" | "Transferência" | "Aporte" | "Reajuste de saldo" | "Aplicação em meta" | "Resgate de meta",
              "meta": null | { "id": 3, "nome": "Reserva" } }                        // preenchido pela fatia 6
          | { "kind": "fatura", "data": "2026-10-17", "fatura": FaturaResumo }       // fatia-4.md §3.0; sem ações
```
`conta_nome` e `conta_destino_nome` são `null` quando a conta **não é visível** ao contexto (`comum.md` §7.3 regra 1: a conta de uma ponta não visível vem sem nome, RF-1.10); o front mostra o rótulo neutro "Conta externa" nesse caso. Só a fatura **sem itens e sem pagamento** deixa de virar linha da lista (e de ter `saldo_fim_do_dia`); a fatura com pagamento, previsto ou confirmado, continua como linha mesmo sem itens (`fatia-4.md` §4.2; D-040, D-043).
Dentro do dia: por `id` crescente, a linha da fatura por último. Dia sem item não aparece e nunca tem `saldo_fim_do_dia`. Sem nenhum item no mês (com ou sem filtro) devolve `dias: []`; o front distingue o estado vazio (RF-0.07) da lista filtrada vazia (RF-5.13) por `filtros_ativos`. Erros: 404, 422.

### 3.3 Início (RF-5.14 a 5.21)
`GET /api/inicio` (sem parâmetros; sempre o mês corrente) -> um objeto com os 7 blocos, para uma só ida à rede em 4G:
```
InicioSaida = { "mes": "2026-10", "hoje": "2026-10-29",
  "cards": { "saldos": [ { "conta_id": 3, "nome": "Conta conjunta", "dono_usuario_id": null, "saldo_atual": "1000.00" }, … ],   // conjunta, A, B (só as que existem, ativas)
             "total_faturas_mes": "1000.00" },                                                // faturas do mês corrente (D-012, D-044), pagas ou não, todos os cartões de conta ativa
  "proporcao": ProporcaoSaida | null,                      // fatia-3.md §3.2, por `proporcao.proporcao_do_mes` (§4.7); null sem casal ativo
  "pendentes": [ ItemLista ],                              // só kind "lancamento"
  "despesas_por_categoria": RelatorioCategorias,           // §3.5
  "balanco_contas": [ BalancoConta ],                      // §3.1, campo "contas"
  "proximas_faturas": [ FaturaResumo ],
  "projecao": ProjecaoSaida }                              // conta_id nulo, horizonte 6
```
### 3.4 Projeção (RF-5.22 a 5.25)
`GET /api/projecao?horizonte=3|6|12&conta_id=` (padrão 6, todas as contas ativas; `conta_id` arquivada ou de outro casal -> 422 `campos.conta_id`):
```
ProjecaoSaida = { "conta_id": null | 3, "horizonte": 6,
  "meses": [ { "mes": "2026-10", "previsto": false,          // true nos meses depois do corrente (marca "Previsto")
               "entradas": "…", "saidas": "…", "transferencias_entrada": "…", "transferencias_saida": "…",
               "pagamentos_fatura": "…", "aplicacoes_menos_resgates": "…", "saldo_previsto": "…" } ] }
```
### 3.5 Relatórios (RF-5.26 a 5.29)
Todos `GET`, `?mes=` (o do seletor); tipo de relatório é a rota (`front.md` §4: `/controle/relatorios/:tipo`):
| Caminho | Saída |
|---|---|
| `/api/relatorios/despesas-por-categoria` | `RelatorioCategorias = { "mes", "total": "3000.00", "categorias": [ { "categoria_id": 5 \| null, "nome": "Mercado", "icone", "cor", "valor": "…", "valor_direto": "…", "porcentagem": "93.33", "subcategorias": [ { …sem "subcategorias" } ] } ] }`; o grupo de ajuste de fatura vem com `categoria_id: null` e `nome: "Reajuste de fatura"`; `valor` da categoria-mãe = próprio + subcategorias; `valor_direto` = só lançamentos na categoria-mãe |
| `/api/relatorios/despesas-por-dono` | `{ "mes", "total", "itens": [ { "dono_usuario_id": 1 \| null, "nome", "valor", "porcentagem" } ] }` |
| `/api/relatorios/despesas-por-conta` | `{ "mes", "total", "itens": [ { "conta_id", "nome", "valor", "porcentagem" } ] }` |
| `/api/relatorios/balanco-mensal` | `{ "meses": [ { "mes", "entradas": Par, "saidas": Par, "saldo": Par } ] }` (6 itens: o mês e os 5 anteriores, ordem cronológica; mês anterior a 2000-01 fica de fora da lista, que então tem menos de 6 itens) |
| `/api/relatorios/proporcao` | `{ "meses": [ ProporcaoSaida ] }` (mesmos meses e ordem do balanço mensal, inclusive a regra do limite 2000-01); `SEM_VINCULO` sem casal ativo |

Porcentagem = `money.porcentagem(valor, total)` (`fatia-4.md` §4.1), que devolve `None` com total zero; o service converte esse `None` em `"0.00"` (a saída nunca é nula). Valores e totais são **previstos** (RF-5.26).

## 4. Regras dos services

Toda leitura de um mês chama antes `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))` (gera recorrências, `fatia-3.md` §4.3, e séries de cartão, `fatia-4.md` §4.5). Nenhum service desta fatia escreve em tabela de negócio; a revisão confere (`grep` por `add(`, `delete(`, `commit(` nos arquivos desta fatia: só `garantir_ate` escreve, e ele não é daqui).

### 4.1 Contas consideradas
`escopo_contas(db, ctx, conta_ids=None) -> list[Conta]`: sem `conta_ids`, as contas visíveis (`filtro_contas`) e **ativas**; com `conta_ids`, cada uma por `conta_visivel` (aceita arquivada: é o caminho de `/controle/contas/:contaId`). Totais e saldos "totais" somam só as contas ativas.

**Dono efetivo** de uma linha (D3): despesa e receita, o `dono_usuario_id`; qualquer outro tipo (transferência, reajuste, aplicação, resgate), o dono da **conta de origem** (`conta.usuario_id`, ou `None` = casal se for a conjunta); item de cartão, o dono da conta dona.

### 4.2 Linhas do mês (`services/movimentos.py`, `services/filtros_lista.py`)
`Linha` (dataclass, definida em `filtros_lista.py`): `origem` (`lancamento` \| `cartao`), `id` (do lançamento; `None` no cartão), `classe`, `data`, `valor`, `conta_id`, `conta_destino_id`, `dono`, `categoria_id`, `categoria_raiz_id`, `cartao_id`, `situacao` (`confirmada`/`prevista`/`atrasada`), `realizada`.

`carregar_mes(db, ctx, mes, contas) -> list[Linha]` chama antes `ganchos.antes_de_ler_periodo(db, ctx, fim_do_mes(mes))` (§4 abertura), de modo que lista, balanço e relatórios não repetem a chamada:
1. Lançamentos do mês (`data` entre o 1º e o último dia) com `conta_id` **ou** `conta_destino_id` nas contas, `tipo <> 'pagamento_fatura'`, em **uma** consulta; transferência vira **uma** linha (não duas). `classe`: `despesa` -> `despesa_conta`; `receita` -> `receita`; `transferencia` -> `aporte` se origem individual e destino conjunta (`fatia-2.md` §4.1), senão `transferencia`; `reajuste` -> `reajuste`; `aplicacao`/`resgate` -> `aplicacao_resgate`. `situacao` por `saldos.situacao_exibida`; `realizada = (situacao == 'confirmada')`.
2. Cartão: `faturas.gasto_cartao(db, conta_ids, mes)` (`fatia-4.md` §4.2): cada grupo vira uma `Linha` de classe `despesa_cartao`, `valor` = total do grupo (já com estornos e ajustes), `categoria_id` (nulo no ajuste), `cartao_id`; `situacao` pelo status da fatura (RF-5.11: aberta e fechada = prevista, vencida = atrasada, paga e zerada = confirmada); `realizada = paga`.
3. A categoria-raiz vem de uma consulta única por `IN` das categorias usadas.

`filtros_lista.py` (puro, sem `Session`, sem `schemas`): `FiltroLista(donos, contas, categorias, tipos, cartoes, situacoes)`, `aplicar(linhas, filtro) -> list[Linha]` e `totalizar(linhas) -> ResumoValor`, com as dataclasses `ParValor(previsto, realizado)` e `ResumoValor(entradas, saidas, saldo)`, todas em `Decimal`. `Par` e `Resumo` de §3.0 (strings) são os **schemas** de `schemas/controle.py`; quem monta a resposta (`lista_controle`, `balanco`, `relatorios`, `inicio`) converte com `para_str` ao preencher o schema, e o schema nunca entra em `filtros_lista.py`.
- Regra de `aplicar`: cada parâmetro preenchido é um E; dentro dele, OU. `dono`: `linha.dono`. `conta_id`: `conta_id` **ou** `conta_destino_id` da linha. `categoria_id`: `categoria_id` ou `categoria_raiz_id` em conjunto; linhas sem categoria (transferência, reajuste, aplicação, ajuste de fatura) não passam. `tipo`: `classe`. `cartao_id`: só linhas `origem = cartao` desse cartão (todo lançamento sai). `situacao`: `linha.situacao`.
- `totalizar`: entra em `entradas` a classe `receita`; em `saidas`, `despesa_conta` e `despesa_cartao` (valor do grupo, com sinal). Transferência, aporte, reajuste e aplicação/resgate **nunca** entram (RF-5.02). `previsto` soma todas; `realizado` soma as `realizada`. Somas em `Decimal`, `saldo = entradas − saidas`.

Agregar em Python (e não em SQL) é deliberado (D1): os filtros e os totais ficam uma só regra, e um mês tem até 500 lançamentos (RNF-07).

### 4.3 Balanço (`services/balanco.py`)
`calcular(db, ctx, mes) -> BalancoMes`: `carregar_mes` das contas ativas; `total = totalizar(todas)`; por conta, `totalizar` das linhas com `conta_id` da conta (despesa/receita/cartão contam na conta de origem; compras de cartão na conta dona, RF-5.03), que dá `entradas`, `saidas` e o `saldo` de §3.1 (RF-5.18; o front não subtrai); `transferencias_entrada`/`_saida` (informativas) somam as linhas de classe `transferencia` e `aporte` com a conta como destino/origem, em `ParValor` (realizado = confirmada); `saldo_atual`/`saldo_previsto` por `saldos.saldos_atuais` e `saldos_previstos(..., fim_do_mes(mes))` (uma consulta cada, `fatia-2.md` §4.1). Por dono, `totalizar` das linhas com `dono` igual. Invariante testável: soma dos donos == `total`.

### 4.4 Saldo do fim do dia (`services/saldo_dia.py`; `saldos.py` ganha `efeitos_por_data`)
`saldos.py` ganha `efeitos_por_data(db, conta_ids, de: date | None, ate: date) -> list[tuple[date, Decimal]]`: efeito líquido por data de **todos** os lançamentos (confirmados e previstos, inclusive `pagamento_fatura`, `aplicacao`, `resgate`, ambos os lados da transferência) sobre o conjunto de contas, usando a mesma tabela de efeitos de `fatia-2.md` §4.1 (que as fatias 4 e 6 estendem; uma só fonte).
`saldo_fim_do_dia(db, conta_ids, mes, datas_com_item) -> dict[date, Decimal]`:
1. `abertura = Σ saldo_inicial + Σ efeitos(data < 1º do mês) − Σ faturas sem pagamento, com total > 0 e vencimento < 1º do mês` (a fatura não paga e sem pagamento previsto é saída da conta dona no vencimento, RG-06; `faturas.calcular` dos cartões dessas contas). O predicado da fatura é o **mesmo** de `ganchos.ajuste_cartao_previsto` (`fatia-4.md` §4.2): `total > 0` e `pagamento is None` (nem confirmado nem previsto), sem mais condição de situação ou status.
2. Soma acumulada, dia a dia, de `efeitos_por_data` do mês e das faturas sem pagamento com vencimento no dia; devolve o saldo ao fim de cada data em `datas_com_item`.
As contas do conjunto: as do filtro `conta_id` (se houver), senão as ativas; o filtro `dono` restringe às contas desse dono (o dono de despesa/receita equivale ao dono da conta, RG-04). **Categoria, tipo, cartão e situação não mudam o saldo**: o saldo do fim do dia depende só dos filtros de **conta** e **dono** (D4; decisão D-012, CA-5.09). Confere CA-5.07 (900, 850, 650) e, no último dia do mês corrente, é igual ao saldo previsto (RG-06).

### 4.5 Lista (`services/lista_controle.py`)
`listar(db, ctx, mes, filtro) -> dict`: antes de tudo valida `dono` (id que não é a própria pessoa nem o parceiro, e `casal` sem `ctx.casal_ativo_id` -> `422` em `campos.dono`, §3.2); contas = `escopo_contas(filtro.contas)`; `linhas = aplicar(carregar_mes(...), filtro)`; `resumo.entradas/saidas/saldo = totalizar(linhas)` e `saldo_atual_total` = soma de `saldos_atuais` do **mesmo conjunto de contas de §4.4** (as do filtro `conta_id`, senão as ativas, restritas pelo filtro `dono`), e não das contas de `escopo_contas` sem o filtro de dono; itens: os lançamentos filtrados (carregando `LancamentoSaida` por `IN`, como `fatia-2.md` §4.6, e reusando `lancamentos.montar_saidas` em vez de remontar a saída) e, **sem** filtro de categoria, `faturas_do_mes` (`fatia-4.md` §4.2) cujas linhas passem no filtro, cada uma montada em `FaturaResumo` por `cartoes.resumo_fatura` (`fatia-4.md` §4.3) com as faturas do mês buscadas **por `cartao_id`** (um `IN` dos cartões da lista, uma carga só, nada de `calcular_mes` em laço) (conta e dono pela conta dona; `cartao_id`; situação mapeada de RF-5.11; `tipo` aceita a fatura em `despesa_cartao`); agrupa por data (itens de lançamento ordenados por `id`, a fatura na data de vencimento); `saldo_fim_do_dia` conforme §4.4 para as datas presentes. `filtros_ativos` = algum parâmetro enviado. Os campos `conta_nome`, `rotulo` e (fatia 6) `meta` saem por consulta `IN`; `conta_nome`/`conta_destino_nome` ficam `null` para conta não visível ao contexto (`comum.md` §7.3 regra 1; §3.2) e o front exibe "Conta externa". Como em `faturas_do_mes`, só a fatura sem itens e sem pagamento deixa de virar linha e `saldo_fim_do_dia` (D-040, D-043).

### 4.6 Gasto por categoria (`movimentos.gasto_por_categoria`)
`gasto_por_categoria(db, ctx, mes) -> dict[int | None, Decimal]`: `previsto` de `despesa_conta` + `despesa_cartao` (inclusive estornos e ajustes) por `categoria_id` próprio (sem consolidar na mãe; `None` = ajuste de fatura), contas ativas. É a função **somente leitura** que a fatia 7 usa (RF-7.09) e que alimenta `RelatorioCategorias`. Total = `totalizar(...).saidas.previsto` (CA-5.18, CA-5.26).

### 4.7 Início (`services/inicio.py`)
Monta `InicioSaida` para `mes_ref(hoje())`, reusando os serviços acima e os da fatia 3. **Proporção**: `proporcao` = `proporcao.proporcao_do_mes(db, ctx, mes)` (já devolve o `ProporcaoSaida` em string; a `calcular` do mesmo módulo devolve dataclass em `Decimal` e, sem casal, levanta `SEM_VINCULO`, então não serve direto); `inicio.py` testa `ctx.casal_ativo_id` **antes** e, sem casal ativo, `proporcao = None` em vez de erro (200).
- **cards**: `saldos_atuais` das contas ativas, na ordem conjunta, A, B; `total_faturas_mes` = soma do `valor` de `faturas_do_mes` de cartões de conta ativa (faturas do mês corrente, pagas ou não, RF-5.15; D-012, D-044; é o mesmo número do `total_faturas_mes` de `fatia-4.md` §3.1, que soma `fatura_corrente.valor`, e a fatura sem itens nem pagamento vale zero).
- **pendentes** (RF-5.17): lançamentos `despesa`, `receita`, `transferencia` das contas ativas, `situacao = 'prevista'` e `data <= hoje` (inclui os de hoje e os atrasados de qualquer mês), ordem `data ASC, id ASC`; sem fatura.
- **despesas_por_categoria**, **balanco_contas** e **projecao** (conta `None`, horizonte 6): `relatorios` §4.9, `balanco` §4.3, `projecao` §4.8.
- **proximas_faturas** (RF-5.19): para cada cartão de conta ativa, a fatura de menor `vencimento` entre as **não pagas com valor > 0** (fatura com pagamento previsto ainda é não paga) -> `FaturaResumo`.

### 4.8 Projeção (`services/projecao.py`)
`calcular(db, ctx, horizonte, conta_id=None)`. Contas `S` = a conta escolhida ou todas as ativas. Antes de ler: `antes_de_ler_periodo(db, ctx, fim_do_mes(mes_corrente + horizonte − 1))`.
1. **Ponto de partida**: `saldo_atual(S)` (`saldos_atuais`, soma em `Decimal`).
2. **Movimentos** são só os **não confirmados**: lançamentos `situacao = 'prevista'` das contas de `S` (origem ou destino) com `data <= fim do último mês`, e as faturas não pagas, com total > 0 e **sem nenhum pagamento**, cujo `vencimento <= fim do último mês`. O **mês de cada movimento** é o mês da `data` (da fatura, o mês do `vencimento`); o que for de **mês anterior ao corrente** cai no mês corrente (atrasados e faturas vencidas, RF-5.24). Uma consulta agrupada por `(classe, mês limitado, papel da conta)` dos lançamentos; faturas por `faturas.calcular(..., ate_mes)`.
3. **Colunas por mês**: `entradas` (receita), `saidas` (`despesa`), `transferencias_entrada` (conta destino em `S`), `transferencias_saida` (conta origem em `S`; com todas as contas, uma transferência aparece nas duas colunas e se anula no saldo, RF-5.23), `pagamentos_fatura` (lançamentos `pagamento_fatura` previstos pela **data do pagamento** + faturas sem pagamento no mês do vencimento; um não duplica o outro, CA-5.23), `aplicacoes_menos_resgates` (`aplicacao` − `resgate` previstos).
4. `saldo_previsto[i] = saldo_previsto[i−1] + entradas − saidas + transferencias_entrada − transferencias_saida − pagamentos_fatura − aplicacoes_menos_resgates`, com `saldo_previsto[−1] = saldo_atual(S)`. Compras de cartão não aparecem nas colunas: entram pela fatura. Reajustes futuros não existem. Para `S` = uma conta e o mês corrente o resultado é o `saldos_previstos` da conta (RG-06; CA-5.24); a tabela de teste é CA-5.23 (1.000; −100; −600).
5. `previsto = (índice > 0)`.

### 4.9 Relatórios (`services/relatorios.py`)
- Categorias: `gasto_por_categoria` + árvore das categorias por `IN`; agrupa na mãe (`valor`, `valor_direto`, `subcategorias`); o ajuste de fatura é a linha `Reajuste de fatura`. Ordem por `valor` decrescente. Percentuais da razão exata ao total por `money.porcentagem`; com total zero a função devolve `None` e o service grava `"0.00"` (em todos os relatórios de porcentagem).
- Dono e conta: `totalizar` das linhas de saída (`despesa_conta` + `despesa_cartao`) agrupadas por `dono` / `conta_id` (CA-5.27: 2.800 de 3.000 = 93,33%).
- Balanço mensal: `balanco.calcular(...).total` para cada um dos 6 meses (o do seletor e os 5 anteriores; meses sem lançamento com zeros); o mês anterior a 2000-01 (limite inferior de `validar_mes`) **não entra** na lista: o relatório devolve menos de 6 itens em vez de erro 422.
- Proporção: `proporcao.proporcao_do_mes` para cada mês da mesma lista (`fatia-3.md` §4.6; herdada e 50/50 já vêm resolvidas; devolve `ProporcaoSaida` pronto e, sem casal ativo, levanta `SEM_VINCULO`, que a rota repassa como 409).

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4)
| Rota | Tela | Observações |
|---|---|---|
| `/controle` | Lista do mês (substitui o esqueleto da fatia 2) | `SeletorMes` fixo; `CardsResumo` (saldo atual total, entradas, saídas, saldo do mês, e um card por pessoa com porcentagem, devido, aportado, faltante/excedente de `GET /api/proporcao`); chips de atalho de tipo (Todas, Despesas, Receitas, Transferências) e botão "Filtros" que abre `BottomSheet` com dono, conta, categoria, tipo avançado, cartão, situação (multisseleção); filtros e mês na URL (`useSearchParams`); chips dos filtros ativos com "Limpar filtros"; lista por dia com `saldo_fim_do_dia` ao fim; linha da fatura (ícone de cartão, nome do cartão no lugar da conta, valor, sem menu; toque abre `/cartoes/:cartaoId/faturas/:mes`); ações do item: Confirmar (só não confirmados), Editar, Excluir (alcance da fatia 3); atalhos para Proporção, Balanço, Relatórios e Projeção |
| `/controle/contas/:contaId` | Lançamentos de uma conta (fatia 2) | passa a usar a mesma lista com `conta_id` fixo |
| `/controle/balanco` | Balanço | `SeletorMes`; total; blocos por conta e por dono em `CardsResumo`/listas; transferências em linha separada e informativa |
| `/` | Início | 7 blocos fixos na ordem de RF-5.14, sem seletor de mês, sem opção de ocultar/reordenar; ícone de engrenagem (configurações) no cabeçalho; cada bloco sem dados mostra `EstadoVazio` com frase (RF-5.21); "Fazer aporte" abre `abrir("transferencia", undefined, undefined, undefined, { conta_id, conta_destino_id })` (conta da pessoa -> conjunta) e a sugestão do valor segue a fatia 3. `valoresIniciais` do `FormTransferencia` é **edição** (`FormTransferencia.tsx:64`: `editando = valoresIniciais !== undefined`), então o form ganha a prop opcional `preenchimento` (`{ conta_id?, conta_destino_id? }`), aplicada sobre `valoresAbertura(sessao)` só ao abrir uma transferência nova; a data fica em hoje por `valoresAbertura` (não se passa data). O `abrir` do provider ganha o 5º parâmetro opcional `preenchimento`, guardado no estado e repassado por `Shell.tsx` ao `FormTransferencia`. |
| `/projecao` | Projeção | seletor de conta ("Todas" + ativas) e de horizonte (3/6/12, padrão 6); gráfico de área (`recharts`, valores convertidos a número só na camada do gráfico, `front.md` §7) e tabela em contêiner com rolagem horizontal própria; marca "Previsto" nos meses depois do corrente (texto, RNF-08) |
| `/controle/relatorios` e `/controle/relatorios/:tipo` | Relatórios | menu com 5 entradas; `:tipo` = `categorias`, `donos`, `contas`, `balanco`, `proporcao`; rosca sempre com lista de valor e porcentagem; balanço em barras entradas × saídas; proporção com devido × aportado por pessoa e mês |

Estados vazios: lista sem lançamentos (botão "Novo lançamento"), lista filtrada sem resultado ("Nenhum lançamento com esses filtros" + "Limpar filtros"), cada bloco do Início, sem cartões, sem faturas.

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | Totais, filtros e relatórios por **agregação em Python** sobre as linhas do mês | Uma só regra de filtro vale para lista, cards e saldo; até 500 lançamentos/mês (RNF-07); `Decimal` exato (`comum.md` §6.2) | `SUM`/`GROUP BY` por combinação de filtros (uma consulta por regra, risco de divergência) |
| D2 | `GET /api/inicio` composto com os 7 blocos | Uma ida à rede em 4G (CA-N.06) e consistência entre blocos (mesmo `hoje`) | Sete chamadas independentes |
| D3 | "Dono efetivo": para tipos sem dono, o dono da conta de origem | O filtro de dono (RF-5.09) precisa de resposta para transferência, reajuste e aplicação; RG-04 já liga dono e conta | Esconder esses tipos quando há filtro de dono |
| D4 | O saldo do fim do dia depende só dos filtros de **conta** e **dono** | Saldo é propriedade da conta; "saldo de uma categoria" não existe. CA-5.09 diz que o saldo "acompanha o filtro": decidido em D-012 que vale só para conta e dono (conjunto de contas), não é mais interpretação pendente | Recalcular o saldo só com as linhas filtradas |
| D5 | Gasto de cartão por **item** no mês da fatura; a linha da fatura na lista usa o **valor da fatura** | Categorias e orçamento precisam do item; a lista mostra o que se paga (`fatia-4.md` D11) | Usar o total da fatura nos totais |
| D6 | Rota nova `GET /api/controle/lista`; `GET /api/lancamentos` (fatia 2) permanece só para leitura simples | A lista mistura lançamentos e faturas e traz resumo e saldo do dia; mudar o contrato da rota da fatia 2 quebraria o que já existe | Estender `GET /api/lancamentos` |
| D7 | Porcentagens de relatório saem de `money.porcentagem` e não somam necessariamente 100,00 | Exibição; cada linha da razão exata (RF-3.09, RNF-02) | Ajustar a última linha para fechar 100 |
| D8 | Classes `aplicacao_resgate` e tipos `aplicacao`/`resgate` já tratados aqui (efeitos, projeção, filtro) | A fatia 6 só cria os lançamentos; assim não reabre serviços da 5 | Tratar na fatia 6 |
| D9 | Projeção: carregar só movimentos **não confirmados** e partir do saldo atual | Tudo confirmado já está no saldo atual (inclusive datas futuras); evita dupla contagem e iguala o mês corrente a RG-06 | Reconstruir o saldo desde o saldo inicial |

Riscos:
- **Divergência entre projeção, saldo previsto e saldo do dia**: três caminhos calculam saldo. Mitigação: todos usam a mesma tabela de efeitos (`saldos.py`) e o mesmo gancho de cartão; o teste de consistência é o mês corrente da projeção == `saldos_previstos` (CA-5.20, CA-5.24). Lançamento **confirmado com data futura** está no saldo atual mas não no saldo do fim do dia dos dias anteriores a ele; no último dia do mês pode então diferir do previsto (caso raro, aceito e registrado).
- **Leitura que escreve**: `antes_de_ler_periodo` gera recorrências e séries em `GET`; é a exceção documentada (`fatia-3.md` D5). Nenhum outro código desta fatia escreve.
- **Tempo de resposta** (CA-N.06): `carregar_mes` + `faturas.calcular` + saldos no Início somam ~10 consultas; todas indexadas por conta e data. Medir em 500 lançamentos antes de cogitar índice novo.
- **Relatório de 6 meses** chama `proporcao.proporcao_do_mes` 6 vezes; custo aceitável (cada uma é poucas consultas) e sem cache.
- **Ordem "A/B"**: `pessoas` e `donos` seguem `casal.pessoa_a_id`/`pessoa_b_id` (`comum.md` §5.2); a API só expõe `usuario_id`.
