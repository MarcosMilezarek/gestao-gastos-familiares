# Gestão de Gastos Familiares

Sistema web, pensado primeiro para o celular, para um casal controlar as finanças do presente e planejar a vida a dois.

## Problema que resolve

Um casal costuma ter três bolsos: a conta individual de cada um e uma conta conjunta. Fica difícil saber quanto cada pessoa deve colocar na conta conjunta, quanto já colocou, como está a fatura do cartão e se as metas estão andando. Este sistema junta tudo isso num lugar só. As despesas do casal são divididas de forma proporcional à renda de cada pessoa.

## Funcionalidades

- **Cadastro, login e vínculo do casal:** cada pessoa tem o próprio cadastro (e-mail e senha) e convida a outra para formar o casal. Também é possível desvincular.
- **Contas:** individuais e conjunta, com saldo atual e previsto, e opção de arquivar.
- **Lançamentos:** despesas, receitas e transferências, com categorias e subcategorias, tags livres, observação e situação prevista ou confirmada.
- **Recorrências:** lançamentos mensais. Ao editar ou excluir, escolhe-se o alcance: somente este, este e os pendentes, ou todos.
- **Proporção e aporte:** porcentagem de cada pessoa no mês, calculada pela renda, e quanto cada uma deve, já aportou ou ainda falta aportar na conta conjunta.
- **Cartão de crédito:** compras à vista, parceladas e recorrentes, estorno, ajuste e pagamento da fatura, além do limite disponível.
- **Controle do mês:** lista de lançamentos com filtros, balanço por conta e por dono, e relatórios com gráficos.
- **Início e projeção:** tela inicial com resumo do mês e projeção de saldo.
- **Metas e patrimônio:** metas do casal com aplicações, resgates e rendimentos.
- **Planejamento:** orçamento por categoria comparado com o real, cenários e plano de metas. O planejamento é separado do controle e não altera lançamentos.
- **Tema claro e escuro.**

O detalhamento das regras está em [`docs/requisitos.md`](docs/requisitos.md) e as decisões de arquitetura em [`docs/arquitetura/`](docs/arquitetura/README.md).

## Stack

| Camada | Tecnologias |
|---|---|
| Backend | Python 3.14, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Pydantic 2.14, PyMySQL 1.2, Argon2 (hash de senha), Uvicorn 0.54 |
| Frontend | React 19.3, TypeScript 5.9, Vite 7.3, React Router 7.18, TanStack Query 5.105, Recharts 3.10, Lucide |
| Banco | MySQL 8.4 (via Docker Compose) |
| Testes | pytest 9.2 (contra MySQL real), Vitest 5.0 e Testing Library |
| Qualidade | Ruff (backend), ESLint (frontend) |

As versões exatas ficam em `backend/requirements.lock` e `frontend/package-lock.json`.

## Como rodar

### Pré-requisitos

- Python 3.14
- Node 26 e npm
- Docker com Docker Compose
- [uv](https://docs.astral.sh/uv/) (opcional, só se faltar o módulo `venv` do Python)

### 1. Variáveis de ambiente

Na raiz, o `.env` é usado pelo Docker Compose para criar o banco:

```bash
cp .env.example .env
```

Troque as senhas de exemplo. Se a porta 3306 já estiver ocupada, defina `MYSQL_PORTA` com outra porta.

No backend, o `.env` é lido pela aplicação:

```bash
cp backend/.env.example backend/.env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | `mysql+pymysql://<MYSQL_USER>:<MYSQL_PASSWORD>@127.0.0.1:<MYSQL_PORTA>/<MYSQL_DATABASE>?charset=utf8mb4`, com os mesmos valores do `.env` da raiz |
| `APP_ENV` | não | `dev` ou `prod` (padrão `prod`; use `dev` localmente) |
| `APP_TZ` | não | fuso usado para "hoje" e vencimentos (padrão `America/Sao_Paulo`) |
| `SESSAO_DIAS` | não | validade da sessão em dias (padrão 30) |
| `COOKIE_SECURE` | não | cookie só em HTTPS; segue `APP_ENV` se ausente |
| `ORIGENS_PERMITIDAS` | não | origens aceitas, separadas por vírgula (padrão `http://localhost:5173`) |

### 2. Banco de dados

```bash
docker compose up -d db
```

Na primeira subida, o script `docker/mysql-init/01-banco-teste.sh` também cria o banco `<MYSQL_DATABASE>_test`, usado pelos testes.

### 3. Backend (porta 8000)

```bash
cd backend
python3.14 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt -c requirements.lock
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Se o `python3.14 -m venv` falhar por falta do `ensurepip`, crie o ambiente com o uv:

```bash
cd backend
uv venv --python 3.14 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt -c requirements.lock
```

Para conferir se subiu: `curl http://localhost:8000/api/saude` deve responder `{"status":"ok"}`.

### 4. Frontend (porta 5173)

```bash
cd frontend
npm ci
npm run dev
```

Acesse http://localhost:5173. O Vite repassa as chamadas de `/api` para o backend na porta 8000.

## Testes

Backend: os testes rodam contra o MySQL real, no banco terminado em `_test`. Com o banco no ar:

```bash
cd backend
export DATABASE_URL="mysql+pymysql://<MYSQL_USER>:<MYSQL_PASSWORD>@127.0.0.1:<MYSQL_PORTA>/<MYSQL_DATABASE>_test?charset=utf8mb4"
.venv/bin/pytest
.venv/bin/pytest -m migracoes
```

Os testes de migração derrubam e recriam o esquema, por isso rodam numa execução separada.

Frontend:

```bash
cd frontend
npm test
```

Validação estática:

```bash
cd backend && .venv/bin/ruff check .
cd frontend && npm run build && npm run lint
```

## Estrutura de pastas

```
.
├── backend/
│   ├── app/
│   │   ├── models/        # modelos SQLAlchemy
│   │   ├── schemas/       # entrada e saída da API (Pydantic)
│   │   ├── services/      # regras de negócio
│   │   ├── routers/       # rotas FastAPI
│   │   ├── acesso.py      # visibilidade: cada pessoa só acessa o próprio casal
│   │   ├── money.py       # dinheiro em Decimal, sem float
│   │   └── main.py
│   ├── migrations/        # Alembic
│   └── tests/             # pytest
├── frontend/
│   └── src/
│       ├── api/           # cliente HTTP por recurso
│       ├── componentes/   # componentes compartilhados
│       ├── formularios/   # formulários de lançamento
│       ├── paginas/       # telas por área (início, controle, cartões, metas, planejamento)
│       ├── formatacao/    # R$, datas e porcentagem
│       ├── hooks/
│       └── tema/          # tokens de cor e tema claro/escuro
├── docker/mysql-init/     # cria o banco de testes
├── docs/                  # requisitos e arquitetura
└── docker-compose.yml     # MySQL de desenvolvimento
```

## Autor

Marcos Alexandre Milezarek. [LinkedIn](https://www.linkedin.com/in/marcosmilezarek/)
