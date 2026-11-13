# Arquitetura comum: SistemaCasal, módulo financeiro (v1)

> Vale para todas as fatias. Requisitos: `docs/requisitos.md`. O que é só de uma fatia fica em `fatia-N.md`; o que é só do front, em `front.md`. Índice: `README.md`.

## 1. Stack e decisões de base

| Decisão | Escolha | Motivo | Alternativa descartada |
|---|---|---|---|
| Framework web Python | **FastAPI** (ASGI, servido por Uvicorn) | Validação de entrada/saída por Pydantic nas bordas, tipos explícitos nos contratos, `Decimal` nativo, OpenAPI de graça para o front consultar | **Flask**: sem validação embutida (exigiria marshmallow ou similar); **Django**: ORM, admin e auth próprios pesados demais para uma API JSON com modelo e autenticação sob medida |
| Acesso a dados | **SQLAlchemy 2.x** (ORM + Core, síncrono) | Mapeamento explícito, `Numeric` com `Decimal`, consultas de agregação (`SUM`) em SQL; síncrono basta (2 usuários por casal) | ORM assíncrono (complexidade sem ganho); SQL cru (repete mapeamento) |
| Driver MySQL | **PyMySQL** (+ `cryptography` para `caching_sha2_password`) | Python puro, sem compilar `libmysqlclient`; funciona no Python 3.14 sem toolchain | `mysqlclient` (C, exige headers do sistema) |
| Migrações | **Alembic**, scripts escritos à mão (sem confiar no autogenerate às cegas) | Padrão do SQLAlchemy; cada fatia entrega suas migrações encadeadas | SQL solto sem versionamento |
| Banco | **MySQL 8.4 LTS** (imagem Docker `mysql:8.4`), `utf8mb4` | Escolha do projeto | - |
| Hash de senha | **argon2id** (`argon2-cffi`, parâmetros padrão) | Recomendação atual; sem limite de 72 bytes do bcrypt | bcrypt |
| Sessão | Cookie opaco + tabela `sessao` no banco (§7) | Logout real no aparelho, revogável, sem segredo de assinatura para guardar | JWT (sem revogação simples) |
| Front | **React + TypeScript + Vite**, SPA | Escolha do projeto; detalhes em `front.md` | Next.js (SSR não é requisito) |

## 2. Versões e pacotes

Runtimes: **Python 3.14**, **Node 26**, **MySQL 8.4**. Os números abaixo são **mínimos** (`>=` / `^`). As versões exatas ficam travadas no `frontend/package-lock.json` e no `backend/requirements.lock` (saída de `pip freeze` ou `uv pip freeze`, no git, para a instalação ser reproduzível). **Teto de versão no backend: nenhum.** Os manifestos `backend/requirements*.txt` só têm mínimos (`>=`), sem `<1` nem outro limite superior; quem trava a versão é o `requirements.lock`, e o lock já está no git. Motivo: um teto só vale na instalação sem o lock, e `<1` não protege nada em pacote 0.x (a quebra vem na faixa menor, não na maior). Alternativa descartada: teto `<1` ou de major em todos os pacotes (o manifesto vira uma segunda fonte de versão para manter, e o instalador recusaria uma versão nova sem motivo). Quando uma versão nova quebrar algo, a correção é travar no lock ou subir o mínimo. O critério vale só para o backend (§2.1 e §2.2 já listam apenas mínimos); o front tem regra própria (§2.3). No front, em pacote 0.x o `^` fixaria só a faixa menor (`^0.540` = `>=0.540.0 <0.541.0`), então o manifesto escreve a faixa aberta `>=0.540.0 <1`.

### 2.1 Backend (`backend/requirements.txt`, produção)
| Pacote | Mínimo | Uso |
|---|---|---|
| fastapi | 0.119 | API |
| uvicorn[standard] | 0.35 | servidor ASGI |
| sqlalchemy | 2.0.44 | ORM |
| alembic | 1.16 | migrações |
| pymysql | 1.1.1 | driver MySQL |
| cryptography | 46 | exigido pelo PyMySQL (auth do MySQL 8) |
| pydantic | 2.12 | schemas (primeira série com suporte ao 3.14) |
| pydantic-settings | 2.11 | leitura de variáveis de ambiente e `.env` |
| email-validator | 2.3 | `EmailStr` |
| argon2-cffi | 25.1 | hash de senha |
| tzdata | 2025.2 | fuso `America/Sao_Paulo` em ambiente sem tz do sistema |

### 2.2 Backend (`backend/requirements-dev.txt`: começa com `-r requirements.txt`)
| Pacote | Mínimo | Uso |
|---|---|---|
| ruff | 0.14 | lint (regras padrão: E, F) |
| pytest | 8.4 | testes |
| httpx2 | 2.16 | `TestClient` do FastAPI |

### 2.3 Frontend (`frontend/package.json`; `"engines": {"node": ">=26"}`, `"type": "module"`)
| Pacote | Mínimo | Tipo | Uso |
|---|---|---|---|
| react, react-dom | ^19.2 | dep | UI |
| react-router | ^7.9 | dep | rotas (modo declarativo, `BrowserRouter`) |
| @tanstack/react-query | ^5.90 | dep | estado do servidor (cache e invalidação) |
| recharts | ^3.3 | dep | rosca, área e barras (fatia 5 em diante) |
| lucide-react | >=0.540.0 <1 | dep | ícones (inclui os ícones escolhidos para categorias e metas) |
| vite | ^7.1 | dev | bundler e servidor de desenvolvimento |
| @vitejs/plugin-react | ^5.0 | dev | |
| typescript | ^5.9 | dev | |
| @types/react, @types/react-dom | ^19.2 | dev | |
| eslint, @eslint/js | ^9.36 | dev | lint (flat config) |
| typescript-eslint | ^8.45 | dev | |
| eslint-plugin-react-hooks | ^6.1 | dev | |
| globals | ^16.4 | dev | |
| vitest | ^5.0.5 | dev | testes unitários |
| jsdom | ^27 | dev | ambiente do Vitest |
| @testing-library/react, @testing-library/user-event, @testing-library/jest-dom | ^16.3, ^14.6, ^6.9 | dev | testes de componente |
| @playwright/test | ^1.56 | dev | testes de tela em viewport 360 px (os navegadores são instalados à parte, não pelo manifesto) |

`scripts` do `package.json`: `dev` = `vite`; `build` = `tsc --noEmit && vite build`; `lint` = `eslint .`; `preview` = `vite preview`; `test` = `vitest run`; `test:e2e` = `playwright test`.

Não há biblioteca de formulário, de UI pronta nem de datas/dinheiro: ver `front.md` §5 a §7 para o motivo.

## 3. Estrutura de pastas e camadas

```
SistemaCasal/
  docker-compose.yml        # só o MySQL de desenvolvimento e de teste
  docker/mysql-init/        # 01-banco-teste.sh: cria o banco <MYSQL_DATABASE>_test na primeira subida
  .env.example              # variáveis do compose; o .env real é da raiz e já é ignorado pelo git (§8)
  backend/
    requirements.txt  requirements-dev.txt  .gitignore  .env.example
    alembic.ini
    migrations/             # env.py, versions/NNNN_<slug>.py (uma ou mais por fatia)
    app/
      main.py               # cria o FastAPI, middlewares, handlers de erro, inclui routers
      config.py             # Settings (pydantic-settings)
      db.py                 # engine, SessionLocal, dependência get_db, convenção de nomes (§4); conexão com time_zone '+00:00'
      errors.py             # AppError + catálogo de códigos (§6.4)
      security.py           # hash/verify de senha, geração e hash de token de sessão (hash_token)
      money.py              # Dinheiro (tipo Pydantic), quantizar, porcentagem, formatar em string (§6.2)
      tempo.py              # relógio e datas: hoje, agora_utc, somar_meses, validar_mes, para_data_local (§3.1)
      deps.py               # get_contexto (sessão -> Contexto) e checagem de Origin
      acesso.py             # escopo por casal: consultas e verificações de pertencimento (§7.3)
      models/               # SQLAlchemy, um arquivo por domínio (usuario.py, conta.py, ...)
      schemas/              # Pydantic de entrada e saída, um arquivo por domínio
      routers/              # só HTTP: valida entrada, chama service, devolve schema
      services/             # regras de negócio e transações; sem import de FastAPI
    tests/                  # pytest; espelha app/
  frontend/
    package.json  package-lock.json  .gitignore
    tsconfig.json  vite.config.ts  eslint.config.js  index.html
    src/                    # estrutura em front.md §2
    e2e/                    # Playwright
```

**Camadas (backend):** `router -> service -> models`. Regras:
- Router: converte HTTP em chamada de service, não contém regra de negócio nem consulta SQL.
- Service: recebe `(db: Session, ctx: Contexto, dados)`, aplica as regras, controla a transação (`db.commit()` só no service, uma vez por caso de uso; erro de regra lança `AppError` e nada é gravado) e devolve objetos de modelo ou estruturas simples. Não importa FastAPI.
- Model: mapeamento e restrições; sem regra de negócio.
- Sem camada de repositório: o service consulta via `Session`, reaproveitando os helpers de `acesso.py`. Motivo: a regra de acesso é o único ponto repetido e já tem módulo próprio; um repositório por entidade seria camada sem requisito.
- Cálculos puros (saldo, porcentagem, fatura, parcelas) ficam em funções de service testáveis sem HTTP.
- **Nenhuma consulta é montada por concatenação ou formatação de texto** (`f"..."`, `%`, `+`, `.format`). Consulta é feita pelo ORM/Core; SQL cru só com `text()` e parâmetros nomeados (`:nome`). Na revisão, procurar `text(f"`, `execute(f"` e concatenação em `text(`. Motivo: injeção de SQL é o risco de segurança que o ORM só evita se for usado.

### 3.1 Módulos de base: contratos

| Módulo | Contrato |
|---|---|
| `db.py` | `get_engine()` (cria o engine na primeira chamada; importar `app.main` não abre conexão), `SessionLocal`, `get_db()`, `Base` com `MetaData(naming_convention=...)` (§4). **`create_engine(..., pool_pre_ping=True)`**: o MySQL fecha conexão ociosa após o `wait_timeout` (padrão 8 h) e, sem o teste prévio, a primeira requisição depois de uma noite parada falharia com 500 (`OperationalError`); alternativa descartada: `pool_recycle` (depende de acertar um tempo menor que o `wait_timeout` do servidor). **`create_engine(..., isolation_level="READ COMMITTED")`** (D-032): sob o padrão do InnoDB (REPEATABLE READ), o `SUM` do reajuste, lido depois do `FOR UPDATE`, usaria o instantâneo anterior à espera pelo bloqueio e deixaria de enxergar o saldo atual (t98 I2); além disso, READ COMMITTED evita o impasse entre aceites de casais distintos (t70r I3). Alternativa descartada: travar com `FOR UPDATE` a cada lançamento, que serializaria toda a escrita sem requisito que peça isso. **Risco aceito:** `criar`, `confirmar`, `editar` e `excluir` lançamento não travam a conta; um lançamento simultâneo pode cair entre a leitura do saldo e a gravação do reajuste; revisar só se os testes (§12) mostrarem necessidade. **Toda conexão abre com `SET time_zone = '+00:00'`** (`connect_args={"init_command": "SET time_zone = '+00:00'"}`), para `CURRENT_TIMESTAMP(6)` e `ON UPDATE CURRENT_TIMESTAMP(6)` gravarem UTC como §4 exige. Alternativa descartada: só os services gravarem `agora_utc()`; não alcança o `ON UPDATE` do banco. O `migrations/env.py` usa o mesmo engine |
| `security.py` | `hash_senha(senha) -> str`, `verificar_senha(senha, hash) -> bool` (com `check_needs_rehash`), **`hash_token(token) -> str`** (SHA-256 em hexadecimal, 64 caracteres), `novo_token() -> tuple[str, str]` (`(token, hash_token(token))`) |
| `money.py` | `Dinheiro`, `quantizar(valor) -> Decimal`, `para_str(valor) -> str`, **`porcentagem(parte, total) -> Decimal \| None`** (§6.2) |
| `tempo.py` | `agora_utc() -> datetime` (naive, UTC); `hoje() -> date` (em `APP_TZ`); `mes_ref(d) -> date` (dia 1); `parse_mes("AAAA-MM") -> date`; `formatar_mes(date) -> str`; `fim_do_mes(d) -> date`; **`somar_meses(d, n) -> date`** (preserva o dia, limitado ao último dia do mês: 31/01 + 1 = 28/02); **`validar_mes(mes, hoje) -> date`** (aceita de `2000-01` a `hoje + 120 meses`, devolve o dia 1; senão `AppError` `VALIDACAO` com `campos.mes`); **`para_data_local(dt) -> date`** (instante UTC naive -> data civil em `APP_TZ`). Todas puras, exceto `hoje` e `agora_utc`. Detalhe e exemplos: `fatia-1.md` §4.10 |

Contrato de `AppError`, `Settings` e `get_db`: ver §6.4, §8 e a linha de `db.py`.

## 4. Convenções do modelo físico

- **Nomes**: tabelas e colunas em `snake_case`, português sem acento, tabela no **singular** (`usuario`, `lancamento`). FK = `<entidade>_id`. Índices: `ix_<tabela>_<colunas>`; únicos: `uq_...`; FKs: `fk_...`; checks: `ck_...`. A convenção entra em `MetaData(naming_convention=...)` em `db.py` (necessário para o Alembic remover/alterar restrições). Tabela no singular: `usuario_id` lê como "id do usuário" e o nome da classe do modelo é o da tabela. Descartado: plural (`usuarios`), que combina com a rota, mas faria a coluna `usuario_id` apontar para `usuarios` e o nome do modelo divergir do da tabela.
- **Chave primária**: `id BIGINT UNSIGNED AUTO_INCREMENT`. Em JSON o id vai como número. Descartado: UUID (índice maior e sem ganho: um só banco, ids nunca são gerados fora dele).
- **Motor e charset**: InnoDB, `utf8mb4`. Colunas de texto de nome e e-mail usam collation **`utf8mb4_0900_as_ci`** (ignora maiúsculas, **não** ignora acento): é a comparação pedida em CA-1.02, RF-2.08 e RF-2.12; unicidade por nome usa índice único sobre essas colunas. Descartada: `0900_ai_ci` (trataria "Saúde" e "Saude" como iguais, o que o requisito não pede).
- **Dinheiro**: `DECIMAL(12,2)`, sempre. Nunca `FLOAT`/`DOUBLE`; em Python, `Decimal` (SQLAlchemy `Numeric(12, 2, asdecimal=True)`). Quantia positiva por padrão com `CHECK (valor > 0)` onde o requisito exige "maior que zero"; saldo inicial e ajustes podem ser negativos (cada fatia declara). Porcentagens não são gravadas (derivadas, §5.1), **com uma exceção declarada**: `orcamento.percentual_economia` (`DECIMAL(5,2)`) é a escolha da pessoa no assistente, um dado de entrada e não um valor derivável; ver `fatia-7.md` §2 e D6. Descartado para dinheiro: inteiro em centavos (`BIGINT`), que obriga a converter em todo SQL manual, migração e consulta de conferência, sem ganho sobre `DECIMAL` com `Decimal`.
- **Datas**: data civil (`data` do lançamento, vencimentos) = `DATE`. Instantes (`criado_em`, `atualizado_em`, `expira_em`) = `DATETIME(6)` em **UTC** (a conexão fixa `time_zone = '+00:00'`, §3.1). Mês de referência (orçamento, fatura) = `DATE` com dia 1 (`mes_ref`); no JSON vira `"AAAA-MM"`. "Hoje" é calculado no servidor no fuso `APP_TZ` (§8), nunca pelo relógio do navegador. Descartados: `TIMESTAMP` (limite em 2038 e conversão implícita de fuso) e gravar hora local (ambígua na troca de horário e se o fuso mudar).
- **Enumerações**: `VARCHAR(20)` com `CHECK (col IN (...))`, mapeado a `enum.Enum` do Python (`native_enum=False`). Valores em minúsculas sem acento (`confirmada`, `prevista`, `despesa`). Descartado: `ENUM` nativo do MySQL (alterar valores exige migração que reescreve a tabela).
- **Booleanos**: `TINYINT(1)` (`arquivado`, `ativo`). Descartado: `BIT(1)` (o driver devolve `bytes`; ferramentas de consulta mostram mal).
- **Exclusão**: FKs com `ON DELETE RESTRICT` (padrão). Entidades que o requisito manda arquivar usam `arquivado`; exclusão física só onde o requisito a permite (tag, lançamento, orçamento, cenário, meta sem movimentos). Descartada: exclusão lógica (`excluido_em`) em tudo, que exigiria o filtro em toda consulta (esquecer vira dado "apagado" aparecendo) sem requisito de recuperar.
- **Auditoria mínima** em tabelas de negócio: `criado_em`, `atualizado_em` (default `CURRENT_TIMESTAMP(6)` e `ON UPDATE`). `lancamento` ainda tem `criado_por_id` (RF-2.23).
- **Migrações**: uma revisão Alembic por mudança de banco, arquivo `NNNN_<slug>.py` (`file_template` em `alembic.ini`). A revisão nasce com `alembic revision --rev-id NNNN -m <slug>` (gera `NNNN_<slug>.py` com `revision = "NNNN"`, sem abrir banco) ou é escrita à mão com o mesmo nome e id. Toda revisão tem `upgrade()` e `downgrade()` completos. Nunca editar migração já integrada: nova revisão. Cada fatia lista as suas em `fatia-N.md`.
- **Saldos não são gravados**: saldo atual, previsto, valor da fatura, valor atual da meta e porcentagem do mês são **calculados** por consulta a partir dos movimentos. Motivo: evita divergência após editar/excluir/confirmar (RF-2.19), o volume previsto (RNF-07: 500 lançamentos/mês) permite `SUM` indexado. Alternativa descartada: coluna de saldo mantida por gatilho ou por service (exige recálculo em toda mutação). Índice mínimo para isso: `lancamento (conta_id, data)`.

## 5. Visão geral do modelo de dados (sem DDL)

As fatias detalham colunas, restrições e migrações. Aqui só entidades e relações, para as fatias não divergirem.

### 5.1 Entidades por fatia

| Fatia | Entidades | Relações principais |
|---|---|---|
| 1 | `usuario` (nome, e-mail, hash, tema) · `sessao` · `casal` (pessoa A, pessoa B, criado, encerrado_em) · `convite` (convidante, e-mail convidado, estado) | `casal.pessoa_a_id`, `casal.pessoa_b_id` -> `usuario`; `convite.convidante_id` -> `usuario` |
| 2 | `conta` · `categoria` (2 níveis: auto-relação `categoria_pai_id`; tipo despesa/receita) · `tag` · `lancamento` (tipos despesa, receita, transferência, reajuste; as fatias 6 e 4 acrescentam tipos/ligações) · `lancamento_tag` | `lancamento.conta_id` -> `conta` (e `conta_destino_id` na transferência); `lancamento.categoria_id` -> `categoria`; `lancamento.dono_usuario_id` (nulo = casal); `lancamento.criado_por_id` -> `usuario` |
| 3 | `recorrencia` (regra: periodicidade mensal, primeira data, fim) e a ligação `lancamento.recorrencia_id` | uma recorrência tem N lançamentos (ocorrências); a decisão de materializar ocorrências é da fatia 3 |
| 4 | `cartao` · `fatura` · `serie_cartao` (parceladas e recorrentes) · `item_fatura` (compra, parcela, ocorrência, estorno, ajuste; **não** é `lancamento`) · `item_fatura_tag`. O **pagamento da fatura** não tem tabela: é um `lancamento` com `tipo = 'pagamento_fatura'` | `cartao.conta_id` -> `conta` (conta dona); `fatura.cartao_id`; `item_fatura.fatura_id` e `.serie_id`; o pagamento liga o `lancamento` à `fatura` (`fatia-4.md` §2.3) |
| 5 | **nenhuma tabela nova** (balanço, lista, início, projeção e relatórios são consultas) | |
| 6 | `meta` · `meta_rendimento` · aplicação/resgate como `lancamento` com `meta_id` | `meta.casal_id`; `lancamento.meta_id` |
| 7 | `orcamento` · `orcamento_item` · `cenario` · `cenario_item` (o plano de metas não tem tabela: é só calculado, `fatia-7.md` §2) | `orcamento` e `cenario` com `casal_id` (os itens herdam pelo pai); sem FK para `lancamento`, `conta`, `cartao`, `fatura` ou `meta` por escrita (RF-7.01); leitura do real é por consulta |

### 5.2 Propriedade e visibilidade (decisão estrutural)

Antes do vínculo a pessoa já tem conta, categorias, tags e lançamentos (RF-2.01, RF-2.08, RF-2.12); depois do vínculo parte disso é do casal. Por isso:

- Cada linha de **conta**, **categoria** e **tag** pertence a uma pessoa **ou** a um casal: colunas `usuario_id` e `casal_id`, exatamente uma preenchida (`CHECK`).
  - Conta individual: `usuario_id` (acompanha a pessoa em qualquer vínculo). Conta conjunta: `casal_id` (nasce no vínculo; fica no casal encerrado, arquivada, RF-1.10).
  - Categoria e tag: pessoa antes do vínculo; casal enquanto vinculado. A união (RF-2.08, RF-2.12) e a cópia no desvínculo (RF-1.10, D-026) são operações transacionais da fatia 2, que reaponta `categoria_id` dos lançamentos afetados.
- `lancamento` **não** tem dono de acesso próprio: a visibilidade dele deriva das contas das pontas (origem e, na transferência, destino), pela regra única de §7.3 (legível se **uma** ponta é visível; gravável só se **as duas** são). Compra de cartão herda da conta dona do cartão.
- `meta`, `orcamento`, `cenario`: `casal_id`; `cartao` herda via `conta`; o plano de metas não é gravado (`fatia-7.md` §2). Metas de casal encerrado ficam legíveis (RF-6.14).
- **A e B**: `casal.pessoa_a_id` é quem enviou o convite aceito, `pessoa_b_id` quem aceitou (D-026; consequências: a união de listas fica com a grafia, a cor e o ícone de A, RF-2.08, e o desempate do centavo, RF-3.15). A API nunca expõe "A/B" como identificador estável: expõe `usuario_id`; o front rotula "A"/"B" só quando o requisito pede, pela posição no casal.
- **Dono do lançamento**: `dono_usuario_id` (nulo = casal). Vale RG-04, validada no service: dono nulo exige conta conjunta do casal ativo; dono pessoa exige a conta individual dela.
- **Casal ativo**: `casal.encerrado_em IS NULL`. Uma pessoa tem no máximo um casal ativo (garantido no service com bloqueio de linha de `usuario` na criação do vínculo; MySQL não tem índice único parcial).

## 6. Convenções da API

### 6.1 Geral
- Prefixo **`/api`** (sem número de versão: há um só consumidor, o próprio front; versionar seria camada sem requisito). JSON UTF-8 em requisição e resposta.
- Recursos no plural em português, `kebab-case` (`/api/contas`, `/api/lancamentos`, `/api/metas/{id}/aplicacoes`). Verbos HTTP: `GET` lê, `POST` cria ou executa ação nomeada (`POST /api/lancamentos/{id}/confirmar`), `PATCH` altera parcial, `DELETE` exclui.
- Respostas de sucesso sem envelope: objeto ou array. Sem paginação na v1 (mês com até 500 lançamentos, RNF-07); consultas por mês usam `?mes=AAAA-MM`.
- Datas: `"AAAA-MM-DD"`; mês: `"AAAA-MM"`; instantes: ISO 8601 UTC com `Z`. Ids: número.
- Toda resposta de `/api` leva `Cache-Control: no-store` (CA-1.05: o botão voltar após logout não pode mostrar dado).
- Cabeçalhos de segurança: toda resposta do backend leva `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy: same-origin` (middleware em `main.py`). `Content-Security-Policy` e `Strict-Transport-Security` pertencem ao proxy reverso de produção, que não faz parte do repositório: ficam como risco registrado em §13 e o proxy deve aplicá-los (CSP mínima `default-src 'self'`).
- Tudo sob `/api` exige sessão (§7), exceto `POST /api/cadastro`, `POST /api/sessao` (login) e `GET /api/saude`.
- Cada rota de fatia declara: método e caminho, entrada, saída, erros (códigos do §6.4) e RF/CA que cobre.

### 6.2 Dinheiro e porcentagem no JSON (sem float)
- Dinheiro trafega como **string decimal com ponto e 2 casas**: `"1234.50"`, `"-50.00"`. Entrada aceita `^-?\d{1,10}(\.\d{1,2})?$`; **número JSON é recusado** (`VALIDACAO`), para que nenhum `float` entre no sistema. Saída sempre com exatamente 2 casas.
- Porcentagem: string com 2 casas (`"62.50"`, sem `%`), calculada da razão exata e só então arredondada para exibição/serialização (RF-3.09).
- Implementação em `app/money.py`: tipo `Dinheiro` (Pydantic `Annotated[Decimal, ...]` com validador que rejeita `float`/`int` e converte `str`), `quantizar(valor)` (`ROUND_HALF_UP`, centavo), `para_str(valor)` e **`porcentagem(parte, total) -> Decimal | None`** (usada pelas fatias 3 a 7): razão exata em centavos inteiros, `ROUND_HALF_UP` em 2 casas de percentual, `None` se `total == 0` (quem usa decide o que mostrar; ex.: `"0.00"` no relatório). Exemplo: 1.500,00 de 5.000,00 -> `Decimal("30.00")`. Arredondamentos que o requisito define de outro modo (parcelas para baixo, RF-4.09) usam o modo explícito na própria função. Somas de dinheiro são feitas em SQL (`SUM` de `DECIMAL`) ou em `Decimal`; o front **não soma** dinheiro (`front.md` §7).
- Faixa: `DECIMAL(12,2)` (até 9.999.999.999,99); acima disso, `VALIDACAO`.

### 6.3 Autorização na API
Ver §7.3. Id de recurso de outro casal responde `404 NAO_ENCONTRADO`, igual a um id inexistente.

### 6.4 Erros e códigos
Formato único:
```
{ "erro": { "codigo": "EMAIL_JA_CADASTRADO", "mensagem": "Este e-mail já está cadastrado.", "campos": { "email": "Este e-mail já está cadastrado." } } }
```
- `mensagem`: português, diz o que corrigir (RNF-09). `campos` (opcional): mapa nome do campo -> mensagem, para o front mostrar junto ao campo; nome do campo igual ao do corpo da requisição (`dono_usuario_id`, `valor`, ...).
- Mapeamento de status (todos os handlers em `main.py`, a partir de `AppError(status, codigo, mensagem, campos=None)`):

| Status | Quando | Códigos comuns |
|---|---|---|
| 401 | sem sessão válida; login inválido | `NAO_AUTENTICADO`, `CREDENCIAIS_INVALIDAS` (mesma mensagem para e-mail inexistente e senha errada, RF-1.04) |
| 404 | recurso inexistente **ou de outro casal** | `NAO_ENCONTRADO` |
| 409 | regra de negócio ou estado impede a ação | um código por regra, definido na fatia (ex.: `CONTA_ARQUIVADA`, `FATURA_PAGA`, `EMAIL_JA_CADASTRADO`) |
| 422 | entrada inválida (tipo, faixa, obrigatório, formato) | `VALIDACAO` (com `campos`); erros do Pydantic são convertidos para este formato |
| 403 | falha na checagem de `Origin` (§7.4) | `ORIGEM_INVALIDA` |
| 405 | método não permitido na rota (erro de programação do cliente) | `METODO_NAO_PERMITIDO` (constante nova em `errors.py`) |
| 500 | falha inesperada | `ERRO_INTERNO`, mensagem genérica; detalhe só no log, nunca no corpo |

- **Erros do Pydantic (`RequestValidationError`) em `main.py`**:
  - Tradução **por `type`** do erro, usando `ctx` quando houver, para frase em português que diz o que corrigir, sem ecoar o valor recebido (nem `input`, nem `ctx` que o contenha). As mensagens são as de `main.py` (`_MENSAGENS_FIXAS` e `_mensagem_pydantic`):
    - fixas: `missing` "Campo obrigatório."; `string_type` "Informe um texto."; `string_pattern_mismatch` "Formato inválido."; `int_type`/`int_parsing` "Informe um número inteiro."; `decimal_type`/`decimal_parsing`/`float_parsing` "Informe um número."; `date_type`/`date_parsing`/`date_from_datetime_parsing` "Informe uma data no formato AAAA-MM-DD."; `datetime_type`/`datetime_parsing` "Informe data e hora no formato AAAA-MM-DDTHH:MM:SS."; `bool_type`/`bool_parsing` "Informe verdadeiro ou falso.";
    - com `ctx`: `string_too_short` "Use pelo menos {min_length} caracteres."; `string_too_long` "Use no máximo {max_length} caracteres."; `too_short` "Informe pelo menos {min_length} itens."; `too_long` "Informe no máximo {max_length} itens."; `greater_than` "Informe um valor maior que {gt}."; `greater_than_equal` "Informe um valor maior ou igual a {ge}."; `less_than` "Informe um valor menor que {lt}."; `less_than_equal` "Informe um valor menor ou igual a {le}.";
    - `enum`/`literal_error`: "Valor não permitido." (não lista as opções nem ecoa o valor);
    - `value_error`: com `ctx.reason` (hoje só o `email-validator` usa `reason`) "Informe um e-mail válido, como nome@exemplo.com."; com `ctx.error`, o texto do próprio erro do validador (quem escreve um validador com `ValueError` escreve a mensagem em português e sem o valor recebido);
    - tipo fora da lista: "Valor inválido." (**último recurso**). Alternativa descartada: validadores com mensagem própria em cada schema (espalha texto por todas as fatias).
  - Chave de `campos`: `loc` sem o primeiro elemento (`body`, `query`, `path`), elementos unidos por ponto (`itens.0.valor`).
  - **JSON malformado** (`type == "json_invalid"`, em que `loc[1]` é posição numérica): vai em `campos.corpo`, mensagem "O corpo da requisição não é um JSON válido."; o código segue `VALIDACAO` (422).
- **404 e 405 do framework** (rota ou método inexistente em `/api`, `StarletteHTTPException`): handler em `main.py` que devolve o formato único. 404 -> `NAO_ENCONTRADO` ("Recurso não encontrado."); 405 -> `METODO_NAO_PERMITIDO` ("Método não permitido."), preservando o cabeçalho `Allow` do framework; qualquer outro status que o framework levante (regra explícita) mantém o status original com código `ERRO_HTTP` (constante nova em `errors.py`) e mensagem genérica "Requisição não atendida.". Nunca `{"detail": ...}`. O `detail` do framework não vai no corpo.
- Códigos em `MAIÚSCULAS_COM_SUBLINHADO`, definidos como constantes em `errors.py`; cada fatia acrescenta os seus no próprio `fatia-N.md` (§"Códigos de erro") e no `errors.py`. Código nunca é reaproveitado com outro sentido.
- Validação em duas camadas: formato e faixa no schema Pydantic (422); regra que depende de estado no service (409). Nenhuma mensagem de erro inclui senha, hash, token ou id de outro casal.

## 7. Sessão, autenticação e autorização

### 7.1 Cadastro e login (RF-1.01 a RF-1.05, RNF-04)
- E-mail e senha. E-mail normalizado em minúsculas e sem espaços nas pontas antes de gravar e comparar; unicidade garantida por índice único (collation `as_ci`, §4), não só pelo service. Senha: mínimo 8, máximo 128 caracteres, qualquer caractere.
- Hash: `argon2id` (`security.py`: `hash_senha`, `verificar_senha`, com `check_needs_rehash`). Hash fica só em `usuario.senha_hash`; nenhum schema de saída contém a senha ou o hash.
- Login inexistente e senha errada: mesma resposta e, para igualar o tempo, `verificar_senha` roda contra um hash fixo quando o e-mail não existe.

### 7.2 Sessão
- Tabela `sessao` (fatia 1): `id`, `usuario_id`, `token_hash CHAR(64)` (SHA-256 do token), `criado_em`, `expira_em`, `ultimo_uso_em`.
- Token: `secrets.token_urlsafe(32)`, entregue em cookie `sid`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` conforme `COOKIE_SECURE`, duração `SESSAO_DIAS` (padrão 30). O token em claro nunca é gravado.
- Logout (`DELETE /api/sessao`) apaga só a linha da sessão do aparelho (RF-1.05).
- **`GET /api/sessao`** (contrato único; usado pelo front como guarda de rota e fonte de `hoje`, tema e casal; implementação em `fatia-1.md` §3.1):
  - **Com sessão válida**, `200`:
    ```
    { "usuario": { "id": 1, "nome": "Ana", "email": "ana@x.com", "tema": "claro" | "escuro" },
      "hoje": "2026-10-29",
      "casal": null | { "id": 3, "parceiro": { "id": 2, "nome": "Bia" } } }
    ```
    `hoje` = data civil do servidor em `APP_TZ` (nunca o relógio do aparelho). `casal` = casal **ativo** (`null` sem vínculo ou com casal encerrado). Nenhum campo de senha ou hash.
  - **Sem sessão** (cookie ausente, token desconhecido ou expirado), `401` com o corpo de erro de §6.4 e `codigo = NAO_AUTENTICADO`; sem `Set-Cookie`.
- Sessão expirada é tratada como ausente e a linha é removida na consulta.

### 7.3 Autorização: cada pessoa só acessa o próprio casal (RNF-06)
`deps.get_contexto` resolve a sessão em um **`Contexto`** imutável:
```
Contexto(usuario_id: int, casal_ativo_id: int | None, parceiro_id: int | None, casais_ids: frozenset[int])
```
`casais_ids` = casal ativo + casais encerrados de que a pessoa participou (para ler a conjunta arquivada e metas, RF-1.10, RF-6.14).

Regra de visibilidade (única; implementada em `acesso.py`, nenhum service escreve sua própria):
| Recurso | Visível se |
|---|---|
| conta individual | `usuario_id` é o do contexto **ou** é o `parceiro_id` (casal ativo) |
| conta conjunta | `casal_id` está em `casais_ids` |
| lançamento e recorrência (inclusive transferência) | **legível** se a conta de origem **ou** a de destino é visível; **gravável** só se **as duas** são (regra completa abaixo) |
| compra de cartão (`item_fatura`, `serie_cartao`), fatura, cartão | a conta dona do cartão é visível (não há segunda ponta) |
| categoria, tag | `usuario_id` é o do contexto, ou `casal_id` é o `casal_ativo_id` |
| meta, orçamento, cenário, plano | `casal_id` está em `casais_ids` (escrita só no `casal_ativo_id`) |

**Regra única do lançamento e da recorrência** (vale para `fatia-2.md` §4.2/§4.6, `fatia-3.md` §4.3 e demais; nenhuma fatia a reescreve). "Ponta" = conta de origem (`conta_id`) e, só na transferência, conta de destino (`conta_destino_id`). Uma ponta é *visível* pela linha `conta` desta tabela.
1. **Ler** (listar, detalhe, saldos, balanço): o lançamento aparece se **ao menos uma** ponta é visível. Id direto com nenhuma ponta visível: `404 NAO_ENCONTRADO`. Na saída, a conta de uma ponta **não visível** vem só como `id`, com `nome = null` (não revela dados da outra pessoa, RF-1.10).
2. **Gravar** (criar, editar, excluir, confirmar, alterar alcance de recorrência): só se **as duas** pontas são visíveis ao contexto. Com uma ponta invisível o lançamento é **somente leitura**: `409 LANCAMENTO_SOMENTE_LEITURA` (código novo, listado em `fatia-2.md` §3.5). Isso inclui a recorrência que gerou o lançamento.
3. **Geração** (`recorrencias.garantir_ate`, fatia 3): ignora recorrência com ponta não visível ao contexto que lê, e ignora recorrência já encerrada (item abaixo). Ocorrência nunca é gerada em nome de quem não vê as duas pontas.
4. **Desvínculo** (`ganchos.ao_desvincular`, decisão confirmada pelo usuário, D-036): transferência e recorrência entre a individual de A e a individual de B passam, pela regra 2, a somente leitura para as duas pessoas, e então: (a) as **recorrências cruzadas são encerradas** (a última ocorrência já gerada vira a final) e as ocorrências ainda **previstas** dessas recorrências e as **transferências previstas avulsas** entre as duas individuais são **apagadas**; (b) as transferências **confirmadas** permanecem como histórico, legível por quem vê uma ponta e imutável, e continuam compondo o saldo das duas contas (o dinheiro de fato se moveu). A implementação é da fatia 3 (estende `ao_desvincular`, encontrando as contas pelo `usuario_id` das duas pessoas, sem `Contexto`). Alternativas descartadas: manter as recorrências ativas (moveria o saldo da outra pessoa depois do desvínculo); apagar também as confirmadas (muda saldos já realizados); converter a transferência em despesa/receita (inventa dado que a pessoa não lançou).

Contrato de `acesso.py`: funções `conta_visivel(db, ctx, conta_id) -> Conta`, `lancamento_visivel(db, ctx, lancamento_id) -> Lancamento` (= *legível*, regra 1, lança 404) e `lancamento_gravavel(db, ctx, lancamento_id) -> Lancamento` (regra 2, lança 404 ou `LANCAMENTO_SOMENTE_LEITURA`; as rotas de escrita usam esta), etc., que **lançam `AppError`**; e filtros `filtro_contas(ctx)` e `filtro_lancamentos(ctx)` (`conta_id` **ou** `conta_destino_id` em contas visíveis) para listagens. Todo router de dados depende de `get_contexto`; todo service busca recursos por esses helpers. Escrita em recurso de casal encerrado ou de conta arquivada é recusada pelo service (`CONTA_ARQUIVADA` e similares), não pelo acesso.
Motivo de 404 e não 403: não revelar a existência do id (CA-N.05). Descartada: filtrar por `casal_id` em cada query à mão (esquecimento vira vazamento).

### 7.4 CSRF e origem
O front e a API são servidos na mesma origem (proxy do Vite em dev, proxy reverso em produção): sem CORS. Defesa: cookie `SameSite=Lax`, corpo sempre JSON e, em métodos que alteram (POST, PATCH, PUT, DELETE), se o cabeçalho `Origin` vier presente ele deve estar em `ORIGENS_PERMITIDAS` (senão `403 ORIGEM_INVALIDA`); middleware em `deps.py`/`main.py`.

## 8. Configuração

Toda configuração vem de variável de ambiente, lida por `config.py` (pydantic-settings), com leitura opcional de `backend/.env` (**fora do git**; `.gitignore` de `backend/` lista `.env`). `backend/.env.example` (no git) traz as chaves com valores de exemplo, sem segredo real. Falta de variável obrigatória derruba o start com mensagem clara. Nenhum segredo em código, compose versionado ou log.

| Variável | Obrigatória | Padrão | Significado |
|---|---|---|---|
| `DATABASE_URL` | sim | - | `mysql+pymysql://usuario:senha@host:3306/banco?charset=utf8mb4` |
| `APP_ENV` | não | **`prod`** | `dev` ou `prod` (em `prod`, `COOKIE_SECURE` padrão verdadeiro e docs OpenAPI desligadas). O padrão é o seguro: se a variável faltar em produção, nada fica exposto. O `backend/.env.example` traz `APP_ENV=dev` para o desenvolvimento. Alternativa descartada: padrão `dev` (cookie sem `Secure` e docs ligadas se a variável for esquecida) |
| `APP_TZ` | não | `America/Sao_Paulo` | fuso do "hoje" do servidor |
| `SESSAO_DIAS` | não | `30` | duração da sessão |
| `COOKIE_SECURE` | não | verdadeiro em `prod`, falso em `dev` | cookie `Secure` |
| `ORIGENS_PERMITIDAS` | não | `http://localhost:5173` | lista separada por vírgula (§7.4) |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | só para o compose | - | lidos pelo `docker-compose.yml` a partir do `.env` da raiz (modelo em `.env.example` da raiz) |
| `MYSQL_PORTA` | só para o compose | `3306` | porta do host publicada pelo MySQL (sempre em 127.0.0.1); mude se a 3306 estiver ocupada |

**`.env` da raiz**: o `.gitignore` da raiz já lista `.env`. O `.env` do backend é coberto por `backend/.gitignore`.

**Banco de teste** (§12): o `docker-compose.yml` monta `docker/mysql-init/01-banco-teste.sh` em `/docker-entrypoint-initdb.d/`; o script cria `<MYSQL_DATABASE>_test` e dá a `MYSQL_USER` todos os privilégios nele. O MySQL só executa esses scripts quando o volume está vazio: em um volume já existente, recriar (`docker compose down -v`, apaga os dados de desenvolvimento) ou criar o banco à mão.

Front: sem variável de ambiente na v1 (chamadas relativas a `/api`, proxy em `vite.config.ts`).

## 9. Validação bruta e execução

"Bruta" = checa código sem testes e sem banco. Os comandos **não percorrem `node_modules/` nem `.venv/`** (ESLint ignora `node_modules` por padrão e `dist` entra no `eslint.config.js`; Ruff respeita `.gitignore` e exclui `.venv`; a compilação lista arquivos pelo Git, que não vê pastas ignoradas). Rodam com `cd` na pasta, na mesma linha.

| Pasta | Comando de validação bruta |
|---|---|
| `frontend/` | `npm run build && npm run lint` |
| `backend/` | `.venv/bin/ruff check . && git ls-files --cached --others --exclude-standard -z -- '*.py' \| xargs -0 -r .venv/bin/python -m py_compile && DATABASE_URL=mysql+pymysql://u:p@localhost:3306/x .venv/bin/python -c "from app.main import app"` |

O último passo do backend (importar `app.main`) usa uma `DATABASE_URL` de mentira, só para `Settings` (§8) validar na importação; ela não abre conexão com o banco (§3.1) e não é segredo. O passo acusa erro de importação que o `py_compile` não vê (módulo ou nome inexistente).

A validação bruta não sobe o MySQL nem roda testes. O que precisa do banco ou de executar o sistema (`alembic upgrade/downgrade`, `CHECK` e `UNIQUE` recusando linha, rotas respondendo, telas a 360 px) é coberto pelos testes (§12). Rotas se conferem em `app.openapi()['paths']`, não em `app.routes`: nesta versão do FastAPI, `app.routes` agrupa os roteadores incluídos (`_IncludedRouter` não tem `path`).

**Subir cada aplicação** (desenvolvimento):
| Item | Comando |
|---|---|
| MySQL | `docker compose up -d db` (raiz) |
| Migrações | `cd backend && .venv/bin/alembic upgrade head` |
| Backend (porta 8000) | `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000` |
| Frontend (porta 5173, proxy `/api` -> 8000) | `cd frontend && npm run dev` |
Instalação: `cd backend && python3.14 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`; `cd frontend && npm install`. Se faltar `python3.14-venv`, alternativa: `cd backend && uv venv --python 3.14 .venv && uv pip install --python .venv/bin/python -r requirements-dev.txt -c requirements.lock` (o venv do `uv` não tem `pip`).

## 12. Estratégia de testes
- **Backend**: pytest + `TestClient`, contra **MySQL real** (banco `<MYSQL_DATABASE>_test` no mesmo compose, criado pelo script de `docker/mysql-init`, §8), não SQLite (collation `as_ci`, `DECIMAL` e `CHECK` precisam do motor real). Migrações aplicadas uma vez por sessão de testes (`alembic upgrade head`); cada teste roda em transação externa com `SAVEPOINT` desfeita no fim. Fixture cria dois casais para os casos de isolamento (CA-N.05, CA-2.22). Funções de cálculo (saldo, porcentagem, parcelas, fatura) têm teste unitário puro.
- **Front**: Vitest + Testing Library para formatação (`formatarBRL`, datas), formulários e estados; Playwright em viewport 360x740 para CA-0.01 a CA-0.08 e CA-N.01 (rolagem horizontal, alvos de 44 px) e CA-N.06 (rede 4G simulada).
- Cada CA do requisito vira ao menos um caso de teste.

## 13. Riscos gerais
| Risco | Mitigação |
|---|---|
| Versões mínimas não verificadas no Python 3.14 / Node 26 (rodas de `cryptography`, `pydantic-core`, `argon2-cffi`; plugin do Vite) | Elevar o mínimo se o instalador recusar; o lock trava a versão que funcionou |
| Vazamento entre casais por esquecer o filtro | Visibilidade só em `acesso.py` (§7.3); teste de isolamento por rota (CA-N.05) |
| `float` entrando em dinheiro (JSON ou cálculo) | `Dinheiro` recusa número JSON; a revisão procura `float(` no backend e `Number(`/`parseFloat(` no front em caminho de dinheiro, **exceto** o arquivo único de conversão do gráfico (`front.md` §7), que é a exceção declarada |
| União e cópia de categorias/tags no vínculo/desvínculo (fatia 2) | Uma transação por operação; teste CA-2.23 |
| `SUM` de saldo lento com crescimento | Índice `lancamento (conta_id, data)`; medir em CA-N.06 |
| Recorrência sem fim exige ocorrências em meses futuros | Decisão da fatia 3 (materialização sob demanda ao consultar o mês); limitar horizonte de consulta |
| Divergência entre `A`/`B` e `usuario_id` ao desvincular/revincular | `A`/`B` só existe como posição no `casal`; API usa `usuario_id` (§5.2) |
| Sem limite de tentativas de login | Fora dos requisitos da v1; fica como melhoria futura |
| CSP e HSTS dependem do proxy reverso de produção, fora do repositório | O backend envia só `nosniff`, `X-Frame-Options` e `Referrer-Policy` (§6.1); o proxy deve aplicar CSP `default-src 'self'` e HSTS |
| Fuso: "hoje" e atraso (RG-05) dependem do fuso | Só o servidor calcula, com `APP_TZ` (§4) |

## 14. Cobertura dos requisitos transversais e não funcionais

| Requisito | Onde é atendido |
|---|---|
| RF-0.01 a RF-0.10, RNF-01, RNF-08, RNF-09 (exibição), RNF-10 | `front.md` (§3 a §8) |
| RNF-02 | `money.py`, §4 (`DECIMAL`), §6.2 |
| RNF-03 | sem campo de moeda em schema ou tela; `formatarBRL` fixo |
| RNF-04 | §7.1 (hash; schemas sem senha) |
| RNF-05 | §6.1 (sessão exigida), §7.2, guarda de rota em `front.md` §4 |
| RNF-06 | §5.2, §7.3 |
| RNF-07 | §4 (saldo derivado e índice), §12 |
