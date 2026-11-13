import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { ApiError } from '../api/cliente'
import type { Sessao } from '../api/sessao'
import { useMes } from './useMes'
import { useSessao } from './useSessao'

const fetchMock = vi.fn()
const sessao: Sessao = {
  usuario: { id: 1, nome: 'A', email: 'a@x', tema: 'claro' },
  hoje: '2026-10-29',
  casal: null,
}

function ok(corpo: unknown) {
  return { ok: true, status: 200, json: async () => corpo } as unknown as Response
}
function erro401() {
  return {
    ok: false,
    status: 401,
    json: async () => ({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Entre' } }),
  } as unknown as Response
}

let client: QueryClient
function montar(url = '/') {
  client = new QueryClient()
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return Wrapper
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSessao', () => {
  it('carrega a sessão e guarda sob a chave ["sessao"]', async () => {
    fetchMock.mockResolvedValue(ok(sessao))
    const { result } = renderHook(() => useSessao(), { wrapper: montar() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(sessao)
    expect(client.getQueryData(['sessao'])).toEqual(sessao)
  })

  it('401 vira erro ApiError sem repetir a chamada', async () => {
    fetchMock.mockResolvedValue(erro401())
    const { result } = renderHook(() => useSessao(), { wrapper: montar() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('useMes', () => {
  function useMesComLocal() {
    const r = useMes()
    const loc = useLocation()
    return { ...r, search: loc.search }
  }

  it('lê ?mes=AAAA-MM da URL', async () => {
    fetchMock.mockResolvedValue(ok(sessao))
    const { result } = renderHook(() => useMes(), { wrapper: montar('/?mes=2026-03') })
    expect(result.current.mes).toBe('2026-03')
  })

  it('sem parâmetro usa o mês de sessao.hoje; antes da sessão é vazio', async () => {
    fetchMock.mockResolvedValue(ok(sessao))
    const { result } = renderHook(() => useMes(), { wrapper: montar('/') })
    expect(result.current.mes).toBe('')
    await waitFor(() => expect(result.current.mes).toBe('2026-10'))
  })

  it('parâmetro inválido cai no mês de hoje', async () => {
    fetchMock.mockResolvedValue(ok(sessao))
    const { result } = renderHook(() => useMes(), { wrapper: montar('/?mes=2026-13') })
    await waitFor(() => expect(result.current.mes).toBe('2026-10'))
  })

  it('setMes altera mes e preserva os demais parâmetros', async () => {
    fetchMock.mockResolvedValue(ok(sessao))
    const { result } = renderHook(() => useMesComLocal(), {
      wrapper: montar('/?mes=2026-03&filtro=abc'),
    })
    act(() => result.current.setMes('2026-04'))
    await waitFor(() => expect(result.current.mes).toBe('2026-04'))
    const params = new URLSearchParams(result.current.search)
    expect(params.get('mes')).toBe('2026-04')
    expect(params.get('filtro')).toBe('abc')
  })
})
