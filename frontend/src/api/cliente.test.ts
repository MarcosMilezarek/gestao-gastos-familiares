import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, cliente } from './cliente'
import { obterSessao } from './sessao'

const fetchMock = vi.fn()

function resposta(status: number, corpo?: unknown, json = true): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: json ? async () => corpo : async () => { throw new SyntaxError('sem json') },
  } as unknown as Response
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cliente', () => {
  it('get envia same-origin, sem corpo e sem Content-Type', async () => {
    fetchMock.mockResolvedValue(resposta(200, { a: 1 }))
    await expect(cliente.get('/api/x')).resolves.toEqual({ a: 1 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/x')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })

  it.each([
    ['post', 'POST'],
    ['patch', 'PATCH'],
    ['del', 'DELETE'],
  ] as const)('%s envia JSON e Content-Type quando há corpo', async (fn, metodo) => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true }))
    await cliente[fn]('/api/y', { nome: 'x' })
    const init = fetchMock.mock.calls[0]![1]
    expect(init.method).toBe(metodo)
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"nome":"x"}')
  })

  it('post sem corpo não manda Content-Type nem body', async () => {
    fetchMock.mockResolvedValue(resposta(200, {}))
    await cliente.post('/api/z')
    const init = fetchMock.mock.calls[0]![1]
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('erro 4xx vira ApiError a partir de {erro:{...}}', async () => {
    fetchMock.mockResolvedValue(
      resposta(422, {
        erro: { codigo: 'VALIDACAO', mensagem: 'Dados inválidos', campos: { valor: 'obrigatório' } },
      }),
    )
    const erro = await cliente.post('/api/x', {}).then(
      () => { throw new Error('deveria falhar') },
      (e: unknown) => e as ApiError,
    )
    expect(erro).toBeInstanceOf(ApiError)
    expect(erro.status).toBe(422)
    expect(erro.codigo).toBe('VALIDACAO')
    expect(erro.mensagem).toBe('Dados inválidos')
    expect(erro.message).toBe('Dados inválidos')
    expect(erro.campos).toEqual({ valor: 'obrigatório' })
  })

  it('erro sem corpo JSON vira ApiError genérico', async () => {
    fetchMock.mockResolvedValue(resposta(500, undefined, false))
    const erro = await cliente.get('/api/x').then(
      () => { throw new Error('deveria falhar') },
      (e: unknown) => e as ApiError,
    )
    expect(erro).toBeInstanceOf(ApiError)
    expect(erro.status).toBe(500)
    expect(erro.codigo).toBe('ERRO_INTERNO')
    expect(erro.campos).toBeUndefined()
  })

  it('erro com JSON sem chave erro usa valores padrão', async () => {
    fetchMock.mockResolvedValue(resposta(404, {}))
    const erro = await cliente.get('/api/x').then(
      () => { throw new Error('deveria falhar') },
      (e: unknown) => e as ApiError,
    )
    expect(erro.codigo).toBe('ERRO_INTERNO')
    expect(erro.status).toBe(404)
  })

  it('204 devolve undefined sem ler o corpo', async () => {
    const res = resposta(204, undefined, false)
    fetchMock.mockResolvedValue(res)
    await expect(cliente.del('/api/x')).resolves.toBeUndefined()
  })
})

describe('obterSessao', () => {
  it('chama GET /api/sessao e devolve a sessão', async () => {
    const sessao = { usuario: { id: 1, nome: 'A', email: 'a@x', tema: 'claro' }, hoje: '2026-10-29', casal: null }
    fetchMock.mockResolvedValue(resposta(200, sessao))
    await expect(obterSessao()).resolves.toEqual(sessao)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/sessao')
    expect(fetchMock.mock.calls[0]![1].method).toBe('GET')
  })
})
