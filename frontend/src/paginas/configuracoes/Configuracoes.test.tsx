import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, json, limparTudo, SESSAO_PADRAO, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

describe('Configuracoes', () => {
  it('lista os atalhos para perfil, senha e vínculo', async () => {
    simularApi({})
    renderizarApp('/configuracoes')
    expect(await screen.findByRole('link', { name: 'Perfil e tema' })).toHaveAttribute('href', '/configuracoes/perfil')
    expect(screen.getByRole('link', { name: 'Alterar senha' })).toHaveAttribute('href', '/configuracoes/senha')
    expect(screen.getByRole('link', { name: 'Vínculo do casal' })).toHaveAttribute('href', '/configuracoes/vinculo')
  })

  it('CA-1.12: Sair encerra a sessão no servidor e leva ao login', async () => {
    let saiu = false
    const api = simularApi({
      'GET /api/sessao': () => (saiu ? erroApi(401, 'NAO_AUTENTICADO', 'Sessão inválida.') : json(SESSAO_PADRAO)),
      'DELETE /api/sessao': () => {
        saiu = true
        return semConteudo()
      },
    })
    const { user } = renderizarApp('/configuracoes')
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/sessao')).toHaveLength(1)
  })

  it('Sair com sessão já vencida (401) segue para o login', async () => {
    let saiu = false
    simularApi({
      'GET /api/sessao': () => (saiu ? erroApi(401, 'NAO_AUTENTICADO', 'Sessão inválida.') : json(SESSAO_PADRAO)),
      'DELETE /api/sessao': () => {
        saiu = true
        return erroApi(401, 'NAO_AUTENTICADO', 'Sessão inválida.')
      },
    })
    const { user } = renderizarApp('/configuracoes')
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('Sair com erro do servidor mostra alerta e permanece na tela', async () => {
    simularApi({ 'DELETE /api/sessao': erroApi(500, 'ERRO_INTERNO', 'Falha ao sair.') })
    const { user } = renderizarApp('/configuracoes')
    await user.click(await screen.findByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao sair.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled())
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument()
  })
})
