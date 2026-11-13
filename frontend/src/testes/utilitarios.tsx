/*
 * Utilitários de teste do front (import único para os testes de tela).
 *
 * Uso típico:
 *
 *   import { renderizarApp, simularApi, json, limparTudo } from '../testes/utilitarios'
 *
 *   afterEach(limparTudo)
 *
 *   it('lista contas', async () => {
 *     const api = simularApi({
 *       'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
 *       'POST /api/contas': ({ corpo }) => json({ ...(corpo as object), id: 1 }, 201),
 *     })
 *     const { user } = renderizarApp('/controle/contas')
 *     await screen.findByRole('heading', { name: 'Contas' })
 *     expect(api.chamadasDe('GET /api/contas')).toHaveLength(1)
 *   })
 *
 * Contrato:
 * - simularApi(rotas, { sessao? }): faz vi.stubGlobal('fetch', ...). Chaves "METODO /caminho" (caminho SEM
 *   querystring). Valor: Resposta fixa ou função ({ metodo, caminho, params, corpo }) => Resposta | Promise<Resposta>.
 *   Função que lança erro faz o fetch rejeitar (simula falha de rede).
 *   GET /api/sessao responde SESSAO_PADRAO por padrão; { sessao: null } responde 401; uma chave
 *   "GET /api/sessao" em `rotas` tem precedência. Rota sem handler responde 404 com
 *   { erro: { codigo: "NAO_SIMULADA", mensagem } } e fica registrada em `chamadas`.
 *   Devolve { chamadas, chamadasDe(chave) }; cada chamada: { metodo, caminho, params, corpo, chave }.
 * - Construtores de resposta: json(corpo, status = 200), erroApi(status, codigo, mensagem, campos?), semConteudo().
 * - renderizarApp(rota, { sessao?, cliente? }): <App /> em QueryClientProvider + MemoryRouter + TemaProvider (como main.tsx;
 *   simula window.matchMedia, ausente no jsdom). Devolve o
 *   resultado do render + { cliente, user } (user-event). `sessao` semeia o cache da sessão.
 * - fixarHoje('AAAA-MM-DD'): congela só Date (vi.useFakeTimers({ toFake: ['Date'] })).
 * - simularResizeObserver(): ResizeObserver mínimo para o recharts em jsdom.
 * - limparTudo(): cleanup + vi.unstubAllGlobals() + vi.useRealTimers(); use em afterEach.
 */
import { render, cleanup, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import App from '../App'
import type { Sessao } from '../api/sessao'
import { TemaProvider } from '../tema/TemaProvider'

export const SESSAO_PADRAO: Sessao = {
  usuario: { id: 1, nome: 'Ana', email: 'ana@exemplo.com', tema: 'claro' },
  hoje: '2026-10-15',
  casal: { id: 1, parceiro: { id: 2, nome: 'Bruno' } },
}

export type Resposta = { status: number; corpo?: unknown }

export type Chamada = {
  chave: string
  metodo: string
  caminho: string
  params: Record<string, string>
  corpo: unknown
}

export type Handler = Resposta | ((chamada: Chamada) => Resposta | Promise<Resposta>)

export function json(corpo: unknown, status = 200): Resposta {
  return { status, corpo }
}

export function erroApi(
  status: number,
  codigo: string,
  mensagem: string,
  campos?: Record<string, string>,
): Resposta {
  return { status, corpo: { erro: { codigo, mensagem, ...(campos ? { campos } : {}) } } }
}

export function semConteudo(): Resposta {
  return { status: 204 }
}

export function criarClienteDeTeste(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

export function simularApi(
  rotas: Record<string, Handler>,
  opcoes: { sessao?: Sessao | null } = {},
) {
  const sessao = opcoes.sessao === undefined ? SESSAO_PADRAO : opcoes.sessao
  const handlers: Record<string, Handler> = {
    'GET /api/sessao':
      sessao === null ? erroApi(401, 'NAO_AUTENTICADO', 'Sessão inválida.') : json(sessao),
    ...rotas,
  }
  const chamadas: Chamada[] = []

  const falso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const texto = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const url = new URL(texto, 'http://localhost')
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const corpoBruto = typeof init?.body === 'string' ? init.body : undefined
    const chamada: Chamada = {
      chave: `${metodo} ${url.pathname}`,
      metodo,
      caminho: url.pathname,
      params: Object.fromEntries(url.searchParams.entries()),
      corpo: corpoBruto === undefined ? undefined : JSON.parse(corpoBruto),
    }
    chamadas.push(chamada)

    const handler = handlers[chamada.chave]
    const resposta: Resposta =
      handler === undefined
        ? erroApi(404, 'NAO_SIMULADA', `Rota não simulada: ${chamada.chave}`)
        : typeof handler === 'function'
          ? await handler(chamada)
          : handler
    return new Response(
      resposta.status === 204 || resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo),
      { status: resposta.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  vi.stubGlobal('fetch', vi.fn(falso))
  return {
    chamadas,
    chamadasDe: (chave: string) => chamadas.filter((c) => c.chave === chave),
  }
}

export function renderizarApp(
  rota: string,
  opcoes: { sessao?: Sessao; cliente?: QueryClient } = {},
): RenderResult & { cliente: QueryClient; user: ReturnType<typeof userEvent.setup> } {
  const cliente = opcoes.cliente ?? criarClienteDeTeste()
  // jsdom não tem matchMedia; o TemaProvider (como em main.tsx) o consulta enquanto a sessão carrega.
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: false,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  }
  if (opcoes.sessao) cliente.setQueryData(['sessao'], opcoes.sessao)
  const resultado = render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[rota]}>
        <TemaProvider>
          <App />
        </TemaProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...resultado, cliente, user: userEvent.setup() }
}

export function fixarHoje(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${iso}T12:00:00`))
}

export function simularResizeObserver() {
  class ResizeObserverFalso {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso)
}

export function limparTudo() {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
}
