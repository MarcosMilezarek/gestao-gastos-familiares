import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, json, limparTudo, renderizarApp, simularApi, SESSAO_PADRAO } from '../../testes/utilitarios'

afterEach(limparTudo)

async function preencher(
  user: ReturnType<typeof renderizarApp>['user'],
  v: { nome?: string; email?: string; senha?: string; conf?: string } = {},
) {
  await user.type(await screen.findByLabelText('Nome'), v.nome ?? 'Ana')
  await user.type(screen.getByLabelText('E-mail'), v.email ?? 'ana@exemplo.com')
  await user.type(screen.getByLabelText('Senha'), v.senha ?? 'senha1234')
  await user.type(screen.getByLabelText('Confirmar senha'), v.conf ?? v.senha ?? 'senha1234')
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }))
}

describe('Cadastrar', () => {
  it('CA-1.01: cadastro válido envia os dados e abre a tela inicial', async () => {
    let logado = false
    const api = simularApi(
      {
        'GET /api/sessao': () => (logado ? json(SESSAO_PADRAO) : erroApi(401, 'NAO_AUTENTICADO', 'x')),
        'POST /api/cadastro': () => {
          logado = true
          return json(SESSAO_PADRAO, 201)
        },
      },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Cadastrar' })).not.toBeInTheDocument())
    expect(api.chamadasDe('POST /api/cadastro')[0]?.corpo).toEqual({
      nome: 'Ana',
      email: 'ana@exemplo.com',
      senha: 'senha1234',
      senha_confirmacao: 'senha1234',
    })
  })

  it('CA-1.01: senha e confirmação diferentes mostram a mensagem junto ao campo de confirmação', async () => {
    simularApi(
      {
        'POST /api/cadastro': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
          senha_confirmacao: 'A confirmação não confere com a senha.',
        }),
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user, { senha: 'senha1234', conf: 'outra12345' })
    const campo = await screen.findByLabelText('Confirmar senha')
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'))
    const msg = screen.getByText('A confirmação não confere com a senha.')
    expect(campo.getAttribute('aria-describedby')).toContain(msg.id)
  })

  it('CA-1.02: e-mail já cadastrado exibe a mensagem do servidor junto ao campo e-mail', async () => {
    simularApi(
      {
        'POST /api/cadastro': erroApi(409, 'EMAIL_JA_CADASTRADO', 'E-mail já cadastrado.', {
          email: 'E-mail já cadastrado.',
        }),
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user)
    const campo = screen.getByLabelText('E-mail')
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('E-mail já cadastrado.').id).toBe(
      campo.getAttribute('aria-describedby')?.split(' ').find((i) => i.endsWith('-mensagem')),
    )
  })

  it('CA-1.02: e-mail repetido sem campos vira alerta geral', async () => {
    simularApi(
      { 'POST /api/cadastro': erroApi(409, 'EMAIL_JA_CADASTRADO', 'E-mail já cadastrado.') },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado.')
  })

  it('CA-1.03: senha com 8 caracteres é enviada ao servidor sem bloqueio no cliente', async () => {
    const api = simularApi({ 'POST /api/cadastro': json(SESSAO_PADRAO, 201) }, { sessao: null })
    const { user } = renderizarApp('/cadastrar')
    await preencher(user, { senha: '12345678' })
    await waitFor(() => expect(api.chamadasDe('POST /api/cadastro')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/cadastro')[0]?.corpo).toMatchObject({ senha: '12345678' })
  })

  it('CA-1.03: senha com 7 caracteres recusada pelo servidor mostra a mensagem junto ao campo senha', async () => {
    simularApi(
      {
        'POST /api/cadastro': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
          senha: 'A senha deve ter de 8 a 128 caracteres.',
        }),
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user, { senha: '1234567' })
    const campo = screen.getByLabelText('Senha')
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('A senha deve ter de 8 a 128 caracteres.')).toBeInTheDocument()
  })

  it('CA-1.03: a ajuda do campo senha informa o limite de 8 a 128 caracteres', async () => {
    simularApi({}, { sessao: null })
    renderizarApp('/cadastrar')
    const campo = await screen.findByLabelText('Senha')
    expect(campo).toHaveAccessibleDescription('Use de 8 a 128 caracteres.')
  })

  it('CA-N.08: foco vai ao primeiro campo inválido na ordem do formulário', async () => {
    simularApi(
      {
        'POST /api/cadastro': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
          senha: 'Senha curta.',
          email: 'E-mail inválido.',
        }),
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user)
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toHaveFocus())
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true')
  })

  it('CA-N.08: sem erro, nenhum campo é marcado inválido', async () => {
    simularApi({}, { sessao: null })
    renderizarApp('/cadastrar')
    for (const r of ['Nome', 'E-mail', 'Senha', 'Confirmar senha']) {
      expect(await screen.findByLabelText(r)).not.toHaveAttribute('aria-invalid')
    }
  })

  it('o botão Cadastrar fica desabilitado durante o envio', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    simularApi(
      {
        'POST /api/cadastro': async () => {
          await espera
          return json(SESSAO_PADRAO, 201)
        },
      },
      { sessao: null },
    )
    const { user } = renderizarApp('/cadastrar')
    await preencher(user)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cadastrar' })).toBeDisabled())
    liberar()
  })

  it('o link Entrar leva à tela de login', async () => {
    simularApi({}, { sessao: null })
    const { user } = renderizarApp('/cadastrar')
    await user.click(await screen.findByRole('link', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})
