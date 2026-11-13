import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, json, limparTudo, renderizarApp, simularApi, SESSAO_PADRAO } from '../../testes/utilitarios'

afterEach(limparTudo)

const MENSAGEM = 'E-mail ou senha incorretos.'

async function entrar(user: ReturnType<typeof renderizarApp>['user'], email: string, senha: string) {
  await user.type(await screen.findByLabelText('E-mail'), email)
  await user.type(screen.getByLabelText('Senha'), senha)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Entrar', () => {
  it('CA-1.04: credenciais corretas enviam e-mail e senha e abrem a tela inicial', async () => {
    let logado = false
    const api = simularApi({
      'GET /api/sessao': () => (logado ? json(SESSAO_PADRAO) : erroApi(401, 'NAO_AUTENTICADO', 'x')),
      'POST /api/sessao': () => {
        logado = true
        return json(SESSAO_PADRAO)
      },
    })
    const { user } = renderizarApp('/entrar')
    await entrar(user, 'ana@exemplo.com', 'senha1234')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/sessao')[0]?.corpo).toEqual({
      email: 'ana@exemplo.com',
      senha: 'senha1234',
    })
  })

  it('CA-1.04: senha errada exibe a mensagem genérica do servidor', async () => {
    simularApi(
      { 'POST /api/sessao': erroApi(401, 'CREDENCIAIS_INVALIDAS', MENSAGEM) },
      { sessao: null },
    )
    const { user } = renderizarApp('/entrar')
    await entrar(user, 'ana@exemplo.com', 'errada1234')
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM)
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('CA-1.04: e-mail inexistente exibe exatamente a mesma mensagem da senha errada', async () => {
    simularApi(
      { 'POST /api/sessao': erroApi(401, 'CREDENCIAIS_INVALIDAS', MENSAGEM) },
      { sessao: null },
    )
    const { user } = renderizarApp('/entrar')
    await entrar(user, 'ninguem@exemplo.com', 'senha1234')
    const primeira = (await screen.findByRole('alert')).textContent
    expect(primeira).toBe(MENSAGEM)
  })

  it('falha de rede mostra a mensagem de sem conexão', async () => {
    simularApi(
      {
        'POST /api/sessao': () => {
          throw new Error('rede')
        },
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/entrar')
    await entrar(user, 'ana@exemplo.com', 'senha1234')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    )
  })

  it('o botão Entrar fica desabilitado durante o envio', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    simularApi(
      {
        'POST /api/sessao': async () => {
          await espera
          return erroApi(401, 'CREDENCIAIS_INVALIDAS', MENSAGEM)
        },
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/entrar')
    await entrar(user, 'ana@exemplo.com', 'senha1234')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled())
    liberar()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled())
  })

  it('usuário já autenticado em /entrar é redirecionado para a tela inicial', async () => {
    simularApi({})
    renderizarApp('/entrar')
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument())
  })

  it('o link Cadastrar leva à tela de cadastro', async () => {
    simularApi({}, { sessao: null })
    const { user } = renderizarApp('/entrar')
    await user.click(await screen.findByRole('link', { name: 'Cadastrar' }))
    expect(await screen.findByRole('heading', { name: 'Cadastrar' })).toBeInTheDocument()
  })
})
