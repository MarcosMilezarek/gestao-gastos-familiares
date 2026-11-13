# Fatia 1: Cadastro, login e vínculo do casal

> Só o que é da fatia 1. Convenções do modelo físico: `comum.md` §4; API e erros: §6; sessão e autorização: §7; camadas: §3. Telas: `front.md`.
> Pré-requisito: a base comum (`comum.md`) e a infraestrutura do front (`front.md`). Validação e execução: `comum.md` §9.

## 1. Escopo e RF cobertos

Cadastro, login/logout, perfil e tema, alteração de senha, convite, aceite/recusa, desvínculo e a tela de vínculo. A fatia também entrega o que as demais fatias consomem: `Contexto` (`comum.md` §7.3), a checagem de `Origin` (§7.4) e os **ganchos** (§4.9) pelos quais fatias seguintes plugam regras no cadastro e no vínculo sem a fatia 1 conhecê-las.

(RF-1.14 não existe nos requisitos; a numeração pula de 1.13 para 1.15.)

## 2. Tabelas e migrações

Convenções de `comum.md` §4 valem para todas (nomes, `BIGINT UNSIGNED`, `DATETIME(6)` UTC, `criado_em`/`atualizado_em`, `ON DELETE RESTRICT`). Migrações escritas à mão, `upgrade()` e `downgrade()` completos.

### 2.1 Migração `0001_usuario_sessao`

**`usuario`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| nome | VARCHAR(80) | NOT NULL |
| email | VARCHAR(254) COLLATE `utf8mb4_0900_as_ci` | NOT NULL, `uq_usuario_email` único |
| senha_hash | VARCHAR(255) | NOT NULL (argon2id) |
| tema | VARCHAR(10) | NOT NULL DEFAULT `'claro'`, `ck_usuario_tema` IN (`claro`,`escuro`) |
| criado_em, atualizado_em | DATETIME(6) | comum §4 |

**`sessao`** (comum §7.2)
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| usuario_id | BIGINT UNSIGNED | NOT NULL, `fk_sessao_usuario_id` -> usuario |
| token_hash | CHAR(64) | NOT NULL, `uq_sessao_token_hash` único |
| criado_em, expira_em, ultimo_uso_em | DATETIME(6) | NOT NULL |

Índice `ix_sessao_usuario_id (usuario_id)`.

### 2.2 Migração `0002_casal_convite`

**`casal`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| pessoa_a_id | BIGINT UNSIGNED | NOT NULL, FK usuario (quem convidou, `comum.md` §5.2) |
| pessoa_b_id | BIGINT UNSIGNED | NOT NULL, FK usuario (quem aceitou) |
| encerrado_em | DATETIME(6) | NULL (ativo enquanto nulo) |
| criado_em | DATETIME(6) | NOT NULL |

`ck_casal_pessoas_distintas` (`pessoa_a_id <> pessoa_b_id`). Índices `ix_casal_pessoa_a_id_encerrado_em`, `ix_casal_pessoa_b_id_encerrado_em`. Unicidade de "um casal ativo por pessoa" **não** é do banco (`comum.md` §5.2: bloqueio de linha no service, §4.8).

**`convite`**
| Coluna | Tipo | Restrição |
|---|---|---|
| id | BIGINT UNSIGNED AI | PK |
| convidante_id | BIGINT UNSIGNED | NOT NULL, FK usuario |
| convidado_id | BIGINT UNSIGNED | NOT NULL, FK usuario (resolvido pelo e-mail no envio) |
| estado | VARCHAR(20) | NOT NULL DEFAULT `'pendente'`, `ck_convite_estado` IN (`pendente`,`aceito`,`recusado`,`cancelado`,`invalidado`) |
| pendente_chave | BIGINT UNSIGNED | **coluna gerada** `STORED` = `IF(estado = 'pendente', convidante_id, NULL)`, `uq_convite_pendente_chave` único |
| criado_em | DATETIME(6) | NOT NULL |
| respondido_em | DATETIME(6) | NULL |

`ck_convite_pessoas_distintas` (`convidante_id <> convidado_id`). Índice `ix_convite_convidado_id_estado`. A coluna gerada dá o "um convite pendente por convidante" (RF-1.06) no banco, já que MySQL não tem índice único parcial; `NULL` não colide. Compatível com as FKs porque elas são `RESTRICT` (MySQL proíbe coluna gerada sobre colunas de FK com `CASCADE`/`SET NULL`). No SQLAlchemy: `Computed("IF(estado = 'pendente', convidante_id, NULL)", persisted=True)`.

## 3. Contratos das rotas

Todas sob `/api`, JSON, erros no formato de `comum.md` §6.4. "Sessão" = exige cookie `sid` válido (padrão); as exceções estão marcadas.

**Objetos de saída**
```
UsuarioSaida = { "id": 1, "nome": "Ana", "email": "ana@x.com", "tema": "claro" | "escuro" }
SessaoSaida  = { "usuario": UsuarioSaida, "hoje": "2026-10-29",
                 "casal": null | { "id": 3, "parceiro": { "id": 2, "nome": "Bia" } } }
VinculoSaida = { "estado": "sem_vinculo" | "convite_enviado" | "convite_recebido" | "vinculado",
                 "convite_enviado": null | { "id": 5, "email_convidado": "bia@x.com" },
                 "convites_recebidos": [ { "id": 7, "convidante_nome": "Ana" } ],
                 "parceiro": null | { "id": 2, "nome": "Bia" } }
```
Nenhum objeto contém senha ou hash (RNF-04). `hoje` é a data civil do servidor em `APP_TZ` (`front.md` §3, §7). O tipo `Sessao` do front (`frontend/src/api`) é o espelho literal de `SessaoSaida`: `{ usuario, hoje, casal }`, com o tema em `usuario.tema`.

### 3.1 Cadastro e sessão

| Método e caminho | Entrada | Saída | Erros | Cobre |
|---|---|---|---|---|
| `POST /api/cadastro` (**pública**) | `{ nome, email, senha, senha_confirmacao }` | `201` `SessaoSaida` + cookie `sid` (cadastro já entra logado) | 422 `VALIDACAO` (`campos`: `nome`, `email`, `senha` < 8 ou > 128, `senha_confirmacao` diferente da `senha`); 409 `EMAIL_JA_CADASTRADO` (`campos.email`) | RF-1.01 a 1.03, CA-1.01 a 1.03 |
| `POST /api/sessao` (**pública**, login) | `{ email, senha }` | `200` `SessaoSaida` + cookie `sid` | 401 `CREDENCIAIS_INVALIDAS` (mesma mensagem para e-mail inexistente e senha errada); 422 `VALIDACAO` | RF-1.04, CA-1.04 |
| `GET /api/sessao` | - | `200` `SessaoSaida` | 401 `NAO_AUTENTICADO` | guarda de rota (`front.md` §4) |
| `DELETE /api/sessao` | - | `204`; remove a linha da sessão do aparelho e expira o cookie | 401 | RF-1.05, CA-1.05 |

### 3.2 Perfil, tema e senha

| Método e caminho | Entrada | Saída | Erros | Cobre |
|---|---|---|---|---|
| `PATCH /api/perfil` | `{ nome?, tema? }` (ao menos um) | `200` `UsuarioSaida` | 422 `VALIDACAO` (nome vazio ou > 80; tema fora de `claro`/`escuro`; corpo vazio) | RF-1.11, 1.12, CA-1.11, 1.12 |
| `POST /api/perfil/senha` | `{ senha_atual, senha_nova }` | `204`; revoga as **outras** sessões da pessoa (§6, D6) | 409 `SENHA_ATUAL_INCORRETA` (`campos.senha_atual`); 422 `VALIDACAO` (`senha_nova` < 8 ou > 128) | RF-1.13, CA-1.13 |

### 3.3 Vínculo

| Método e caminho | Entrada | Saída | Erros | Cobre |
|---|---|---|---|---|
| `GET /api/vinculo` | - | `200` `VinculoSaida` | - | RF-1.15, CA-1.15 |
| `POST /api/convites` | `{ email }` | `201` `{ "id", "email_convidado" }` | 409 `JA_VINCULADO` (quem convida já tem casal); 409 `CONVITE_PARA_SI_MESMO`; 409 `CONVIDADO_NAO_CADASTRADO`; 409 `CONVIDADO_JA_VINCULADO`; 409 `CONVITE_PENDENTE_EXISTE`; 422 `VALIDACAO` (`campos.email`). Mensagem de cada um diz o motivo (RF-1.07) | RF-1.06, 1.07, 1.09, CA-1.06, 1.07, 1.09 |
| `DELETE /api/convites/{id}` | - | `204` (cancela; só o convidante) | 404 `NAO_ENCONTRADO` (não participa do convite); 409 `CONVITE_NAO_PENDENTE` | RF-1.06, CA-1.06 |
| `POST /api/convites/{id}/aceitar` | - | `200` `VinculoSaida` (estado `vinculado`) | 404 (só o convidado enxerga); 409 `CONVITE_NAO_PENDENTE`; 409 `JA_VINCULADO` (o convidado já tem casal); 409 `CONVIDADO_JA_VINCULADO` (o convidante passou a ter casal) | RF-1.08, 1.09, CA-1.08, 1.09 |
| `POST /api/convites/{id}/recusar` | - | `200` `VinculoSaida` | 404; 409 `CONVITE_NAO_PENDENTE` | RF-1.08, CA-1.08 |
| `POST /api/vinculo/desvincular` | `{ "confirmar": true }` | `200` `VinculoSaida` (estado `sem_vinculo`) | 422 `VALIDACAO` (`campos.confirmar` se ausente ou falso); 409 `SEM_VINCULO` | RF-1.10, CA-1.10 |

### 3.4 Códigos de erro da fatia (acrescentados em `errors.py`)
`EMAIL_JA_CADASTRADO`, `SENHA_ATUAL_INCORRETA`, `JA_VINCULADO`, `CONVITE_PARA_SI_MESMO`, `CONVIDADO_NAO_CADASTRADO`, `CONVIDADO_JA_VINCULADO`, `CONVITE_PENDENTE_EXISTE`, `CONVITE_NAO_PENDENTE`, `SEM_VINCULO`. (Todos 409; `CREDENCIAIS_INVALIDAS`, `NAO_AUTENTICADO`, `NAO_ENCONTRADO`, `VALIDACAO` já são do `comum.md` §6.4.) `SEM_VINCULO` também é usado pelas fatias 3 em diante, com o mesmo sentido ("a ação exige casal ativo").

## 4. Regras dos services

Todos recebem `(db, ...)`, controlam a transação e lançam `AppError` (`comum.md` §3).

### 4.1 Normalização de entrada (schemas Pydantic)
`nome`: `strip`, 1 a 80 caracteres. `email`: `strip().lower()`, `EmailStr`, até 254. `senha`/`senha_nova`/`senha_atual`: 8 a 128 caracteres, sem normalização (mínimo e máximo só valem para senha nova e cadastro; `senha` do login e `senha_atual` não têm mínimo, para não revelar nada). `senha` do login e `senha_atual` aceitam **até 128** caracteres no schema (sem `max_length` que gere 422 próprio): acima disso o service responde exatamente como senha errada (`CREDENCIAIS_INVALIDAS` / `SENHA_ATUAL_INCORRETA`) **sem calcular o hash**, para um corpo grande não custar argon2 e nada ser revelado sobre a política. Mensagens em português dizendo o que corrigir (RNF-09).

### 4.2 `services/sessao.py`
- `cadastrar(db, dados) -> tuple[Usuario, str]`: confere `senha == senha_confirmacao`; busca e-mail existente (comparação do banco, collation `as_ci`) e também captura `IntegrityError` de `uq_usuario_email` (corrida) -> `EMAIL_JA_CADASTRADO`; grava `usuario` (hash argon2id, `tema='claro'`); chama `ganchos.ao_cadastrar(db, usuario)` (cria conta individual e categorias padrão, fatia 2); cria sessão; **um** `commit`. Devolve o usuário e o token em claro (o router o põe no cookie).
- `entrar(db, email, senha) -> tuple[Usuario, str]`: se `len(senha) > 128` -> `CREDENCIAIS_INVALIDAS` sem hash (§4.1); busca por e-mail; se não existe, `verificar_senha(senha, HASH_FALSO)` (comum §7.1) e `CREDENCIAIS_INVALIDAS`; se a senha confere e `check_needs_rehash`, regrava o hash; apaga as sessões vencidas da pessoa; cria sessão; commit.
- Sessão nova: `token, token_hash = novo_token()`; `expira_em = agora_utc() + SESSAO_DIAS`; `ultimo_uso_em = agora`.
- `resolver_sessao(db, token) -> Usuario | None`: `hash_token(token)` (SHA-256 hex; função de `security.py`); sem linha -> `None`; `expira_em <= agora_utc()` -> apaga a linha, commit, `None`; se `ultimo_uso_em` tem mais de 1 hora, atualiza e faz commit (única escrita em caminho de leitura; justificada: evita um `UPDATE` por requisição).
- `sair(db, token)`: apaga a linha de `hash_token(token)`; commit.
- `atualizar_perfil(db, usuario, nome=None, tema=None) -> Usuario`.
- `alterar_senha(db, usuario, token_atual, senha_atual, senha_nova)`: confere `senha_atual` (`SENHA_ATUAL_INCORRETA`; `len > 128` também, sem hash, §4.1), grava novo hash, apaga as sessões da pessoa **exceto** a de `token_atual`; commit.
- `montar_sessao(db, usuario, ctx) -> dict`: `usuario`, `hoje()`, e `casal` com o nome do parceiro quando `ctx.casal_ativo_id` existe.

### 4.3 `acesso.contexto_do_usuario(db, usuario_id) -> Contexto`
Consulta `casal` onde a pessoa é A ou B: `casal_ativo_id` = o de `encerrado_em IS NULL` (no máximo um), `parceiro_id` = a outra pessoa desse casal, `casais_ids` = todos (ativo e encerrados). `Contexto` é um `@dataclass(frozen=True)` em `acesso.py` com os campos de `comum.md` §7.3. A fatia 2 acrescenta os helpers de visibilidade ao mesmo arquivo.

### 4.4 `deps.py`
- `get_contexto(request, db) -> Contexto`: lê o cookie `sid`; sem cookie ou `resolver_sessao` devolvendo `None` -> `AppError(401, NAO_AUTENTICADO)`; devolve `contexto_do_usuario`. Também exposto `get_usuario` (o `Usuario` da sessão) e `get_token` (o token do cookie), usados pelo logout e pela troca de senha.
- `verificar_origem(request)`: em `POST/PATCH/PUT/DELETE`, se o cabeçalho `Origin` vier e não estiver em `ORIGENS_PERMITIDAS` -> `AppError(403, ORIGEM_INVALIDA)` (comum §7.4). Registrada como dependência global do app (`FastAPI(dependencies=[Depends(verificar_origem)])`), não como middleware.

### 4.5 `services/vinculo.py`: estado (RF-1.15)
`estado_do_vinculo(db, ctx) -> dict` (formato `VinculoSaida`):
1. `ctx.casal_ativo_id` existe -> `vinculado`, com `parceiro`.
2. senão, convites `pendente` em que a pessoa é `convidado_id` -> `convite_recebido` (lista com `convidante_nome`).
3. senão, convite `pendente` em que é `convidante_id` -> `convite_enviado`.
4. senão `sem_vinculo`.
Precedência 1 > 2 > 3 > 4. `convite_enviado` e `convites_recebidos` vão sempre preenchidos com o que existir, mesmo em estado de precedência maior (pessoa que enviou e também recebeu convite): a tela mostra o bloco de cada um que existir.

### 4.6 Convidar, cancelar, recusar
- `convidar(db, ctx, email)`: trava a linha de `usuario` da própria pessoa (`SELECT ... FOR UPDATE`); ordem das verificações (a primeira que falha responde): quem convida já tem casal ativo -> `JA_VINCULADO`; e-mail igual ao próprio -> `CONVITE_PARA_SI_MESMO`; e-mail sem cadastro -> `CONVIDADO_NAO_CADASTRADO`; convidado com casal ativo -> `CONVIDADO_JA_VINCULADO`; já existe convite `pendente` do convidante -> `CONVITE_PENDENTE_EXISTE` (também por `IntegrityError` de `uq_convite_pendente_chave`). Grava `convite(estado='pendente')`. **Não envia e-mail** (RF-1.06).
- `cancelar_convite(db, ctx, convite_id)`: convite com `convidante_id == ctx.usuario_id`, senão 404; `estado != 'pendente'` -> `CONVITE_NAO_PENDENTE`; vira `cancelado`, `respondido_em = agora`.
- `recusar_convite(db, ctx, convite_id)`: igual, mas por `convidado_id`; vira `recusado`.

### 4.7 `aceitar_convite(db, ctx, convite_id)` (RF-1.08, RF-1.09)
1. Convite com `convidado_id == ctx.usuario_id`, senão 404.
2. Trava as duas linhas de `usuario` (convidante e convidado) **em ordem crescente de id** (evita impasse) e recarrega o convite (`populate_existing`).
3. `estado != 'pendente'` -> `CONVITE_NAO_PENDENTE`; convidado com casal ativo -> `JA_VINCULADO`; convidante com casal ativo -> `CONVIDADO_JA_VINCULADO` (a mensagem diz que o convite não vale mais).
4. Cria `casal(pessoa_a_id=convidante, pessoa_b_id=convidado)`; convite vira `aceito`.
5. Convites `pendente` em que qualquer das duas pessoas seja convidante ou convidado viram `invalidado` (CA-1.09: convite pendente de quem se vinculou a outra pessoa fica inválido).
6. `ganchos.ao_vincular(db, casal)` (conta conjunta, união de categorias e tags: fatia 2).
7. Um `commit`. Falha em qualquer passo desfaz tudo.

### 4.8 `desvincular(db, ctx, confirmar)` (RF-1.10)
`confirmar` falso/ausente -> `VALIDACAO`; sem `ctx.casal_ativo_id` -> `SEM_VINCULO`. Trava as duas linhas de `usuario` (ordem crescente); marca `casal.encerrado_em = agora_utc()`; `ganchos.ao_desvincular(db, casal)` (arquiva a conjunta e copia categorias/tags para cada pessoa: fatia 2; trata transferências e recorrências entre as duas individuais: fatia 3, `comum.md` §7.3 regra 4); commit. Contas e lançamentos individuais continuam com o dono; a visibilidade mútua some sozinha, porque `contexto_do_usuario` deixa de achar casal ativo, e o lançamento com uma ponta que ficou invisível vira somente leitura (`comum.md` §7.3, regras 1 e 2). Nada do que já foi realizado é apagado. Novo vínculo, mesmo entre as mesmas pessoas, é um novo `casal` (nova conta conjunta, comum §5.2).

### 4.9 `services/ganchos.py`
Módulo de funções que não fazem nada nesta fatia; cada fatia posterior troca o corpo e declara os ganchos que ela precisa (a tabela é a fonte e cada fatia a estende no próprio `fatia-N.md`):

| Gancho | Chamado por | Declarado | Implementado |
|---|---|---|---|
| `ao_cadastrar(db, usuario)` | `cadastrar` | fatia 1 (vazio) | fatia 2 |
| `ao_vincular(db, casal)` | `aceitar_convite` | fatia 1 (vazio) | fatia 2 |
| `ao_desvincular(db, casal)` | `desvincular` | fatia 1 (vazio) | fatia 2; a fatia 3 estende o corpo (`comum.md` §7.3 regra 4) |

Os ganchos rodam **dentro da transação do chamador** e nunca fazem `commit`.

### 4.10 `tempo.py` (datas; sem regra de negócio; `comum.md` §3.1. Esta seção só detalha o contrato)
`agora_utc() -> datetime` (naive, UTC); `hoje() -> date` (em `APP_TZ`); `mes_ref(d) -> date` (dia 1); `parse_mes("AAAA-MM") -> date`; `formatar_mes(date) -> str`; `fim_do_mes(date) -> date`; `somar_meses(date, n) -> date` (dia 1 ou dia preservado, com limite no último dia do mês); `validar_mes(mes, hoje)` (entre `2000-01` e `hoje + 120 meses`, senão `VALIDACAO` com `campos.mes`). Todas puras exceto `hoje`/`agora_utc`.

## 5. Telas e mapa de arquivos

### 5.1 Telas (rotas em `front.md` §4)
| Rota | Tela | Conteúdo |
|---|---|---|
| `/entrar` (pública) | Entrar | e-mail, senha; erro genérico acima do botão; link para `/cadastrar` |
| `/cadastrar` (pública) | Cadastrar | nome, e-mail, senha, confirmar senha; erros junto ao campo (`front.md` §8, RNF-09) |
| `/configuracoes` | Menu | Perfil e tema, Alterar senha, Vínculo do casal, Sair (engrenagem no cabeçalho do Início, `front.md` §3) |
| `/configuracoes/perfil` | Perfil e tema | nome editável; tema claro/escuro aplicado na hora (`front.md` §6) |
| `/configuracoes/senha` | Alterar senha | senha atual, nova (dica: mínimo 8) |
| `/configuracoes/vinculo` | Vínculo | blocos por `VinculoSaida` (abaixo) |

**Tela de vínculo** (CA-1.15), blocos mostrados conforme a presença no `VinculoSaida`:
- `sem_vinculo`: campo "E-mail do parceiro(a)" + "Enviar convite";
- `convite_enviado`: "Convite enviado para {email}" + "Cancelar convite";
- `convite_recebido`: para cada convite, "{convidante_nome} convidou você" + "Aceitar" / "Recusar";
- `vinculado`: "Vinculado(a) com {parceiro.nome}" + "Desvincular", que abre `DialogoConfirmacao` com o texto do que acontece (conta conjunta arquivada, deixam de ver os dados um do outro) e botão "Desvincular" que envia `confirmar: true`.

Após aceitar ou desvincular: `queryClient.invalidateQueries()` (`front.md` §5). Logout: `DELETE /api/sessao`, `queryClient.clear()`, `navigate("/entrar", { replace: true })` (CA-1.05); o `Cache-Control: no-store` da API completa a garantia do botão voltar.

O ícone de configurações no Início fica, nesta fatia, no placeholder do Início dentro de `App.tsx`; a fatia 5 o move para o cabeçalho do Início real.

## 6. Decisões e riscos da fatia

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | `convite` guarda `convidado_id`, resolvido pelo e-mail no envio | RF-1.07 só permite convidar quem já tem cadastro; evita convite "solto" para e-mail que se cadastra depois | Guardar o e-mail em texto (permitiria convite a quem ainda não existe) |
| D2 | "Um convite pendente por convidante" por coluna gerada + índice único | MySQL não tem índice único parcial; o banco impede a corrida de dois envios | Só checar no service (corrida) |
| D3 | Cadastro já abre a sessão | Evita um login imediato sem requisito contrário; CA-1.01 continua valendo | Redirecionar ao login |
| D4 | Ganchos como funções de um módulo (`ganchos.py`) | A fatia 1 não pode importar a fatia 2 (que vem depois); função vazia trocada pela fatia seguinte é a forma mais simples e testável | Barramento de eventos/registro de callbacks (camada sem requisito) |
| D5 | `POST /api/vinculo/desvincular` com `{confirmar: true}` | Confirmação explícita (RF-1.10) validada no servidor, e `DELETE` com corpo é frágil em proxies | `DELETE /api/vinculo` sem confirmação |
| D6 | Alterar senha revoga as outras sessões | Segurança barata (uma linha de `DELETE`), sem requisito contrário; mantém a do aparelho atual | Não revogar |
| D7 | `estado` com precedência; blocos por presença | Pessoa com convite enviado que recebe outro convite não tem estado "puro" nos requisitos; a tela mostra o que existir | Recusar convite a quem tem convite enviado pendente (regra nova) |
| D8 | `models/` e `routers/` descobertos por `pkgutil` | Cada módulo novo não precisa editar `__init__.py`/`main.py` | Lista explícita de módulos |
| D9 | Convidante vira A, convidado vira B | `comum.md` §5.2 (D-026): é a única regra que não pede nova informação nem decisão da pessoa | Ordem de cadastro (A = quem se cadastrou primeiro; arbitrária para o casal) ou escolha na tela de aceite (campo e passo novos sem requisito) |
| D10 | `hoje` e o casal vão em `GET /api/sessao` | O front precisa de `hoje` (`front.md` §3, §7) e do parceiro sem outra chamada | Rota separada |

Riscos:
- **Corrida no vínculo** (dois aceites simultâneos): mitigada pelo bloqueio ordenado das linhas de `usuario` (§4.7). Há teste de aceite concorrente.
- **Coluna gerada `STORED` no Alembic/SQLAlchemy**: é o primeiro uso no projeto (a fatia 2 também usa). A confirmação de que a DDL sai correta (`alembic upgrade` real) é feita nos testes de migração.
- **Fuso do MySQL** (fechado): `CURRENT_TIMESTAMP(6)` e `ON UPDATE` usam o fuso da sessão do MySQL; `db.py` abre toda conexão com `SET time_zone = '+00:00'` (`comum.md` §3.1). Os services desta fatia ainda gravam `agora_utc()` explicitamente.
- **Enumeração de e-mails** pelo convite: inevitável pelo RF-1.07 (informar o motivo). O login não revela (RF-1.04). Sem limite de tentativas (comum §13).
- **Cookie `Secure` em produção**: `COOKIE_SECURE` verdadeiro por padrão em `prod` (comum §8).
