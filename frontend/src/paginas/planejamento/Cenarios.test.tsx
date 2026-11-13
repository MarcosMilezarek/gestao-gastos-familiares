import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CenarioResumo, CenarioSaida } from '../../api/cenarios'
import { erroApi, json, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const RESUMO: CenarioResumo = {
  id: 7,
  nome: 'Morar juntos',
  total_rendas: '10000.00',
  total_despesas: '2800.00',
  saldo_mensal: '7200.00',
}

const NOVO: CenarioSaida = {
  id: 8,
  nome: 'Viagem',
  itens: [],
  resultado: {
    total_rendas: '0.00',
    total_despesas: '0.00',
    saldo_mensal: '0.00',
    sem_proporcao: true,
    base_casal: '0.00',
    pessoas: [],
  },
}

function cardDe(nome: string) {
  return screen.getByText(nome).closest('li')!
}

describe('Cenarios: lista (CA-7.11, CA-7.12)', () => {
  it('lista o cenário com saldo mensal e link para o detalhe', async () => {
    simularApi({ 'GET /api/cenarios': json([RESUMO]) })
    renderizarApp('/planejamento/cenarios')
    const item = (await screen.findByText('Morar juntos')).closest('li')!
    expect(within(item).getByText('R$ 7.200,00')).toBeInTheDocument()
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/planejamento/cenarios/7')
  })

  it('sem cenários mostra o estado vazio e "Criar cenário" abre o formulário', async () => {
    simularApi({ 'GET /api/cenarios': json([]) })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText(/Nenhum cenário cadastrado/)
    await user.click(screen.getByRole('button', { name: 'Criar cenário' }))
    expect(await screen.findByRole('dialog', { name: 'Novo cenário' })).toBeInTheDocument()
  })

  it('erro ao listar mostra a mensagem do servidor', async () => {
    simularApi({ 'GET /api/cenarios': erroApi(403, 'SEM_VINCULO', 'Falha ao listar cenários.') })
    renderizarApp('/planejamento/cenarios')
    expect(await screen.findByText('Falha ao listar cenários.')).toBeInTheDocument()
  })
})

describe('FormCenario: criar e renomear (CA-7.11)', () => {
  it('cria "Viagem" (nome aparado) e recarrega a lista', async () => {
    let lista: CenarioResumo[] = []
    const api = simularApi({
      'GET /api/cenarios': () => json(lista),
      'POST /api/cenarios': () => {
        lista = [{ ...RESUMO, id: 8, nome: 'Viagem', total_rendas: '0.00', total_despesas: '0.00', saldo_mensal: '0.00' }]
        return json(NOVO, 201)
      },
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText(/Nenhum cenário cadastrado/)
    await user.click(screen.getByRole('button', { name: 'Novo cenário' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo cenário' })
    await user.type(within(dialogo).getByLabelText('Nome'), '  Viagem ')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Viagem')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/cenarios')[0]!.corpo).toEqual({ nome: 'Viagem' })
  })

  it('nome vazio é recusado na tela, com foco, sem chamar a API', async () => {
    const api = simularApi({ 'GET /api/cenarios': json([]) })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText(/Nenhum cenário cadastrado/)
    await user.click(screen.getByRole('button', { name: 'Novo cenário' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo cenário' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe o nome do cenário.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Nome')).toHaveFocus()
    expect(api.chamadasDe('POST /api/cenarios')).toHaveLength(0)
  })

  it('nome com 81 caracteres é recusado; com 80 é aceito', async () => {
    const api = simularApi({
      'GET /api/cenarios': json([]),
      'POST /api/cenarios': json(NOVO, 201),
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText(/Nenhum cenário cadastrado/)
    await user.click(screen.getByRole('button', { name: 'Novo cenário' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo cenário' })
    await user.click(within(dialogo).getByLabelText('Nome'))
    await user.paste('a'.repeat(81))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Use no máximo 80 caracteres.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/cenarios')).toHaveLength(0)
    await user.type(within(dialogo).getByLabelText('Nome'), '{Backspace}')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/Nenhum cenário cadastrado/)
    expect(api.chamadasDe('POST /api/cenarios')).toHaveLength(1)
  })

  it('erro de campo do servidor aparece junto ao campo e o formulário continua aberto', async () => {
    simularApi({
      'GET /api/cenarios': json([]),
      'POST /api/cenarios': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { nome: 'Nome inválido.' }),
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText(/Nenhum cenário cadastrado/)
    await user.click(screen.getByRole('button', { name: 'Novo cenário' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo cenário' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'X')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findAllByText('Nome inválido.')).not.toHaveLength(0)
    expect(within(dialogo).getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renomear envia PATCH com o novo nome, partindo do nome atual', async () => {
    let lista = [RESUMO]
    const api = simularApi({
      'GET /api/cenarios': () => json(lista),
      'PATCH /api/cenarios/7': () => {
        lista = [{ ...RESUMO, nome: 'Casa nova' }]
        return json({ ...NOVO, id: 7, nome: 'Casa nova' })
      },
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText('Morar juntos')
    await user.click(within(cardDe('Morar juntos')).getByRole('button', { name: 'Renomear' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Renomear cenário' })
    const campo = within(dialogo).getByLabelText('Nome')
    expect(campo).toHaveValue('Morar juntos')
    await user.clear(campo)
    await user.type(campo, 'Casa nova')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Casa nova')).toBeInTheDocument()
    expect(api.chamadasDe('PATCH /api/cenarios/7')[0]!.corpo).toEqual({ nome: 'Casa nova' })
  })
})

describe('Cenarios: excluir (CA-7.11)', () => {
  it('só exclui depois da confirmação', async () => {
    let lista = [RESUMO]
    const api = simularApi({
      'GET /api/cenarios': () => json(lista),
      'DELETE /api/cenarios/7': () => {
        lista = []
        return semConteudo()
      },
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText('Morar juntos')
    await user.click(within(cardDe('Morar juntos')).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir cenário' })
    expect(api.chamadasDe('DELETE /api/cenarios/7')).toHaveLength(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText(/Nenhum cenário cadastrado/)).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/cenarios/7')).toHaveLength(1)
  })

  it('cancelar a confirmação não exclui', async () => {
    const api = simularApi({ 'GET /api/cenarios': json([RESUMO]) })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText('Morar juntos')
    await user.click(within(cardDe('Morar juntos')).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir cenário' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('DELETE /api/cenarios/7')).toHaveLength(0)
  })

  it('erro na exclusão fecha a confirmação e mostra a mensagem', async () => {
    simularApi({
      'GET /api/cenarios': json([RESUMO]),
      'DELETE /api/cenarios/7': erroApi(500, 'ERRO_INTERNO', 'Não foi possível excluir.'),
    })
    const { user } = renderizarApp('/planejamento/cenarios')
    await screen.findByText('Morar juntos')
    await user.click(within(cardDe('Morar juntos')).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir cenário' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Não foi possível excluir.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
