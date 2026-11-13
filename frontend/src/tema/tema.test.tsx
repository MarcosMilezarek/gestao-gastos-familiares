import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { TemaProvider, useTema } from './TemaProvider'

const fetchMock = vi.fn()

function ok(tema: 'claro' | 'escuro') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      usuario: { id: 1, nome: 'A', email: 'a@x', tema },
      hoje: '2026-10-29',
      casal: null,
    }),
  } as unknown as Response
}
function nao() {
  return {
    ok: false,
    status: 401,
    json: async () => ({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'x' } }),
  } as unknown as Response
}

function simularMatchMedia(escuro: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: escuro && q.includes('dark'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }))
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient()
  return (
    <QueryClientProvider client={client}>
      <TemaProvider>{children}</TemaProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  delete document.documentElement.dataset.tema
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TemaProvider', () => {
  it('aplica usuario.tema no data-tema do html', async () => {
    simularMatchMedia(false)
    fetchMock.mockResolvedValue(ok('escuro'))
    renderHook(() => useTema(), { wrapper })
    await waitFor(() => expect(document.documentElement.dataset.tema).toBe('escuro'))
  })

  it('sem sessão e sistema escuro, usa escuro', async () => {
    simularMatchMedia(true)
    fetchMock.mockResolvedValue(nao())
    const { result } = renderHook(() => useTema(), { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.tema).toBe('escuro')
    expect(document.documentElement.dataset.tema).toBe('escuro')
  })

  it('sem sessão e sistema claro, usa claro', async () => {
    simularMatchMedia(false)
    fetchMock.mockResolvedValue(nao())
    const { result } = renderHook(() => useTema(), { wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.tema).toBe('claro')
    expect(document.documentElement.dataset.tema).toBe('claro')
  })

  it('aplicar troca o atributo data-tema', async () => {
    simularMatchMedia(false)
    fetchMock.mockResolvedValue(ok('escuro'))
    const { result } = renderHook(() => useTema(), { wrapper })
    // O perfil do usuário (escuro) só aparece com a sessão carregada; só então a escolha é aplicada.
    await waitFor(() => expect(document.documentElement.dataset.tema).toBe('escuro'))
    act(() => result.current.aplicar('claro'))
    await waitFor(() => expect(document.documentElement.dataset.tema).toBe('claro'))
    expect(result.current.tema).toBe('claro')
  })

  it('useTema fora do provider lança erro', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTema())).toThrow(/TemaProvider/)
    espiao.mockRestore()
  })
})

describe('tokens.css', () => {
  let css = ''
  beforeAll(async () => {
    // Vitest não processa CSS (import devolve vazio): lê o arquivo do disco.
    // Nome do módulo montado em runtime porque o projeto não tem @types/node.
    const fs = await import(/* @vite-ignore */ ['node', 'fs'].join(':'))
    const { process } = globalThis as unknown as { process: { cwd(): string } }
    const caminho = `${process.cwd()}/src/tema/tokens.css`
    css = fs.readFileSync(caminho, 'utf8') as string
  })
  const bloco = (seletor: string) => {
    const i = css.indexOf(seletor)
    return css.slice(i, css.indexOf('}', i))
  }
  const cores = ['fundo', 'superficie', 'texto', 'texto-suave', 'borda', 'primaria', 'entrada', 'saida', 'alerta']

  it.each(cores)('define --cor-%s nos temas claro e escuro', (nome) => {
    expect(bloco(':root {')).toContain(`--cor-${nome}:`)
    expect(bloco(':root[data-tema="escuro"] {')).toContain(`--cor-${nome}:`)
  })

  it('define tokens de forma e espaço', () => {
    const raiz = bloco(':root {')
    for (const t of ['--raio', '--espaco-1', '--espaco-2', '--espaco-3', '--espaco-4', '--espaco-5', '--espaco-6', '--altura-barra']) {
      expect(raiz).toContain(`${t}:`)
    }
    expect(raiz).toMatch(/--alvo-min:\s*44px/)
  })

  it('tem a classe utilitária de alvo de toque', () => {
    expect(css).toMatch(/\.alvo-toque\s*\{[^}]*var\(--alvo-min\)/)
  })
})
