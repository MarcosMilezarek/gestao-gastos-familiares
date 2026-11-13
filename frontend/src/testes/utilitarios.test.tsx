import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import {
  SESSAO_PADRAO,
  criarClienteDeTeste,
  erroApi,
  fixarHoje,
  json,
  limparTudo,
  renderizarApp,
  semConteudo,
  simularApi,
  simularResizeObserver,
} from './utilitarios'

afterEach(limparTudo)

describe('simularApi', () => {
  it('responde a sessão padrão (usuário A com casal, hoje fixo)', async () => {
    simularApi({})
    const res = await fetch('/api/sessao')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(SESSAO_PADRAO)
    expect(SESSAO_PADRAO.hoje).toBe('2026-10-15')
    expect(SESSAO_PADRAO.casal).not.toBeNull()
  })

  it('com sessao: null responde 401', async () => {
    simularApi({}, { sessao: null })
    const res = await fetch('/api/sessao')
    expect(res.status).toBe(401)
  })

  it('rota sem handler responde 404 NAO_SIMULADA e fica em chamadas', async () => {
    const api = simularApi({})
    const res = await fetch('/api/contas')
    expect(res.status).toBe(404)
    expect((await res.json()).erro.codigo).toBe('NAO_SIMULADA')
    expect(api.chamadasDe('GET /api/contas')).toHaveLength(1)
  })

  it('registra método, caminho sem querystring, params e corpo; função recebe a chamada', async () => {
    const api = simularApi({
      'POST /api/contas': ({ corpo, params }) => json({ corpo, params }, 201),
      'GET /api/lancamentos': json({ itens: [] }),
    })
    const res = await fetch('/api/contas?mes=2026-10', {
      method: 'POST',
      body: JSON.stringify({ nome: 'X' }),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ corpo: { nome: 'X' }, params: { mes: '2026-10' } })
    await fetch('/api/lancamentos?mes=2026-10')
    expect(api.chamadas.map((c) => c.chave)).toEqual(['POST /api/contas', 'GET /api/lancamentos'])
    expect(api.chamadasDe('POST /api/contas')[0]).toMatchObject({
      metodo: 'POST',
      caminho: '/api/contas',
      params: { mes: '2026-10' },
      corpo: { nome: 'X' },
    })
  })

  it('erroApi monta o envelope de erro e semConteudo responde 204', async () => {
    simularApi({
      'GET /api/a': erroApi(422, 'VALIDACAO', 'Inválido.', { nome: 'Obrigatório' }),
      'DELETE /api/b': semConteudo(),
    })
    const erro = await fetch('/api/a')
    expect(erro.status).toBe(422)
    expect(await erro.json()).toEqual({
      erro: { codigo: 'VALIDACAO', mensagem: 'Inválido.', campos: { nome: 'Obrigatório' } },
    })
    const vazio = await fetch('/api/b', { method: 'DELETE' })
    expect(vazio.status).toBe(204)
  })

  it('handler que lança faz o fetch rejeitar', async () => {
    simularApi({
      'GET /api/x': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await expect(fetch('/api/x')).rejects.toThrow('Failed to fetch')
  })
})

describe('renderizarApp', () => {
  it('renderiza o App com sessão simulada e devolve cliente e user', async () => {
    simularApi({})
    const { cliente, user } = renderizarApp('/qualquer-coisa')
    expect(await screen.findByText('Página não encontrada.')).toBeInTheDocument()
    expect(cliente.getQueryData(['sessao'])).toEqual(SESSAO_PADRAO)
    expect(typeof user.click).toBe('function')
  })

  it('criarClienteDeTeste desliga o retry', () => {
    expect(criarClienteDeTeste().getDefaultOptions().queries?.retry).toBe(false)
  })
})

describe('ambiente', () => {
  it('fixarHoje congela Date e limparTudo restaura o relógio real', () => {
    fixarHoje('2026-10-15')
    expect(new Date().getFullYear()).toBe(2026)
    expect(new Date().getMonth()).toBe(9)
    expect(vi.isFakeTimers()).toBe(true)
    limparTudo()
    expect(vi.isFakeTimers()).toBe(false)
  })

  it('simularResizeObserver define ResizeObserver utilizável e limparTudo o remove', () => {
    const antes = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    simularResizeObserver()
    const ro = new ResizeObserver(() => {})
    ro.observe(document.body)
    ro.disconnect()
    limparTudo()
    expect((globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBe(antes)
  })
})
