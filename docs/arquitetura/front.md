# Arquitetura do front: SistemaCasal

> Só o que é do front. Versões e pacotes: `comum.md` §2.3. Convenções de API (erros, dinheiro como string): `comum.md` §6. Validação e execução: `comum.md` §9.

## 1. Visão

SPA React 19 + TypeScript (estrito) em `frontend/`, mobile first (360 px é o piso, RNF-01), em português do Brasil (RNF-10), servida na mesma origem da API (`/api`, proxy do Vite em desenvolvimento). O front **exibe e coleta**; regra de negócio e toda soma de dinheiro ficam no backend (§7).

## 2. Estrutura de `frontend/src/`

```
src/
  main.tsx                 # createRoot, QueryClientProvider, BrowserRouter
  App.tsx                  # tabela de rotas (§4)
  api/
    cliente.ts             # fetch com credentials, JSON, tratamento de erro -> ApiError
    <dominio>.ts           # funções e tipos por domínio (sessao.ts, contas.ts, lancamentos.ts, ...)
  componentes/             # compartilhados (sem regra de domínio)
    Shell.tsx              # layout: <Outlet/>, barra inferior, menu "+"
    BarraInferior.tsx      MenuMais.tsx   SeletorMes.tsx   CardsResumo.tsx
    EstadoVazio.tsx        BottomSheet.tsx  Campo.tsx (rótulo + erro)  Dinheiro.tsx (valor colorido)
    SituacaoIcone.tsx      # ícone + texto da situação (RNF-08)
    RotaProtegida.tsx      # guarda de rota (§4)
    DialogoConfirmacao.tsx, DialogoAlcance.tsx, icones.ts, SeletorIcone, SeletorCor
  formularios/             # FormulariosProvider.tsx e os formulários de lançamento (despesa, receita, cartão, transferência)
  paginas/<area>/          # inicio/, controle/, cartoes/, metas/, planejamento/, configuracoes/, entrada/
  formatacao/              # dinheiro.ts, data.ts, percentual.ts (§7)
  tema/                    # tokens.css, TemaProvider.tsx
  hooks/                   # useMes (mês na URL), useSessao
```
Regra: `paginas/` usa `componentes/`, `formularios/`, `api/`, `formatacao/`; `componentes/` não importa de `paginas/` nem de `api/`. Um módulo por tela; sem barrel files.

## 3. Navegação mobile first

**Shell** (todas as telas autenticadas): coluna de altura total (`100dvh`): conteúdo rolável + barra inferior fixa. Rolagem só vertical; `overflow-x` nunca escondido para "consertar" estouro (CA-0.04).

**Barra inferior** (RF-0.01, RF-0.02, CA-0.01):
- Itens, da esquerda para a direita: **Início**, **Controle**, **"+"**, **Cartões**, **Metas**, **Planejamento**. As 5 abas são `NavLink`s; o "+" é um botão central, maior e destacado, que não é aba nem rota.
- Grade de 6 colunas iguais (o "+" ocupa uma coluna); a 360 px cada coluna tem 60 px, acima dos 44 x 44 px (RNF-01). Descartado: 5 colunas com o "+" flutuando sobre a barra (cobre conteúdo da lista e o alvo de toque brigaria com `safe-area-inset-bottom`). Cada item: ícone + rótulo curto (texto sempre visível, RNF-08). Respeita `env(safe-area-inset-bottom)`. Aba ativa indicada por cor **e** peso/sublinhado.
- O "+" abre `MenuMais` (bottom sheet pequeno) com exatamente **Despesa**, **Receita**, **Despesa no cartão**, **Aporte/Transferência**; cada opção abre o formulário correspondente (§8). Fica visível em qualquer tela autenticada, inclusive com o formulário fechado.

**Seletor de mês** (RF-0.03, CA-0.03): componente `SeletorMes` fixo no topo (`position: sticky; top: 0`) com botões "mês anterior" / "mês seguinte" e o rótulo ("outubro de 2026"); aparece nas telas do **Controle** e, com estado próprio, na tela de orçamento (RF-7.02). Início e Cartões (lista) não o têm; o detalhe de fatia/fatura tem navegação própria por mês da fatura. O mês fica na URL (`?mes=2026-10`); sem parâmetro, vale o mês corrente do servidor (a resposta de `GET /api/sessao` traz `hoje`). Trocar de tela dentro do Controle mantém o `mes`.

**Cards de resumo** (RF-0.04, CA-0.04): `CardsResumo` = contêiner `display: flex; overflow-x: auto; scroll-snap-type: x proximity` com `min-width: 0` no pai, para a rolagem horizontal ficar só no contêiner e nunca na página. Cada card tem largura mínima fixa (ex.: 9 rem).

**Estado vazio** (RF-0.07): `EstadoVazio({ frase, acaoRotulo, onAcao })`, obrigatório em toda lista; a lista filtrada sem resultado usa a variante com "Limpar filtros" (RF-5.13).

**Configurações** (perfil, tema, senha, vínculo; fatia 1): acessadas por um ícone de engrenagem no cabeçalho do **Início**; não ocupam aba.

## 4. Rotas

Biblioteca: `react-router` (modo declarativo). Rotas públicas fora do `Shell`; as demais dentro de `RotaProtegida` , que usa `useSessao()` (`GET /api/sessao`): sem sessão -> `<Navigate to="/entrar">` e o cache do React Query é limpo (RNF-05, CA-N.04, CA-1.05).

| Caminho | Tela | Fatia |
|---|---|---|
| `/entrar`, `/cadastrar` | login, cadastro (públicas) | 1 |
| `/configuracoes`, `/configuracoes/perfil`, `/configuracoes/senha`, `/configuracoes/vinculo` | configurações, perfil e tema, alterar senha, vínculo do casal | 1 |
| `/` | Início (blocos fixos, RF-5.14) | 5 |
| `/projecao` | projeção de saldo | 5 |
| `/controle` | lista do mês com filtros e cards de resumo | 5 (esqueleto de lista já na 2) |
| `/controle/contas`, `/controle/contas/arquivadas` | contas; contas arquivadas | 2 |
| `/controle/contas/:contaId` | lançamentos de uma conta (lista filtrada por `conta_id`) | 2 |
| `/controle/categorias`, `/controle/tags` | categorias; tags | 2 |
| `/controle/proporcao` | proporção e aporte do mês | 3 |
| `/controle/balanco` | balanço por conta e por dono | 5 |
| `/controle/relatorios`, `/controle/relatorios/:tipo` | relatórios | 5 |
| `/cartoes`, `/cartoes/novo`, `/cartoes/:cartaoId`, `/cartoes/:cartaoId/faturas/:mes` | lista, cadastro, cartão, detalhe da fatura | 4 |
| `/metas`, `/metas/:metaId` | metas e patrimônio; detalhe | 6 |
| `/planejamento` | menu da aba | 7 |
| `/planejamento/orcamento`, `/planejamento/cenarios`, `/planejamento/cenarios/:cenarioId`, `/planejamento/plano-de-metas` | orçamento (seletor de mês próprio), cenários, plano de metas | 7 |
| `*` | 404 simples com link para `/` | 1 |

Cada `fatia-N.md` pode acrescentar subrotas da própria fatia; caminho novo entra aqui também (a tabela é a fonte).

## 5. Estado

- **Estado do servidor**: `@tanstack/react-query`. Uma função por endpoint em `api/<dominio>.ts`; chaves `[recurso, params]` (ex.: `["lancamentos", { mes, filtros }]`). Nenhum dado de servidor copiado para `useState` ou contexto.
- **Invalidação**: depois de qualquer mutação financeira, `queryClient.invalidateQueries()` sem filtro (saldos, balanço, porcentagem, fatura e projeção dependem uns dos outros; uma lista de chaves seria fonte de bug). Exceção: nenhuma na v1. `staleTime` padrão 30 s.
- **Estado de UI local**: `useState` no componente. Estado compartilhado só em dois contextos: `TemaProvider` e `FormulariosProvider` (qual formulário de lançamento está aberto e seus valores iniciais, §8). Sem Redux/Zustand: não há estado global de cliente que justifique.
- **Mês e filtros** vivem na URL (`useMes`, `useSearchParams`), para voltar/compartilhar e para sobreviver a recarga.
- **Erros**: `api/cliente.ts` lança `ApiError { status, codigo, mensagem, campos }` (formato de `comum.md` §6.4). Regras: `401` fora de `/entrar` limpa o cache e redireciona; `VALIDACAO` e `campos` alimentam as mensagens junto ao campo (RNF-09); demais erros viram aviso (toast/linha de erro) com a `mensagem` do servidor.
- **Cliente HTTP**: `fetch` com `credentials: "same-origin"`, `Content-Type: application/json`; sem axios.

## 6. Estilo

- **CSS Modules** (`*.module.css`) + **variáveis CSS** em `tema/tokens.css`. Sem Tailwind e sem biblioteca de componentes: o conjunto de componentes é pequeno e os requisitos (bottom sheet, alvos de 44 px, contraste) são mais simples de garantir com CSS próprio. Descartados: Tailwind (arquivos de configuração extras, sem ganho aqui); MUI (peso e visual a sobrescrever).
- **Tema claro/escuro** (RF-0.09, RF-1.12): atributo `data-tema="claro|escuro"` no `<html>`; os tokens trocam por seletor `:root[data-tema="escuro"]`. Origem do valor: `usuario.tema` vindo de `GET /api/sessao`; antes do login, `prefers-color-scheme`. `TemaProvider` aplica o atributo e troca via `PATCH` do perfil.
- **Tokens obrigatórios** (nomes fixos, valores ajustados para contraste ≥ 4,5:1 em texto nos dois temas, RNF-08): `--cor-fundo`, `--cor-superficie`, `--cor-texto`, `--cor-texto-suave`, `--cor-borda`, `--cor-primaria`, `--cor-entrada` (verde), `--cor-saida` (vermelho), `--cor-alerta` (laranja), `--raio`, `--espaco-1..6`, `--alvo-min: 44px`, `--altura-barra`.
- **Cores de significado** (RF-0.08): entrada verde, saída vermelho, alerta/atrasada laranja. Nunca só cor (RNF-08): valor leva sinal ou rótulo ("Receita"/"Despesa") e a situação leva ícone **e** texto (`SituacaoIcone`: confirmada, prevista, atrasada).
- **Alvos de toque**: todo elemento interativo usa `min-height: var(--alvo-min); min-width: var(--alvo-min)`; classe utilitária em `tokens.css`.
- **Largura**: layout fluido de 360 px para cima; `box-sizing: border-box`; `max-width: 100%` em imagens e gráficos; em telas largas o conteúdo centra com `max-width: 640px` (não é requisito ter layout desktop).
- **Gráficos**: `recharts` dentro de `ResponsiveContainer` (descartados: Chart.js, que desenha em `canvas` e deixa o texto fora do DOM, pior para leitor de tela e para o rótulo com `formatarBRL`; SVG escrito à mão, mais código para rosca, área e barras); cores das categorias vêm do cadastro (`cor`); rosca sempre acompanhada de lista com valor e porcentagem (não depende só da cor).
- **Ícones de categoria/meta**: o banco guarda o **nome** do ícone (`icone VARCHAR(40)`); `componentes/icones.ts` mapeia o nome ao componente do `lucide-react` (lista fechada; nome desconhecido cai em um ícone padrão).

## 7. Formatação de R$, datas e porcentagem

Dinheiro chega do servidor como string (`"1234.50"`, `comum.md` §6.2). Para não perder precisão (RNF-02) o front **não converte para `number` para exibir nem soma dinheiro**; totais vêm prontos da API.

- `formatacao/dinheiro.ts`:
  - `formatarBRL(valor: string): string` -> `"R$ 1.234,50"`; negativo `"-R$ 50,00"`; manipula a string (sinal, parte inteira com ponto a cada 3 dígitos, vírgula, 2 casas). Não usa `Intl.NumberFormat` sobre `number`.
  - `mascararEntrada(digitos: string): string` -> campo de valor em que a pessoa digita só números e o valor "enche da direita" em centavos (`"12050"` -> `"120,50"`).
  - `paraApi(textoMascarado: string): string` -> `"120.50"` (ponto, 2 casas) para o corpo da requisição; nunca `number`.
  - `eZero`, `eNegativo(valor: string): boolean` por comparação de string normalizada (para escolher a cor/ícone).
  - Exceção única de `number`: dados de gráfico (`recharts` exige número); conversão só na camada do gráfico, nunca para exibir o valor (o rótulo usa `formatarBRL` da string original).
- `formatacao/data.ts`: `formatarData("2026-10-29") -> "29/10/2026"` por divisão de string, sem `new Date` (evita deslocamento de fuso); `rotuloMes("2026-10") -> "outubro de 2026"` por tabela de meses; `mesAnterior`, `mesSeguinte` sobre `"AAAA-MM"` por aritmética inteira. "Hoje" e "Ontem" (atalhos de data, RF-2.14) usam o `hoje` informado pelo servidor em `GET /api/sessao`, não o relógio do aparelho.
- `formatacao/percentual.ts`: `formatarPercentual("62.50") -> "62,50%"`.
- Pessoas e ordem "A"/"B": rótulo vem do nome (`usuario.nome`); "A"/"B" só aparece onde o requisito pede.

## 8. Formulários de lançamento

- **`FormulariosProvider`** guarda `{ tipo: "despesa" | "receita" | "cartao" | "transferencia" | null, valoresIniciais?, aoSalvar?, alcance? }` e expõe `abrir(tipo, valoresIniciais?, aoSalvar?, alcance?)` e `fechar()` (o `alcance?` (`Alcance`, `fatia-3.md` §5.1) é acrescentado pela fatia 3 e só é passado ao editar um lançamento recorrente, para o formulário enviar `?alcance=` e, nos alcances múltiplos, só os campos alterados, `fatia-3.md` §5.1). É montado no `Shell`; "+" (menu), "Fazer aporte" (RF-5.16), "Editar" e "Novo" das listas chamam `abrir`. Formulário **não é rota** (some ao navegar; o botão voltar fecha o sheet por `history.pushState` do próprio `BottomSheet`).
- **`BottomSheet`**: no celular ocupa a tela cheia (altura `100dvh`, título, botão fechar com 44 px, corpo rolável, rodapé fixo com as ações); em tela larga vira diálogo centralizado. Trava a rolagem do fundo, foco preso dentro, `Esc` fecha, `role="dialog"` com `aria-modal`.
- **Campos essenciais visíveis; avançados atrás de "Mais detalhes"** (RF-0.05, CA-0.05): tags, observação e recorrência (e parcelada, no cartão) só montam depois do toque. Cada formulário declara no `fatia-N.md` quais campos são essenciais.
- **"Salvar" e "Salvar e criar nova"** (RF-0.06, CA-0.06): só em criação. "Salvar e criar nova" salva, invalida o cache, e reinicia o formulário com os valores de abertura padrão (dono, conta, data de hoje, situação por RF-2.16); "Salvar" fecha o sheet.
- **Erros** (RNF-09): `ApiError.campos` -> prop `erro` do `Campo` (mensagem abaixo do campo, ligada por `aria-describedby`); foco no primeiro campo com erro. Validação do cliente se limita a obrigatório e formato mínimo; a regra é do servidor.
- **Alcance** (RF-0.10, fatias 3 e 4): `DialogoAlcance` com as opções "Somente este", "Este e os pendentes", "Todos (incluindo confirmados)"; abre antes de editar/excluir **apenas** se o item vier marcado como recorrente ou parcelado pela API.
- **Biblioteca de formulário**: nenhuma. Motivo: cada formulário tem poucos campos controlados e a validação é do servidor; cada formulário usa `useState` e o helper `campos` do `ApiError`. Descartado: `react-hook-form` + `zod` (duplicaria no cliente as regras do servidor).

## 9. Acessibilidade e mobile (RNF-01, RNF-08)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (sem travar zoom; `viewport-fit=cover` deixa a barra inferior usar `env(safe-area-inset-bottom)` em telas com entalhe); `lang="pt-BR"`.
- Rótulo (`<label>`) em todo campo; botões só com ícone têm `aria-label`; foco visível; o menu "+" e o bottom sheet são operáveis por teclado.
- Contraste conferido nos tokens dos dois temas; verde/vermelho/laranja escolhidos separadamente para cada tema.
- Sem rolagem horizontal da página: cards, filtros (chips) e tabelas largas rolam dentro do próprio contêiner; tabela de projeção usa contêiner com `overflow-x: auto`.
