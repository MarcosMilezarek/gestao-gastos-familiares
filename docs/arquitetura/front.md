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
  components/ui/           # primitivos shadcn/ui (Radix + Tailwind), gerados e depois nossos (§10.1)
  lib/utils.ts             # cn() = clsx + tailwind-merge
  componentes/             # compostos do app (sem regra de domínio), sobre components/ui (§10.2)
    Shell.tsx              # layout: <Outlet/>, barra inferior, menu "+"
    BarraInferior.tsx      MenuMais.tsx   SeletorMes.tsx   CardsResumo.tsx
    EstadoVazio.tsx        BottomSheet.tsx  Campo.tsx (rótulo + erro)  Dinheiro.tsx (valor colorido)
    SituacaoIcone.tsx      # ícone + texto da situação (RNF-08)
    RotaProtegida.tsx      # guarda de rota (§4)
    DialogoConfirmacao.tsx, DialogoAlcance.tsx, icones.ts, SeletorIcone, SeletorCor
    CabecalhoTela.tsx, TituloBloco.tsx, IconeQuadrado.tsx, CartaoDestaque.tsx, VisoesControle.tsx, MenuCadastros.tsx   # novos (§10.2)
  formularios/             # FormulariosProvider.tsx e os formulários de lançamento (despesa, receita, cartão, transferência)
  paginas/<area>/          # inicio/, controle/, cartoes/, metas/, planejamento/, configuracoes/, entrada/
  formatacao/              # dinheiro.ts, data.ts, percentual.ts (§7)
  tema/                    # tokens.css (entrada do Tailwind e dos tokens, §6), TemaProvider.tsx
  hooks/                   # useMes (mês na URL), useSessao
```
Regra: `paginas/` usa `componentes/`, `components/ui/`, `formularios/`, `api/`, `formatacao/`; `componentes/` usa `components/ui/` e não importa de `paginas/` nem de `api/`; `components/ui/` não importa de nenhuma outra pasta do app (só de `lib/`). Um módulo por tela; sem barrel files. O alias `@/` (= `src/`) é usado nos imports de `components/ui/` e `lib/`; o resto do código mantém imports relativos (não reescrever os existentes).

## 3. Navegação mobile first

**Shell** (todas as telas autenticadas): contêiner de altura total (`100dvh`) com a área rolável (`<main>`, `overflow-y: auto`, conteúdo centrado com `max-w-160`) e a barra inferior **sobreposta** (a pílula flutua e o conteúdo passa por trás). A área rolável leva respiro inferior de `calc(var(--altura-barra) + env(safe-area-inset-bottom))` (144 px mais a área segura), para o último item nunca ficar atrás da barra. Rolagem só vertical; `overflow-x` nunca escondido para "consertar" estouro (CA-0.04). Descartado: barra como item da coluna (os 144 px roubariam altura útil e a pílula deixaria de flutuar).

**Barra inferior** (RF-0.01, RF-0.02, CA-0.01; composto `BarraInferior`, §10.2):
- Estrutura (360 px): "+" de 56 x 56 centralizado **acima** da pílula; pílula de largura `100% - 32 px` (328 a 360), 60 de altura, `rounded-full`, `bg-card`, `border`, `shadow-barra`, com as 5 abas. Alturas: margem inferior 16 px (mais `env(safe-area-inset-bottom)`) + pílula 60 + respiro 12 + "+" 56 = 144 = `--altura-barra`. O contêiner da barra é `fixed inset-x-0 bottom-0` com `pointer-events-none`; só o "+" e a pílula têm `pointer-events-auto` (os cantos transparentes não bloqueiam rolagem nem toque no conteúdo). Em tela larga a barra acompanha a coluna de `max-w-160`.
- Abas, da esquerda para a direita: **Início**, **Controle**, **Cartões**, **Metas**, **Planejamento**, todas `NavLink`s. A aba ativa vira pílula `bg-primary text-primary-foreground` expandida com ícone **e** rótulo (`text-13 font-semibold`, 48 de altura); as inativas mostram só o ícone (44 x 48) e o nome fica em texto `sr-only` dentro do link (nome acessível = o rótulo). A ativa se distingue por cor, forma, peso e texto (nunca só cor, RNF-08) e leva `aria-current="page"` (o `NavLink` já faz). Pior caso (Planejamento ativo, 138 px) cabe nos 316 px úteis da pílula com folga de 2 px: não aumentar o `padding` das abas. Descartado: grade de 6 colunas com o "+" na linha (as 5 abas com a ativa expandida e o "+" de 44 não cabem em 328 px); isso substitui a regra antiga "texto sempre visível" nas abas inativas, que agora têm ícone mais nome acessível (RF-0.01 e CA-0.01 pedem 5 abas visíveis e tocáveis, não rótulo em todas).
- O "+" é `Button size="icon"` (variante `default`, degradê, 56 x 56 com anel de 4 px na cor do fundo: `ring-4 ring-background`), mantém `aria-label="Novo lançamento"` e `aria-haspopup="dialog"` (nomes já usados nos testes; o protótipo diz "Adicionar lançamento", prevalece o existente). Abre `MenuMais` (folha inferior sobre `Sheet`, §10.2) com exatamente **Despesa**, **Receita**, **Despesa no cartão**, **Aporte/Transferência**; cada opção abre o formulário correspondente (§8). Fica visível em qualquer tela autenticada, inclusive com o formulário fechado.

**Cabeçalho de tela**: toda tela autenticada abre com `CabecalhoTela` (§10.2): título à esquerda (`text-22 font-bold`) e ação opcional à direita; em telas de detalhe, botão circular "Voltar" à esquerda e título de 18 centralizado. O Início tem a engrenagem (`aria-label="Configurações"`) como ação; o Planejamento não tem ação, mas o cabeçalho mantém 44 px de altura para alinhar o título.

**Seletor de mês** (RF-0.03, CA-0.03): componente `SeletorMes` fixo no topo (`position: sticky; top: 0`) com botões "mês anterior" / "mês seguinte" (`Button variant="secondary" size="icon"`, 44 x 44, nomes acessíveis atuais) e o rótulo ("outubro de 2026", `text-16 font-semibold`); aparece nas telas do **Controle** e, com estado próprio, na tela de orçamento (RF-7.02). Início e Cartões (lista) não o têm; o detalhe de fatia/fatura tem navegação própria por mês da fatura. O mês fica na URL (`?mes=2026-10`); sem parâmetro, vale o mês corrente do servidor (a resposta de `GET /api/sessao` traz `hoje`). Trocar de tela dentro do Controle mantém o `mes`.

**Controle** (hoje os atalhos são uma fileira de chips em `Controle.tsx`): a tela passa a ter, de cima para baixo e fixos na rolagem, `SeletorMes`, `CabecalhoTela` (título "Controle", ação de texto **Cadastros**) e `VisoesControle` (§10.2), com as visões **Lista**, **Balanço**, **Proporção** e **Relatórios** em abas de pílula (`/controle`, `/controle/balanco`, `/controle/proporcao`, `/controle/relatorios`), todas com `?mes=` copiado da URL atual. As rotas não mudam e **nenhuma rota é criada**. Para onde vão os atalhos que saem da fileira:
- **Contas, Categorias e Tags**: a ação **Cadastros** abre `MenuCadastros` (folha inferior sobre `Sheet` com 3 linhas-link: Contas `/controle/contas`, Categorias `/controle/categorias`, Tags `/controle/tags`; tocar numa fecha a folha e navega). Descartados: virar abas (as 4 visões já ocupam os 328 px) e menu suspenso (alvo de toque e leitor de tela piores que a folha).
- **Projeção** (`/projecao`): sai do Controle; o acesso passa a ser o `Ver projeção` do bloco 7 do Início (RF-5.14), que já está no desenho.
- `VisoesControle` aparece só nas 4 rotas-raiz acima. As telas de cadastro e de detalhe (`/controle/contas...`, `/controle/categorias`, `/controle/tags`, `/controle/relatorios/:tipo`) usam `CabecalhoTela` com "Voltar" e mantêm o `SeletorMes` que cada uma já tem hoje (Contas e `ControleConta` usam; Categorias e Tags não).

**Cards de resumo** (RF-0.04, CA-0.04): `CardsResumo` = contêiner `flex gap-3 overflow-x-auto snap-x snap-proximity` com `min-w-0` no pai, para a rolagem horizontal ficar só no contêiner e nunca na página (o 3º card aparece cortado na borda, sinal de que rola). Cada `CardResumo` tem 144 px de largura fixa (`w-36 shrink-0`); detalhes em §10.2.

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

Decisão (D-074, D-076, D-078): o visual novo de todas as telas vem de **Tailwind CSS v4 + shadcn/ui (código copiado para o repositório, primitivos Radix)**, com os tokens, a fonte e os componentes do desenho aprovado. Substitui a decisão anterior de CSS Modules sem biblioteca de componentes. Motivo: o desenho exige dezenas de variantes (botão, selo, abas, camadas, gráficos) e primitivos acessíveis (foco preso, `Esc`, `aria-*`, teclado) que o shadcn/ui já traz e que seriam reescritos à mão; o código fica no repositório (sem dependência de runtime além do Radix). Descartados: manter CSS Modules (reescrever e testar foco e camadas à mão); MUI ou Chakra (visual a sobrescrever, peso, runtime de estilo).

### 6.1 Tailwind v4: pacotes e arquivo de entrada

- Plugin `@tailwindcss/vite` em `vite.config.ts` (`plugins: [react(), tailwindcss()]`). Sem `tailwind.config.js` e sem `postcss.config.*` (a v4 configura em CSS). Pacotes e versões: `comum.md` §2.3.
- **`src/tema/tokens.css` é a entrada** (já importado por `main.tsx`; o nome e o import não mudam). Ordem do arquivo: `@import "tailwindcss";`, `@import "tw-animate-css";` (animações de entrada e saída das camadas), `@custom-variant dark (&:is([data-tema="escuro"], [data-tema="escuro"] *));`, blocos `:root` e `:root[data-tema="escuro"]` com as variáveis (§6.2), `@theme inline { ... }` com o mapeamento para o Tailwind, `@layer base { ... }` com `*` (borda e `outline` do foco), `body` e `html`, e por fim a compatibilidade (§6.3). Descartado: arquivo `index.css` separado (o `tokens.css` já existe, é o que o `TemaProvider` e o teste de tokens conhecem).
- Fonte de conteúdo: detecção automática do Tailwind v4 (sem `content`). Classes montadas por concatenação de string não são detectadas: sempre classes completas (`cn("bg-primary", x && "...")`).

### 6.2 Tokens do desenho como variáveis CSS

- Os nomes são os do shadcn mais os de significado e marca. Claro em `:root`, escuro em `:root[data-tema="escuro"]` (o mesmo atributo que o `TemaProvider` já grava em `<html>`; **o `TemaProvider` não muda**). A variante `dark:` do Tailwind aponta para esse atributo (`@custom-variant` acima), mas como as variáveis já trocam por tema, os componentes **não usam `dark:`** (remover o `dark:*` dos arquivos gerados pelo shadcn: foram escritos para o tema neutro dele).
- Valores (claro / escuro; um valor só vale para os dois). Contrastes conferidos no desenho: texto >= 4,5:1 em todos os pares abaixo nos dois temas.
  - Base: `background` F8F5FE / 130A22; `foreground` 1B1030 / F4EEFF; `card` FFFFFF / 1E1233 (`card-foreground` = `foreground`); `popover` FFFFFF / 261745 (`popover-foreground` = `foreground`); `primary` 7C29FA / 8B43FA (`primary-foreground` FFFFFF); `secondary` F1E8FF / 2D1A52 (`secondary-foreground` 5A14C9 / E3D4FF); `muted` F1E8FF / 2A1A4A (`muted-foreground` 6A6280 / B3A8CF); `accent` F1E8FF / 34205E (`accent-foreground` 5A14C9 / F4EEFF); `destructive` FF6B6B (`destructive-foreground` 1B1030); `border` ECE7F4 / 2F2050; `input` BDB3D3 / 4A3775; `ring` 7C29FA / A56DFF; `chart-1` 7C29FA / A66BFF e `chart-2` a `chart-5` 38BDF8, 22C58B, FFB547, F472B6.
  - Significado (cada um com `X`, `X-foreground` 1B1030, `X-suave` fundo, `X-texto` texto escurecido): `entrada` 22C58B (suave E3F8EF / 0F2F26, texto 0A7650 / 3DDC97); `saida` FF6B6B (suave FFE9E9 / 3A1520, texto C0212C / FF9494); `alerta` FFB547 (suave FFF3DE / 3A2A0E, texto 9A5B00 / FFC15E); `info` 38BDF8 (suave E3F5FD / 0E2A3A, texto 0369A1 / 6CCDF9). Texto de valor, de erro e de situação usa sempre `X-texto`, nunca a cor cheia (a cheia é só preenchimento, ícone e gráfico, sempre com palavra ao lado).
  - Marca: `primary-escuro` 5A14C9 e `primary-claro` 9A55FF (paradas do degradê; iguais nos dois temas, **não** são cor de texto), `primary-suave` F1E8FF / 2D1A52 (quadrado de ícone, trilha), `primary-texto` 5A14C9 / C9A8FF (texto e ícone roxos sobre card ou fundo), `escuro-inicio` 2D1560 e `escuro-fim` 1B1030, `disabled` ECE7F4 / 2A1E45 e `disabled-foreground` A69FBB / 8479A6 (desabilitado sem `opacity`).
  - Transparências e sombras (cor com alfa dentro da variável, sem `opacity` de pintura): `branco-12` e `branco-18` (branco a 12% e 18%), `veu` 1B1030 a 50% / 000000 a 60%, `sombra-card` 1B1030 a 6% / 000000 a 30%, `sombra-barra` 10% / 40%, `sombra-overlay` 16% / 50%, `sombra-roxa` 7C29FA a 30% / 8B43FA a 30%, `sombra-foco` 7C29FA a 12% / 8B43FA a 24%, `sombra-foco-erro` FF6B6B a 12% / 24%.
  - `--radius: 18px` (base). Sem variáveis `--categoria-*`: a cor de categoria vem do cadastro (`cor`, hex) e é aplicada por `style` (a lista fechada continua em `SeletorCor.tsx`).
- `@theme inline`: para cada variável de cor acima, `--color-<nome>: var(--<nome>)` (gera `bg-card`, `text-entrada-texto`, `border-input`, `bg-primary-suave` etc.). Além das cores:
  - **Raios** (substituem os padrões do Tailwind): `--radius-xs` 6px, `--radius-sm` 8px, `--radius-md` 14px (quadrado de ícone), `--radius-lg` 18px (campo), `--radius-xl` 24px (card), `--radius-2xl` 28px (diálogo), `--radius-3xl` 32px (destaque e folha); `rounded-full` (9999px) é o do Tailwind.
  - **Sombras**: `--shadow-card: 0 8px 20px var(--sombra-card)`, `--shadow-barra: 0 10px 30px var(--sombra-barra)`, `--shadow-roxa: 0 10px 24px var(--sombra-roxa)`, `--shadow-destaque: 0 12px 30px var(--sombra-roxa)`, `--shadow-foco: 0 6px 16px var(--sombra-foco)`, `--shadow-foco-erro: 0 6px 16px var(--sombra-foco-erro)`, `--shadow-overlay: 0 16px 40px var(--sombra-overlay)` (classes `shadow-card`, `shadow-barra`, ...).
  - **Degradês**: `@utility bg-gradiente-botao` (`linear-gradient(135deg, var(--primary-claro), var(--primary))`), `bg-gradiente-escuro` (`escuro-inicio` a `escuro-fim`, 135deg). O degradê do **destaque** não é utilitário próprio: usa `bg-linear-to-bl from-primary-claro to-primary-escuro` (o claro no canto superior direito, para o texto do canto esquerdo ficar a mais de 4,5:1).
  - **Tipografia**: `--font-sans: "Geist Variable", system-ui, sans-serif` (§6.5) e a escala do desenho em `rem`, nomeada pelo tamanho em px, com a altura de linha do desenho: `--text-11` (0.6875rem, linha 14px), `--text-13` (0.8125rem, 18px), `--text-14` (0.875rem, 20px), `--text-16` (1rem, 22px), `--text-18` (1.125rem, 24px), `--text-22` (1.375rem, 28px), `--text-28` (1.75rem, 34px), `--text-40` (2.5rem, 44px), cada um com `--text-N--line-height`. Uso: `text-14 font-medium`, `text-22 font-bold` (o nome do estilo do desenho `text-14/medium` vira essas duas classes). Rótulo em caixa alta: `text-11 uppercase tracking-caps` com `--tracking-caps: 0.5px`. Descartado: `px` fixo (ignora o tamanho de fonte do sistema).
  - **Espaço**: sem tokens novos. O desenho usa múltiplos de 4 px, igual à escala padrão do Tailwind v4 (`p-4` = 16 px = `espaco/4`; `h-11` = 44 px, o alvo de toque; `h-15` = 60; `h-36` = 144).

### 6.3 Convivência com as telas ainda em CSS Modules

- **Tokens antigos como apelidos** (mantidos até a remoção final, §6.7): `--cor-fundo: var(--background)`, `--cor-superficie: var(--card)`, `--cor-texto: var(--foreground)`, `--cor-texto-suave: var(--muted-foreground)`, `--cor-borda: var(--border)`, `--cor-primaria: var(--primary-texto)`, `--cor-entrada: var(--entrada-texto)`, `--cor-saida: var(--saida-texto)`, `--cor-alerta: var(--alerta-texto)`, `--raio: var(--radius-md)`, `--espaco-1..6` em px como hoje (4, 8, 12, 16, 24, 32: o `--espaco-5` de 24 px **não** é o `espaco/5` de 20 px do desenho), `--alvo-min: 44px`, `--altura-barra: 144px` (era 64; só o `Shell` a usa). `.alvo-toque` continua como está. Os apelidos ficam também no bloco `:root[data-tema="escuro"]` (repetidos), porque o teste de tokens atual procura cada `--cor-*` nos dois blocos; o teste e os apelidos saem juntos no fim. Risco conhecido: `--cor-primaria` foi usado como fundo em 2 lugares (`cardCartao.module.css`, `entrada.module.css`); com o escuro `primary-texto` (C9A8FF) o texto branco ali perde contraste até a tela ser migrada: quem migrar a tela confere.
- **Preflight do Tailwind**: aceito, não isolado. Motivo: o Tailwind v4 põe o preflight em `@layer base` e CSS Modules não está em camada; regras fora de camada vencem as de camada, então tudo que um módulo já declara continua valendo e só mudam os padrões do navegador que o módulo não declarava (margem de `h1`-`h6`, `p` e `ul`, marcadores de lista, borda e fundo de `button` e `input`, `img` em bloco). Esses casos se corrigem na hora de migrar cada tela. Descartado: importar só `theme` e `utilities` sem o preflight (os arquivos do shadcn dependem dele: `border-color` padrão, `box-sizing`, reset de botão) e isolar com `@layer` os módulos (exigiria mexer em todos os módulos para um ganho temporário).
- Regra de transição: uma tela ou componente migrado perde o seu `.module.css` na mesma tarefa; nunca misturar classe de módulo e utilitário Tailwind no mesmo elemento (o módulo, fora de camada, sempre vence o utilitário).
- As regras `*`, `body` e `html` de hoje no `tokens.css` entram em `@layer base` (senão, fora de camada, venceriam as classes do Tailwind): `body` usa `bg-background text-foreground font-sans antialiased`.

### 6.4 shadcn/ui: estrutura e escolhas

- `frontend/components.json` (estilo `new-york`, `rsc: false`, `tsx: true`, `iconLibrary: "lucide"`, `tailwind.config: ""`, `tailwind.css: "src/tema/tokens.css"`, `tailwind.cssVariables: true`, `tailwind.baseColor: "neutral"`; `aliases`: `components` `@/components`, `ui` `@/components/ui`, `utils` `@/lib/utils`, `lib` `@/lib`, `hooks` `@/hooks`). Serve ao comando `shadcn` para adicionar ou comparar arquivos; o CLI não é dependência do projeto (roda com `npx`). Os arquivos que ele gerar **são ajustados** aos tokens e variantes do desenho (§10.1) e passam a ser do projeto; o `baseColor` não importa porque o CLI não pode sobrescrever as variáveis do `tokens.css` (conferir o diff depois de cada `add`).
- Alias `@/` = `src/`: `tsconfig.json` com `"paths": { "@/*": ["./src/*"] }` (sem `baseUrl`) e `vite.config.ts` com `resolve: { alias: { '@': '/src' } }` (o Vite resolve caminho iniciado em `/` a partir da raiz do projeto; a chave `'@'` só casa com `@` e `@/...`, então `@radix-ui` e outros pacotes não são afetados; sem `@types/node`: o tsconfig só carrega `vite/client`). O Vitest herda o alias do mesmo `vite.config.ts`.
- `src/lib/utils.ts`: `export function cn(...entradas: ClassValue[]) { return twMerge(clsx(entradas)) }`.
- **Radix**: pacote único `radix-ui` (importa-se `import { Dialog as DialogPrimitive } from "radix-ui"`), como o shadcn atual gera. Descartado: `@radix-ui/react-*` um a um (uma dúzia de versões a manter alinhadas). **`class-variance-authority`** para as variantes de `Button`, `Badge` e afins.
- **Primitivos** (lista final, em `src/components/ui/`, detalhes em §10.1): base `button`, `badge`, `card`, `separator`, `label`, `avatar`, `progress`, `skeleton`; formulário `toggle-group`, `tabs`, `input`, `textarea`, `select`, `switch`, `checkbox`, `radio-group`, `table`; camadas `dialog`, `alert-dialog`, `sheet`; gráfico `chart`. Fora da v1 desta troca: `dropdown-menu`, `popover`, `tooltip`, `sonner`, `calendar`, `form` e `combobox` (nenhuma tela os pede; `form` seria a biblioteca de formulário descartada em §8).
- **`select`: `<select>` nativo estilizado**, não o Radix Select. Motivo: no celular o seletor do sistema é o melhor controle (rolagem, teclado, acessibilidade nativa) e é o que as telas e os testes já usam (`getByLabelText`, `selectOptions`); o Radix Select usa lista própria, pesa mais e exige simular APIs do navegador no jsdom. O arquivo `select.tsx` exporta `Select` (um `<select>` com `appearance-none`, seta `ChevronDown` e as mesmas classes do `Input`), na assinatura de `<select>` (`ComponentProps<"select">`).
- **Campo de data: `<input type="date">` nativo estilizado** (o `Input` com `type="date"`). Motivo: seletor de data do sistema no celular, valor já em `AAAA-MM-DD` como a API e `formatacao/data.ts` esperam (sem `Date` e sem fuso, §7). Descartado: `calendar` do shadcn (`react-day-picker` e `date-fns`, dependências novas, objetos `Date`).
- **`checkbox`, `radio-group` e `switch`: Radix.** Motivo: marca visual do desenho (visto, estado), alvo de 44 px por `label` envolvente, setas no grupo de rádio e `role` corretos; os formulários usam estado controlado (`checked`, `onCheckedChange`, `value`, `onValueChange`), sem depender de `FormData`.
- **`input` e `textarea`**: altura 48 px (`min-h-12`), `rounded-lg`, `border border-input bg-card px-4 text-16` (16 px evita o zoom do iOS ao focar), foco `focus-visible:border-ring focus-visible:shadow-foco`, erro `aria-invalid:border-saida aria-invalid:shadow-foco-erro`, desabilitado `disabled:bg-disabled disabled:text-disabled-foreground`. O `Campo` (rótulo + erro, §8) continua sendo o dono de `label`, `aria-describedby` e `aria-invalid`; o primitivo só estiliza.

### 6.5 Fonte (Geist) e algarismos tabulares

- Pacote npm `@fontsource-variable/geist` (fonte variável, mesma Geist do desenho, empacotada pelo Vite: **sem CDN**, funciona offline e não abre conexão para terceiros). Importado **uma vez**, em `main.tsx`, antes do `tokens.css`: `import '@fontsource-variable/geist'`. A família no `@theme` é `"Geist Variable"` (§6.2). Descartado: o pacote `geist` da Vercel (orientado ao Next.js) e `<link>` do Google Fonts (CDN e privacidade).
- **`tabular-nums`** (Tailwind: `tabular-nums`, `font-variant-numeric: tabular-nums`; a Geist tem o recurso) em todo valor que se alinha ou compara: o componente `Dinheiro`, valores de `CardResumo`, `CartaoDestaque`, chips, linhas de balanço, de fatura e de projeção, células numéricas de `table`, rótulo de tooltip e legenda de gráfico, porcentagens e datas de lista. Regra: se o texto é um número que pode ser colocado abaixo de outro, leva `tabular-nums`. Títulos e frases não.

### 6.6 Gráficos

- `recharts` 3 continua; passa a ser usado **por dentro de `components/ui/chart.tsx`** (versão do shadcn para Recharts 3): `ChartContainer` (substitui o `ResponsiveContainer` solto; define o `min-w-0`, a proporção e as variáveis `--color-<chave>` a partir do `ChartConfig`) e `ChartTooltip` com um `ChartTooltipContent` ajustado ao desenho (pílula `bg-foreground text-background rounded-full px-3 py-1.5 text-13 font-semibold tabular-nums shadow-overlay`, que inverte nos dois temas). **Não** se usa o `ChartLegend` do shadcn: a legenda do desenho tem nome, valor e porcentagem à direita (lista em HTML, §10.2 `GraficoRosca`), que o leitor de tela lê e que atende "rosca nunca só cor" (RNF-08). Motivo de adotar o `chart.tsx`: centraliza o estilo do texto dos eixos e da grade pelos tokens e evita repetir o ajuste em cada gráfico; descartado: manter `ResponsiveContainer` puro com estilos soltos nos três gráficos.
- **Cores das séries saem dos tokens**: `ChartConfig = { chave: { label, color: "var(--chart-1)" } }`. Categorias: `chart-1` a `chart-5` na ordem (roxo, céu, menta, âmbar, rosa); **entrada e saída usam `var(--entrada)` e `var(--saida)`, nunca `chart-*`**; barra do mês em destaque `primary` e as demais em `primary-suave`; linha de meta tracejada em `alerta` com o rótulo "Meta" em `alerta-texto`; fatias de categorias do usuário usam o `cor` (hex) do cadastro como `color` do config (dado do usuário, igual nos dois temas). O traço e o preenchimento recebem `var(--color-<chave>)` nos atributos do SVG.
- A regra de `number` de §7 continua: cada ponto do gráfico leva `{ valor: number, texto: string }` (o `number` só desenha; o tooltip, a legenda e o rótulo mostram `texto = formatarBRL(string original)`).
- Anel de progresso (cartão de destaque, aporte): **SVG próprio** `AnelProgresso` (dois `<circle>` com `stroke-dasharray`), não `RadialBarChart`. Motivo: é um número decorativo com arco fixo, sem eixo nem tooltip; o Recharts exigiria `ChartContainer` e ajustes de ângulo para o mesmo desenho. O arco recebe `percentual: string` da API (§7) e só o converte para desenhar.

### 6.7 Regra de estilo

- Estilo é **classe utilitária no JSX**, composta com `cn(...)` (variantes por `cva`). **Nenhum `.module.css` novo.** CSS fora do `tokens.css` só em último caso (animação específica) e dentro de `@layer`.
- Tela ou componente migrado: apaga o `.module.css` correspondente na mesma tarefa (§6.3). **No fim da árvore**: remove-se o último CSS Module, os apelidos `--cor-*`, `--raio`, `--espaco-*`, o `.alvo-toque` e o bloco de compatibilidade do `tokens.css` e o teste dos tokens antigos.
- Alvo de toque: `min-h-11 min-w-11` (44 px) em todo elemento interativo; o "+" tem 56 x 56 e as abas 44 x 48.
- Usar sempre as classes semânticas (`bg-card`, `text-muted-foreground`, `text-saida-texto`); nada de hex, `rgb()` ou `opacity-*` em JSX (a transparência vem das variáveis `branco-*` e `veu`).

### 6.8 O que não mudou
- **Tema claro/escuro** (RF-0.09, RF-1.12): atributo `data-tema="claro|escuro"` no `<html>`; os tokens trocam por seletor `:root[data-tema="escuro"]` (§6.2). Origem do valor: `usuario.tema` vindo de `GET /api/sessao`; antes do login, `prefers-color-scheme`. `TemaProvider` aplica o atributo e troca via `PATCH` do perfil (sem alteração).
- **Cores de significado** (RF-0.08): entrada menta (verde), saída coral (vermelho), alerta/atrasada âmbar (laranja), conforme §6.2. Nunca só cor (RNF-08): valor leva sinal ou rótulo ("Receita"/"Despesa") e a situação leva ícone **e** texto (`SituacaoIcone`: confirmada, prevista, atrasada).
- **Alvos de toque**: todo elemento interativo tem pelo menos 44 x 44 px (`min-h-11 min-w-11`, §6.7).
- **Largura**: layout fluido de 360 px para cima; `max-w-full` em imagens e gráficos; em telas largas o conteúdo e a barra inferior centram com `max-w-160` (640 px; não é requisito ter layout desktop). `box-sizing: border-box` já vem do preflight.
- **Gráficos**: `recharts` (descartados: Chart.js, que desenha em `canvas` e deixa o texto fora do DOM, pior para leitor de tela e para o rótulo com `formatarBRL`; SVG escrito à mão, mais código para rosca, área e barras) dentro de `ChartContainer` (§6.6); cores das categorias vêm do cadastro (`cor`); rosca sempre acompanhada de lista com valor e porcentagem (não depende só da cor).
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
- **`BottomSheet`**: folha inferior (`Sheet`, §10.2) com título, botão fechar de 44 px, corpo rolável e rodapé fixo com as ações; altura máxima `92dvh` no celular e, em tela larga, diálogo centralizado (a "tela cheia" anterior foi trocada pela folha do desenho). Trava a rolagem do fundo, foco preso dentro, `Esc` fecha, `role="dialog"` com `aria-modal` (agora vindos do Radix).
- **Campos essenciais visíveis; avançados atrás de "Mais detalhes"** (RF-0.05, CA-0.05): tags, observação e recorrência (e parcelada, no cartão) só montam depois do toque. Cada formulário declara no `fatia-N.md` quais campos são essenciais.
- **"Salvar" e "Salvar e criar nova"** (RF-0.06, CA-0.06): só em criação. "Salvar e criar nova" salva, invalida o cache, e reinicia o formulário com os valores de abertura padrão (dono, conta, data de hoje, situação por RF-2.16); "Salvar" fecha o sheet.
- **Erros** (RNF-09): `ApiError.campos` -> prop `erro` do `Campo` (mensagem abaixo do campo, ligada por `aria-describedby`); foco no primeiro campo com erro. Validação do cliente se limita a obrigatório e formato mínimo; a regra é do servidor.
- **Alcance** (RF-0.10, fatias 3 e 4): `DialogoAlcance` com as opções "Somente este", "Este e os pendentes", "Todos (incluindo confirmados)"; abre antes de editar/excluir **apenas** se o item vier marcado como recorrente ou parcelado pela API.
- **Biblioteca de formulário**: nenhuma. Motivo: cada formulário tem poucos campos controlados e a validação é do servidor; cada formulário usa `useState` e o helper `campos` do `ApiError`. Descartado: `react-hook-form` + `zod` (duplicaria no cliente as regras do servidor).

## 9. Acessibilidade e mobile (RNF-01, RNF-08)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (sem travar zoom; `viewport-fit=cover` deixa a barra inferior usar `env(safe-area-inset-bottom)` em telas com entalhe); `lang="pt-BR"`.
- Rótulo (`<label>`) em todo campo; botões só com ícone têm `aria-label` (ou texto `sr-only`, como as abas inativas da barra, §3); foco visível; o menu "+" e o bottom sheet são operáveis por teclado.
- **Foco visível em todo interativo**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background` (o `ring` tem razão >= 5,4:1 sobre o fundo nos dois temas); o `outline` padrão só é removido junto com esse anel. Campos usam também a sombra de foco (§6.4).
- **Camadas** (`Dialog`, `AlertDialog`, `Sheet`): foco preso, `Esc`, `aria-modal`, trava de rolagem e devolução do foco vêm do Radix; toda camada tem `Title` (visível ou `sr-only`) e `Description` ou `aria-describedby={undefined}` explícito (sem aviso do Radix); `AlertDialog` não fecha por toque no véu.
- Contraste conferido nos tokens dos dois temas (§6.2); verde/vermelho/laranja escolhidos separadamente para cada tema. Texto sobre o degradê roxo usa só `primary-foreground` (branco cheio, sem transparência); perto do canto `primary-claro` (4,10:1) só texto de 18 px bold ou maior, e por isso o cartão de destaque gira o degradê (§6.2).
- **Movimento**: as animações do `tw-animate-css` nas camadas e na barra respeitam `prefers-reduced-motion` (`motion-reduce:animate-none motion-reduce:transition-none` nos `Content` de `dialog`, `alert-dialog` e `sheet`).
- **Estado nunca só por cor** nos componentes novos: chip ligado e aba ativa mudam também de peso, forma ou ícone (visto no `ToggleGroupItem` ligado).
- Sem rolagem horizontal da página: cards, filtros (chips) e tabelas largas rolam dentro do próprio contêiner (`table.tsx` já traz o contêiner com `overflow-x-auto`); tabela de projeção usa esse contêiner.

## 10. Componentes de interface

Duas pastas, duas camadas (regra de importação em §2): `src/components/ui/` = primitivos shadcn (nome de arquivo em inglês, como o CLI gera, para poder comparar e atualizar) e `src/componentes/` = compostos do app (nome em português, props em português, como hoje). Os compostos **existentes mantêm nome de arquivo, exports e props** (os testes e as telas continuam chamando como hoje); só o interior passa a usar os primitivos e as classes de §6. O que é novo aparece abaixo com as props.

### 10.1 Primitivos (`src/components/ui/`)

| Arquivo | Base | Ajuste ao desenho |
|---|---|---|
| `button.tsx` | `Slot` + `cva` | `rounded-full`. Variantes: `default` (`bg-gradiente-botao text-primary-foreground shadow-roxa`), `secondary` (`bg-card text-primary-texto`, filete `border`), `outline` (`border-2 border-primary text-primary-texto`), `ghost`, `destructive` (`bg-destructive text-destructive-foreground`: coral com texto tinta), `link` (sublinhado). Tamanhos: `sm` 44, `default` 52, `lg` 56, `icon` 44 x 44 (`h-11`, `h-13`, `h-14`, `size-11`). `disabled:` usa `bg-disabled text-disabled-foreground shadow-none`, sem `opacity`. `asChild` para `Link`. |
| `badge.tsx` | `Slot` + `cva` | 24 de altura (`h-6`), pílula. Variantes `default` (`bg-primary`), `secondary` (`bg-primary-suave text-primary-texto`), `outline`, `destructive`, `entrada`, `alerta`, `info` (`bg-X-suave text-X-texto`). |
| `card.tsx` | div | `Card` (`rounded-xl border bg-card p-5 shadow-card`), `CardHeader`, `CardTitle` (`text-16 font-semibold`), `CardDescription`, `CardContent`, `CardFooter`. |
| `separator.tsx`, `label.tsx` | Radix | filete de 1 px em `border`; `Label` em `text-14 font-medium`. |
| `avatar.tsx` | Radix | `Avatar` com `tamanho` `sm` 32, `default` 40, `lg` 56; `AvatarFallback` com `tom` `primary` (pessoa A), `entrada` (pessoa B), `info`, `alerta` (fundo `X-suave`, iniciais em `X-texto`). Sem foto (não há upload). |
| `progress.tsx` | Radix | `tom` `primary`, `entrada`, `alerta`, `info`, `saida`; trilha `bg-X-suave`, indicador `bg-X`, 8 px (`h-2`) de altura, pílula. |
| `skeleton.tsx` | div | `animate-pulse rounded-md bg-primary-suave motion-reduce:animate-none`. |
| `toggle-group.tsx` | Radix | chips de filtro: `ToggleGroupItem` com 44 de altura, pílula; ligado `bg-primary text-primary-foreground font-semibold` **com ícone `Check`** (estado não só por cor), desligado `bg-card border`. `type="single"` e `"multiple"`. |
| `tabs.tsx` | Radix | `TabsList` pílula `h-13 bg-card border shadow-card p-1`; `TabsTrigger` 44 de altura, ativo `bg-primary text-primary-foreground font-semibold`. Exporta também as strings `tabsListClasses` e `tabsTriggerClasses` (mesmas classes) para `VisoesControle`, que é navegação por rota e não painel. |
| `input.tsx`, `textarea.tsx`, `select.tsx` | nativos | §6.4. `Select` = `<select>` nativo; data = `Input type="date"`. |
| `switch.tsx`, `checkbox.tsx`, `radio-group.tsx` | Radix | cores `primary`; alvo de 44 px pelo `label` que envolve; visto e ponto visíveis (não só cor). |
| `table.tsx` | HTML | `Table` dentro de contêiner `overflow-x-auto`; `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`; células numéricas `text-right tabular-nums`. |
| `dialog.tsx` | Radix | `DialogOverlay` `bg-veu`; `DialogContent` `rounded-2xl bg-popover shadow-overlay`, largura `w-[calc(100%-48px)] max-w-sm`, centralizado; botão fechar opcional (`aria-label="Fechar"`, 44 px). |
| `alert-dialog.tsx` | Radix | mesmo véu e contêiner; ícone em quadrado no alto (`circle-alert` em `primary-suave`, ou lixeira em `saida-suave` na variante destrutiva), título, descrição, ações em largura total (ação sobre `Cancelar`); sem botão fechar; não fecha por toque no véu. |
| `sheet.tsx` | Radix (`Dialog`) | só `side="bottom"` (as outras posições do shadcn são removidas: nenhuma tela as usa). `rounded-t-3xl bg-popover shadow-overlay`, alça no alto, `max-h-[92dvh] flex flex-col`; a partir de `sm:` (640 px) vira diálogo centralizado de `max-w-lg`. `SheetHeader` (título e fechar), `SheetFooter` fixo. |
| `chart.tsx` | Recharts 3 | §6.6: `ChartContainer`, `ChartConfig`, `ChartTooltip`, `ChartTooltipContent` ajustado. |

Tudo gerado pelo CLI fica sujeito a: remover `dark:*`, trocar hex e `opacity-*` por tokens, trocar `focus-visible:ring-[3px]` pelo anel de §9, garantir 44 px de alvo, `data-slot` mantido.

### 10.2 Compostos (`src/componentes/`)

| Composto do desenho | Arquivo | Situação | Base e nota |
|---|---|---|---|
| Ícone em quadrado | `IconeQuadrado.tsx` | **novo** | `div` `bg-X-suave text-X-texto`, ícone `aria-hidden`. Hoje: ícones soltos de `SituacaoIcone.tsx` e `ItemLancamento.tsx` |
| Chip de resumo | dentro de `CartaoDestaque.tsx` | **novo** (sem arquivo próprio) | `div` `rounded-lg bg-branco-18 text-primary-foreground`, 2 linhas (rótulo 11, valor 13 `tabular-nums`) |
| Título de bloco | `TituloBloco.tsx` | **novo** | `h2` `text-16 font-semibold` + ação opcional (substitui `h2.tituloBloco` de `inicio.module.css`) |
| Botão "+" e Aba | dentro de `BarraInferior.tsx` | existente | §3 |
| Barra inferior | `BarraInferior.tsx` | existente (props: nenhuma) | §3 |
| Cabeçalho de tela | `CabecalhoTela.tsx` | **novo** | `h1` por tela (hoje cada página tem o próprio título) |
| Seletor de mês | `SeletorMes.tsx` | existente (`{ mes, onMudar }`) | `Button secondary icon` nas setas |
| Cartão de destaque | `CartaoDestaque.tsx` | **novo** | manchete do Início; hoje é `CardsResumo.tsx` em tamanho grande |
| Anel de progresso | `AnelProgresso.tsx` | **novo** | SVG próprio (§6.6); usado por `CartaoDestaque` |
| Card de resumo | `CardsResumo.tsx` (export **novo** `CardResumo`) | existente + export | `CardsResumo({ children })` continua sendo o contêiner |
| Faixa de resumo | `CardsResumo.tsx` | existente | contêiner com rolagem (§3) |
| Item de lançamento | `ItemLancamento.tsx` | existente (props atuais) + 1 prop | `IconeQuadrado`, valor com `Dinheiro`, situação com `SituacaoIcone`, `Badge` para Recorrente e Tag |
| Item a confirmar | `ItemLancamento.tsx` | existente | prop nova `variante?: "lista" \| "confirmar"` (padrão `"lista"`): `"confirmar"` = cartão `bg-primary-suave` com `Button secondary sm` "Confirmar" (chama `aoConfirmar`) |
| Linha de pessoa | `CardsProporcao.tsx` | existente (`{ proporcao, acaoPessoa }`) | `Avatar` + nome, apoio, valor; `Progress` |
| Estado vazio | `EstadoVazio.tsx` | existente (`{ frase, acaoRotulo?, onAcao? }`) + 2 props | `icone?: LucideIcon` e `compacto?: boolean` (compacto: sem halos e sem botão, só ícone em quadrado e frase) |
| Opção do menu "+" e Menu "+" | `MenuMais.tsx` | existente (`{ aoFechar }`) | `BottomSheet` com 4 linhas de 64 px (`IconeQuadrado`, rótulo 16 semibold, seta `ChevronRight`) |
| Menu de cadastros | `MenuCadastros.tsx` | **novo** | `BottomSheet` com 3 linhas-link (§3 Controle) |
| Visões do Controle | `VisoesControle.tsx` | **novo** | `nav` de `NavLink`s com as classes de `tabs.tsx` (§3 Controle) |
| Bottom sheet | `BottomSheet.tsx` | existente (`{ titulo, aoFechar, rodape?, children }`) | `Sheet` (§10.3) |
| Diálogo de confirmação | `DialogoConfirmacao.tsx` | existente + 1 prop | `AlertDialog` (§10.3) |
| Diálogo de alcance | `DialogoAlcance.tsx` | existente (props atuais) | continua sobre `BottomSheet` (lista de 3 opções e Cancelar); só o visual muda |
| Gráficos | `GraficoArea.tsx`, `GraficoBarras.tsx`, `GraficoRosca.tsx` | existentes (props atuais) | `ChartContainer` (§6.6); `GraficoRosca` mantém a lista com valor e porcentagem |

Também ficam, com o interior em Tailwind e as mesmas props: `Campo`, `Dinheiro`, `SituacaoIcone`, `FiltrosLista` (chips viram `ToggleGroup`, `type="multiple"`), `ListaLancamentos`, `CardCartao`, `CardConta`, `CardMeta`, `ItemFaturaLinha`, `SeletorCor`, `SeletorIcone`, `RotaProtegida`, `Shell`. As linhas de balanço, o mês previsto e o card de fatura do Início são montagem da própria tela (`BlocosAnalise.tsx`), não compostos compartilhados.

**Props dos novos** (todas em português; sem `any`; dinheiro sempre `string` decimal da API, formatado dentro do componente com `formatarBRL`, §7):

- `IconeQuadrado({ icone: LucideIcon; tom?: "primaria" | "entrada" | "saida" | "alerta" | "info"; tamanho?: "default" | "sm"; className?: string })`: padrão `tom` `"primaria"`, `tamanho` `"default"` (40 px, `rounded-md`) ou `"sm"` (32 px, `rounded-sm`). Tons: `primary-suave`/`primary-texto`, `entrada-suave`/`entrada-texto`, `saida-suave`/`saida-texto`, `alerta-suave`/`alerta-texto`, `info-suave`/`info-texto`.
- `TituloBloco({ titulo: string; acaoRotulo?: string; acaoPara?: string; onAcao?: () => void })`: com `acaoPara` a ação é um `Link` (ex.: "Ver projeção" para `/projecao`); com `onAcao`, um botão; sem nenhum dos dois, sem ação. Ação com 44 px de altura, texto `text-primary-texto` e seta `ArrowRight`.
- `CabecalhoTela({ titulo: string; voltarPara?: string; acao?: ReactNode })`: com `voltarPara` mostra o botão circular "Voltar" (um `Link`, `Button secondary icon`, `aria-label="Voltar"`) e centraliza o título em 18; sem ele, título de 22 à esquerda. `acao` recebe o elemento pronto (um `Button variant="ghost" size="sm"` com o rótulo, ou um `Button secondary icon` com `aria-label`, como a engrenagem "Configurações"). Altura fixa de 44 px mesmo sem ação.
- `CartaoDestaque({ rotulo: string; valor: string; chips: { rotulo: string; valor: string }[]; anel?: { percentual: string; rotulo: string } })`: `chips` tem 1 a 3 itens (rótulos curtos: nomes e "Faturas do mês"). Sem `anel`, o número é `text-40 font-bold`; com `anel`, `text-28` e o `AnelProgresso` à direita (trilha `branco-18`, arco `alerta`, texto branco). Fundo `bg-linear-to-bl from-primary-claro to-primary-escuro`, `rounded-3xl`, `shadow-destaque`, círculos decorativos `bg-branco-12` (`aria-hidden`), texto `text-primary-foreground`.
- `AnelProgresso({ percentual: string; rotulo: string; fundo?: "card" | "destaque" })`: SVG 120 x 120 com `role="img"` e `aria-label` `"<rotulo>: <percentual>%"`; `percentual` é a string da API, convertido só para o arco (clamp 0 a 100). `fundo` `"card"`: trilha `primary-suave`, arco `primary`; `"destaque"`: trilha `branco-18`, arco `alerta`.
- `CardResumo({ rotulo: string; valor: string; apoio?: string; tom?: "neutro" | "entrada" | "saida" | "alerta"; icone?: LucideIcon; aoAbrir?: () => void })`: 144 px de largura; `IconeQuadrado` `sm` (neutro usa `primaria`), rótulo `text-13`, valor `text-16 font-bold tabular-nums` na cor `X-texto` do tom (neutro em `foreground`), apoio `text-13 text-muted-foreground`. Com `aoAbrir` o card inteiro é um `button` (sem botão interno); sem ele, `div`.
- `VisoesControle({ mes: string })`: lê a rota atual; 4 `NavLink` (`/controle`, `/controle/balanco`, `/controle/proporcao`, `/controle/relatorios`) com `?mes=${mes}`; `end` em `/controle`; `aria-label="Visões do controle"`; o ativo leva `aria-current="page"` e as classes de `TabsTrigger` ativo. Rótulos: Lista, Balanço, Proporção, Relatórios.
- `MenuCadastros({ aoFechar: () => void })`: `BottomSheet` com título "Cadastros" e 3 linhas-link para `/controle/contas`, `/controle/categorias`, `/controle/tags` (ícones `Wallet`, `Tag`, `Tags` ou os já mapeados em `icones.ts`); tocar chama `aoFechar` e navega.
- `DialogoConfirmacao`: prop nova `destrutivo?: boolean` (padrão `false`): `true` usa o ícone de lixeira, `bg-saida-suave`, e ação coral (`Button destructive`); `false`, ícone `circle-alert` e ação `default`. `aria-label` e textos de `titulo`, `texto`, `rotuloAcao` iguais aos atuais.

### 10.3 Camadas: como as existentes viram Radix

- **`BottomSheet`**: o JSX vira `<Sheet open onOpenChange={(a) => !a && aoFechar()}><SheetContent side="bottom" aria-describedby={undefined}>` com `SheetHeader` (título e fechar `aria-label="Fechar"`), corpo rolável e `SheetFooter` com o `rodape`. O componente continua **montado só quando aberto** (as telas fazem `{aberto && <BottomSheet .../>}`; `open` fixo em `true`). **Sai do código** o que o Radix faz: armadilha de foco, `Esc`, trava de rolagem, devolução do foco, `aria-modal`. **Fica** o comportamento do botão voltar, extraído para `hooks/useFecharComVoltar.ts` (`useFecharComVoltar(aoFechar)`: `history.pushState({ bottomSheet: true })` ao montar, `popstate` fecha, ao desmontar por outro caminho faz `history.back()`), idêntico ao de hoje. Camadas aninhadas (formulário que abre `DialogoAlcance`) continuam funcionando: o Radix empilha, e cada uma tem a própria entrada no histórico, como hoje.
- **`DialogoConfirmacao`** sobre `AlertDialog` (`open` fixo, `onOpenChange` fechando com `onCancelar`); `Cancelar` e a ação chamam `onCancelar` e `onConfirmar`. Também usa `useFecharComVoltar(onCancelar)`: o botão voltar do aparelho fecha a confirmação em vez de sair da tela. Motivo da troca de `BottomSheet` para `AlertDialog`: o desenho distingue confirmação (centralizada, sem fechar por toque no véu, ação destrutiva em coral) de folha de formulário.
- **`MenuMais`** e **`MenuCadastros`** usam `BottomSheet` (que já é o `Sheet` com o comportamento de voltar), sem `Sheet` direto: evita repetir o hook e o contorno.
- Z-order: barra inferior `z-40`, véu e conteúdo das camadas `z-50` (as camadas cobrem a barra).
- Testes que dependem do jsdom: o Radix usa `ResizeObserver` (Checkbox, Switch, RadioGroup) e o `PointerEvent`; o ambiente de teste precisa de um stub de `ResizeObserver`. O ajuste dos testes é da etapa de testes do front, não destas unidades.

### 10.4 Unidades de implementação (cada uma fecha com `tsc --noEmit` e `eslint .` limpos)

| Unidade | Faz | Arquivos | Pronto quando |
|---|---|---|---|
| U1 Fundação | pacotes (`comum.md` §2.3), plugin do Tailwind, alias `@/`, `components.json`, `cn`, `tokens.css` novo com os apelidos de §6.3, Geist | `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `components.json`, `src/lib/utils.ts`, `src/tema/tokens.css`, `src/main.tsx` | `npm run build` passa; o app abre com a paleta e a fonte novas nas telas antigas; `tema.test.tsx` passa |
| U2 Primitivos | `button`, `badge`, `card`, `separator`, `label`, `avatar`, `progress`, `skeleton`, `toggle-group`, `tabs`, `input`, `textarea`, `select`, `switch`, `checkbox`, `radio-group`, `table` | `src/components/ui/*.tsx` (17 arquivos) | sem `dark:`, sem hex e sem `opacity-*`; variantes do §10.1; depende de U1 |
| U3 Camadas e gráfico | `dialog`, `alert-dialog`, `sheet`, `chart`; `useFecharComVoltar` | `src/components/ui/{dialog,alert-dialog,sheet,chart}.tsx`, `src/hooks/useFecharComVoltar.ts` | `Sheet` só com `side="bottom"`; descrição ou `aria-describedby={undefined}` em toda camada; depende de U1 |
| U4 Compostos de base | `IconeQuadrado`, `TituloBloco`, `CabecalhoTela`, `AnelProgresso`, `CartaoDestaque`, `CardResumo` e `CardsResumo`, `EstadoVazio`, `ItemLancamento` (+ `variante`), `CardsProporcao`, `SeletorMes`, `Campo`, `Dinheiro`, `SituacaoIcone`, gráficos | `src/componentes/*.tsx` (e apagar os `.module.css` dos que migram) | props de §10.2; `tabular-nums` nos valores; depende de U2 e U3 |
| U5 Camadas do app | `BottomSheet`, `DialogoConfirmacao`, `DialogoAlcance`, `MenuMais`, `MenuCadastros` | `src/componentes/{BottomSheet,DialogoConfirmacao,DialogoAlcance,MenuMais,MenuCadastros}.tsx`, `bottomSheet.module.css` removido | voltar do aparelho, `Esc` e foco como §10.3; depende de U3 e U4 |
| U6 Navegação | `BarraInferior`, `Shell`, `VisoesControle`, e o `Controle.tsx` com cabeçalho, visões e Cadastros | `src/componentes/{BarraInferior,Shell,VisoesControle}.tsx`, `src/paginas/controle/Controle.tsx`, `navegacao.module.css` e `shell.module.css` removidos | 5 abas e "+" a 360 px sem rolagem horizontal; respiro de 144 px; visões com `?mes`; sem atalho de Projeção no Controle; depende de U4 e U5 |

As telas por área (Início, Controle, Cartões, Metas, Planejamento, Configurações, Entrada) e a remoção final de §6.7 são unidades seguintes, planejadas por área depois de U6; cada uma só usa o que U1 a U6 entregam.

### 10.5 Riscos

- **Preflight x CSS Modules** (§6.3): margens e marcadores de lista podem mudar nas telas ainda não migradas; correção é por tela.
- **`--cor-primaria` no escuro** (§6.3): 2 usos como fundo com texto claro.
- **CLI do shadcn** pode sobrescrever variáveis do `tokens.css` ou trazer classes `dark:` e estilo neutro: conferir o diff a cada `add`.
- **Barra fixa e teclado virtual**: em alguns Android a barra sobe junto com o teclado e cobre o campo focado das telas fora de camada (ex.: senha em Configurações); mitigação a avaliar no teste em aparelho: esconder a barra enquanto um campo tem foco.
- **Testes**: trocar o `BottomSheet` e os controles por Radix e as abas por pílulas quebra consultas por papel e texto (ex.: `aria-modal`, nome do botão "+"); o conserto fica para a etapa de testes do front. Nomes acessíveis atuais ("Novo lançamento", "mês anterior", "Fechar") foram mantidos de propósito para reduzir esse conserto.
