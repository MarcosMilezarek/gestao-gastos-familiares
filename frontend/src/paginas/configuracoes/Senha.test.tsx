import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

async function preencher(user: ReturnType<typeof renderizarApp>['user'], atual: string, nova: string) {
  await user.type(await screen.findByLabelText('Senha atual'), atual)
  await user.type(screen.getByLabelText('Nova senha'), nova)
  await user.click(screen.getByRole('button', { name: 'Alterar senha' }))
}

describe('Senha', () => {
  it('CA-1.13: senha atual correta envia as duas senhas, confirma e limpa os campos', async () => {
    const api = simularApi({ 'POST /api/perfil/senha': semConteudo() })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'antiga1234', 'nova12345')
    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada.')
    expect(api.chamadasDe('POST /api/perfil/senha')[0]?.corpo).toEqual({
      senha_atual: 'antiga1234',
      senha_nova: 'nova12345',
    })
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
    expect(screen.getByLabelText('Nova senha')).toHaveValue('')
  })

  it('CA-1.13: senha atual incorreta (por código) aparece junto ao campo Senha atual', async () => {
    simularApi({
      'POST /api/perfil/senha': erroApi(400, 'SENHA_ATUAL_INCORRETA', 'Senha atual incorreta.'),
    })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'errada1234', 'nova12345')
    const msg = await screen.findByText('Senha atual incorreta.')
    const campo = screen.getByLabelText('Senha atual')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo.getAttribute('aria-describedby')).toContain(msg.id)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('CA-1.13: erro em campos.senha_atual aparece junto ao campo', async () => {
    simularApi({
      'POST /api/perfil/senha': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { senha_atual: 'Senha atual incorreta.' }),
    })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'errada1234', 'nova12345')
    await screen.findByText('Senha atual incorreta.')
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('aria-invalid', 'true')
  })

  it('CA-1.03: nova senha curta recusada pelo servidor aparece junto ao campo Nova senha', async () => {
    simularApi({
      'POST /api/perfil/senha': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        senha_nova: 'A senha deve ter de 8 a 128 caracteres.',
      }),
    })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'antiga1234', '1234567')
    const msg = await screen.findByText('A senha deve ter de 8 a 128 caracteres.')
    const campo = screen.getByLabelText('Nova senha')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo.getAttribute('aria-describedby')).toContain(msg.id)
  })

  it('o campo Nova senha traz a ajuda de mínimo 8 caracteres', async () => {
    simularApi({})
    renderizarApp('/configuracoes/senha')
    expect(await screen.findByLabelText('Nova senha')).toHaveAccessibleDescription('Mínimo 8 caracteres.')
  })

  it('erro sem campo vira alerta geral', async () => {
    simularApi({ 'POST /api/perfil/senha': erroApi(500, 'ERRO_INTERNO', 'Falha ao alterar a senha.') })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'antiga1234', 'nova12345')
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao alterar a senha.')
  })

  it('o botão fica desabilitado durante o envio', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    simularApi({
      'POST /api/perfil/senha': async () => {
        await espera
        return semConteudo()
      },
    })
    const { user } = renderizarApp('/configuracoes/senha')
    await preencher(user, 'antiga1234', 'nova12345')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alterar senha' })).toBeDisabled())
    liberar()
  })

  describe('sugestões t77', () => {
    it('S2: foco vai ao primeiro campo inválido (Senha atual) após o erro', async () => {
      simularApi({
        'POST /api/perfil/senha': erroApi(400, 'SENHA_ATUAL_INCORRETA', 'Senha atual incorreta.'),
      })
      const { user } = renderizarApp('/configuracoes/senha')
      await preencher(user, 'errada1234', 'nova12345')
      await screen.findByText('Senha atual incorreta.')
      await waitFor(() => expect(screen.getByLabelText('Senha atual')).toHaveFocus())
    })
  })
})
