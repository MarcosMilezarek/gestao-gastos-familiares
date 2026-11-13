import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, json, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'
import type { VinculoSaida } from '../../api/vinculo'

afterEach(limparTudo)

const SEM: VinculoSaida = { estado: 'sem_vinculo', convite_enviado: null, convites_recebidos: [], parceiro: null }
const ENVIADO: VinculoSaida = {
  estado: 'convite_enviado',
  convite_enviado: { id: 7, email_convidado: 'bruno@exemplo.com' },
  convites_recebidos: [],
  parceiro: null,
}
const RECEBIDO: VinculoSaida = {
  estado: 'convite_recebido',
  convite_enviado: null,
  convites_recebidos: [{ id: 9, convidante_nome: 'Carla' }],
  parceiro: null,
}
const VINCULADO: VinculoSaida = {
  estado: 'vinculado',
  convite_enviado: null,
  convites_recebidos: [],
  parceiro: { id: 2, nome: 'Bruno' },
}

const ROTA = '/configuracoes/vinculo'
const botao = (n: string) => screen.queryByRole('button', { name: n })

describe('Vinculo - estados (CA-1.15)', () => {
  it('sem vínculo: mostra campo de e-mail e Enviar convite, nada mais', async () => {
    simularApi({ 'GET /api/vinculo': json(SEM) })
    renderizarApp(ROTA)
    expect(await screen.findByLabelText('E-mail do parceiro(a)')).toBeInTheDocument()
    expect(botao('Enviar convite')).toBeInTheDocument()
    for (const n of ['Cancelar convite', 'Aceitar', 'Recusar', 'Desvincular']) expect(botao(n)).toBeNull()
  })

  it('convite enviado: mostra o e-mail convidado e só Cancelar convite', async () => {
    simularApi({ 'GET /api/vinculo': json(ENVIADO) })
    renderizarApp(ROTA)
    expect(await screen.findByText('Convite enviado para bruno@exemplo.com')).toBeInTheDocument()
    expect(botao('Cancelar convite')).toBeInTheDocument()
    for (const n of ['Enviar convite', 'Aceitar', 'Recusar', 'Desvincular']) expect(botao(n)).toBeNull()
    expect(screen.queryByLabelText('E-mail do parceiro(a)')).toBeNull()
  })

  it('convite recebido: mostra o convidante e só Aceitar e Recusar', async () => {
    simularApi({ 'GET /api/vinculo': json(RECEBIDO) })
    renderizarApp(ROTA)
    expect(await screen.findByText('Carla convidou você')).toBeInTheDocument()
    expect(botao('Aceitar')).toBeInTheDocument()
    expect(botao('Recusar')).toBeInTheDocument()
    for (const n of ['Cancelar convite', 'Desvincular']) expect(botao(n)).toBeNull()
  })

  it('vinculado: mostra o nome do parceiro (CA-1.11) e só Desvincular', async () => {
    simularApi({ 'GET /api/vinculo': json(VINCULADO) })
    renderizarApp(ROTA)
    expect(await screen.findByText('Vinculado(a) com Bruno')).toBeInTheDocument()
    expect(botao('Desvincular')).toBeInTheDocument()
    for (const n of ['Enviar convite', 'Cancelar convite', 'Aceitar', 'Recusar']) expect(botao(n)).toBeNull()
  })

  it('falha ao carregar mostra alerta com a mensagem do servidor', async () => {
    simularApi({ 'GET /api/vinculo': erroApi(500, 'ERRO_INTERNO', 'Falha ao carregar o vínculo.') })
    renderizarApp(ROTA)
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar o vínculo.')
  })
})

describe('Vinculo - ações', () => {
  it('enviar convite envia o e-mail sem espaços, limpa o campo e recarrega o estado', async () => {
    let estado = SEM
    const api = simularApi({
      'GET /api/vinculo': () => json(estado),
      'POST /api/convites': () => {
        estado = ENVIADO
        return json({ id: 7, email_convidado: 'bruno@exemplo.com' }, 201)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.type(await screen.findByLabelText('E-mail do parceiro(a)'), 'bruno@exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByText('Convite enviado para bruno@exemplo.com')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/convites')[0]?.corpo).toEqual({ email: 'bruno@exemplo.com' })
  })

  it('e-mail inexistente ou inválido do servidor aparece junto ao campo', async () => {
    simularApi({
      'GET /api/vinculo': json(SEM),
      'POST /api/convites': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { email: 'Não há usuário com este e-mail.' }),
    })
    const { user } = renderizarApp(ROTA)
    await user.type(await screen.findByLabelText('E-mail do parceiro(a)'), 'x@exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }))
    const msg = await screen.findByText('Não há usuário com este e-mail.')
    const campo = screen.getByLabelText('E-mail do parceiro(a)')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo.getAttribute('aria-describedby')).toContain(msg.id)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('erro de convite sem campo vira alerta geral', async () => {
    simularApi({
      'GET /api/vinculo': json(SEM),
      'POST /api/convites': erroApi(409, 'CONVITE_PENDENTE', 'Já existe um convite pendente.'),
    })
    const { user } = renderizarApp(ROTA)
    await user.type(await screen.findByLabelText('E-mail do parceiro(a)'), 'x@exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um convite pendente.')
  })

  it('cancelar convite chama DELETE do convite e volta ao estado sem vínculo', async () => {
    let estado = ENVIADO
    const api = simularApi({
      'GET /api/vinculo': () => json(estado),
      'DELETE /api/convites/7': () => {
        estado = SEM
        return semConteudo()
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Cancelar convite' }))
    expect(await screen.findByLabelText('E-mail do parceiro(a)')).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/convites/7')).toHaveLength(1)
  })

  it('aceitar convite chama POST aceitar e passa ao estado vinculado', async () => {
    let estado = RECEBIDO
    const api = simularApi({
      'GET /api/vinculo': () => json(estado),
      'POST /api/convites/9/aceitar': () => {
        estado = { ...VINCULADO, parceiro: { id: 3, nome: 'Carla' } }
        return json(estado)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Aceitar' }))
    expect(await screen.findByText('Vinculado(a) com Carla')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/convites/9/aceitar')).toHaveLength(1)
  })

  it('recusar convite chama POST recusar e volta ao estado sem vínculo', async () => {
    let estado = RECEBIDO
    const api = simularApi({
      'GET /api/vinculo': () => json(estado),
      'POST /api/convites/9/recusar': () => {
        estado = SEM
        return json(SEM)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Recusar' }))
    expect(await screen.findByLabelText('E-mail do parceiro(a)')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/convites/9/recusar')).toHaveLength(1)
  })

  it('erro ao aceitar mostra alerta com a mensagem do servidor', async () => {
    simularApi({
      'GET /api/vinculo': json(RECEBIDO),
      'POST /api/convites/9/aceitar': erroApi(409, 'CONVITE_INVALIDO', 'O convite não está mais disponível.'),
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Aceitar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O convite não está mais disponível.')
  })

  it('desvincular pede confirmação e só chama o servidor ao confirmar', async () => {
    let estado = VINCULADO
    const api = simularApi({
      'GET /api/vinculo': () => json(estado),
      'POST /api/vinculo/desvincular': () => {
        estado = SEM
        return json(SEM)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Desvincular' }))
    const dialogo = await screen.findByRole('dialog')
    expect(api.chamadasDe('POST /api/vinculo/desvincular')).toHaveLength(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Desvincular' }))
    expect(await screen.findByLabelText('E-mail do parceiro(a)')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/vinculo/desvincular')[0]?.corpo).toEqual({ confirmar: true })
  })

  it('cancelar o diálogo de desvínculo não chama o servidor', async () => {
    const api = simularApi({ 'GET /api/vinculo': json(VINCULADO) })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Desvincular' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.chamadasDe('POST /api/vinculo/desvincular')).toHaveLength(0)
  })

  it('o botão Enviar convite fica desabilitado durante o envio', async () => {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    simularApi({
      'GET /api/vinculo': json(SEM),
      'POST /api/convites': async () => {
        await espera
        return json({ id: 7, email_convidado: 'x@exemplo.com' }, 201)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.type(await screen.findByLabelText('E-mail do parceiro(a)'), 'x@exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeDisabled())
    liberar()
  })
})

describe('Vinculo - sugestões t77', () => {
  function pendente() {
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    return { espera, liberar: () => liberar() }
  }

  it('S1: Aceitar e Recusar ficam desabilitados durante o envio de Aceitar', async () => {
    const p = pendente()
    simularApi({
      'GET /api/vinculo': json(RECEBIDO),
      'POST /api/convites/9/aceitar': async () => {
        await p.espera
        return json(VINCULADO)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Aceitar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Aceitar' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled()
    p.liberar()
  })

  it('S1: Aceitar e Recusar ficam desabilitados durante o envio de Recusar', async () => {
    const p = pendente()
    simularApi({
      'GET /api/vinculo': json(RECEBIDO),
      'POST /api/convites/9/recusar': async () => {
        await p.espera
        return json(SEM)
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Recusar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeDisabled()
    p.liberar()
  })

  it('S1: Cancelar convite fica desabilitado durante o envio', async () => {
    const p = pendente()
    simularApi({
      'GET /api/vinculo': json(ENVIADO),
      'DELETE /api/convites/7': async () => {
        await p.espera
        return semConteudo()
      },
    })
    const { user } = renderizarApp(ROTA)
    await user.click(await screen.findByRole('button', { name: 'Cancelar convite' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar convite' })).toBeDisabled())
    p.liberar()
  })

  it('S2: foco vai ao campo e-mail quando o servidor o recusa', async () => {
    simularApi({
      'GET /api/vinculo': json(SEM),
      'POST /api/convites': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { email: 'Não há usuário com este e-mail.' }),
    })
    const { user } = renderizarApp(ROTA)
    await user.type(await screen.findByLabelText('E-mail do parceiro(a)'), 'x@exemplo.com')
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }))
    await screen.findByText('Não há usuário com este e-mail.')
    await waitFor(() => expect(screen.getByLabelText('E-mail do parceiro(a)')).toHaveFocus())
  })
})
