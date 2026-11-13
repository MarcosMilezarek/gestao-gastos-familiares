import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { json, limparTudo, renderizarApp, simularApi } from './testes/utilitarios'

afterEach(limparTudo)

describe('App', () => {
  it('com sessão válida mostra o Início dentro do Shell, sem o placeholder', async () => {
    simularApi({})
    renderizarApp('/')
    expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent('ainda não está disponível')
  })

  it('na rota / mostra a barra inferior com 5 abas e o botão "+"', async () => {
    simularApi({})
    renderizarApp('/')
    const barra = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(barra).getAllByRole('link')).toHaveLength(5)
    expect(within(barra).getByRole('button', { name: 'Novo lançamento' })).toBeInTheDocument()
  })

  it('rota desconhecida mostra o 404 com link para o início, ainda dentro do Shell', async () => {
    simularApi({})
    renderizarApp('/nao-existe')
    expect(await screen.findByText('Página não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Página não encontrada.')
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })

  it('sem sessão (401) redireciona para /entrar', async () => {
    simularApi({}, { sessao: null })
    renderizarApp('/')
    await waitFor(() => expect(screen.queryByRole('main')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /entrar/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument()
  })

  describe('falha de rede em /api/sessao', () => {
    it('a guarda mostra alerta em português, sem a mensagem técnica "Failed to fetch"', async () => {
      simularApi({
        'GET /api/sessao': () => {
          throw new TypeError('Failed to fetch')
        },
      })
      renderizarApp('/')
      const alerta = await screen.findByRole('alert')
      expect(alerta).not.toHaveTextContent('Failed to fetch')
    })

    it('"Tentar de novo" refaz a consulta da sessão e, com sucesso, mostra o Início', async () => {
      let tentativa = 0
      const api = simularApi({
        'GET /api/sessao': () => {
          tentativa += 1
          if (tentativa === 1) throw new TypeError('Failed to fetch')
          return json({
            usuario: { id: 1, nome: 'Ana', email: 'ana@exemplo.com', tema: 'claro' },
            hoje: '2026-10-15',
            casal: null,
          })
        },
      })
      const { user } = renderizarApp('/')
      await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
      expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument()
      expect(api.chamadasDe('GET /api/sessao')).toHaveLength(2)
    })
  })
})
