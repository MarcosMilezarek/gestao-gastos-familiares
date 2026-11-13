# Arquitetura: índice

Requisitos: `docs/requisitos.md`. Cada arquivo guarda só o que é dele; regra comum mudou: edita-se `comum.md`, não se copia. A numeração das seções (`§N.N`) é estável para as referências valerem.

| Arquivo | Conteúdo | Estado |
|---|---|---|
| `comum.md` | §1 stack e decisões · §2 versões e pacotes · §3 pastas e camadas · §4 convenções do modelo físico · §5 visão geral do modelo de dados · §6 convenções da API (dinheiro, erros e códigos) · §7 sessão, autenticação, autorização · §8 configuração · §9 validação bruta e como subir · §12 estratégia de testes · §13 riscos · §14 cobertura de RF-0/RNF | pronto |
| `front.md` | §1 visão · §2 estrutura de `src/` · §3 navegação mobile first · §4 rotas · §5 estado · §6 estilo e tema · §7 formatação de R$ e datas · §8 formulários de lançamento · §9 acessibilidade | pronto |
| `fatia-1.md` | Cadastro, login e vínculo do casal: tabelas e migrações, rotas, services, telas | pronto |
| `fatia-2.md` | Contas, categorias, tags e lançamentos | pronto |
| `fatia-3.md` | Recorrências, proporção do mês e aporte | pronto |
| `fatia-4.md` | Cartão de crédito e fatura | pronto |
| `fatia-5.md` | Balanço, lista com filtros, tela inicial, projeção e relatórios | pronto |
| `fatia-6.md` | Metas e patrimônio | pronto |
| `fatia-7.md` | Planejamento (orçamento, cenários, plano de metas) | pronto |

Cada `fatia-N.md` segue a mesma ordem: §1 escopo e RF cobertos · §2 tabelas e migrações · §3 contratos das rotas (com códigos de erro) · §4 regras dos services · §5 telas · §6 decisões e riscos da fatia.
