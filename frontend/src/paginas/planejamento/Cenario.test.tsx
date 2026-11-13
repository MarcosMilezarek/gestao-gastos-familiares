import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CenarioSaida, ResultadoSaida } from '../../api/cenarios'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const RESULTADO: ResultadoSaida = {
  total_rendas: '10000.00',
  total_despesas: '2800.00',
  saldo_mensal: '7200.00',
  sem_proporcao: false,
  base_casal: '2500.00',
  pessoas: [
    {
      usuario_id: 1,
      nome: 'Ana',
      renda: '6000.00',
      porcentagem: '60.00',
      aporte: '1500.00',
      despesas_proprias: '0.00',
      sobra: '4500.00',
    },
    {
      usuario_id: 2,
      nome: 'Bruno',
      renda: '4000.00',
      porcentagem: '40.00',
      aporte: '1000.00',
      despesas_proprias: '300.00',
      sobra: '2700.00',
    },
  ],
}

const CENARIO: CenarioSaida = {
  id: 7,
  nome: 'Morar juntos',
  itens: [
    { id: 1, tipo: 'renda', dono_usuario_id: 1, dono_nome: 'Ana', descricao: 'Salário Ana', valor: '6000.00' },
    { id: 2, tipo: 'renda', dono_usuario_id: 2, dono_nome: 'Bruno', descricao: 'Salário Bruno', valor: '4000.00' },
    { id: 3, tipo: 'despesa', dono_usuario_id: null, dono_nome: 'Casal', descricao: 'Aluguel', valor: '1500.00' },
    { id: 4, tipo: 'despesa', dono_usuario_id: 2, dono_nome: 'Bruno', descricao: 'Academia', valor: '300.00' },
  ],
  resultado: RESULTADO,
}

const VAZIO: CenarioSaida = {
  id: 7,
  nome: 'Morar juntos',
  itens: [],
  resultado: {
    total_rendas: '0.00',
    total_despesas: '0.00',
    saldo_mensal: '0.00',
    sem_proporcao: true,
    base_casal: '0.00',
    pessoas: [
      { usuario_id: 1, nome: 'Ana', renda: '0.00', porcentagem: null, aporte: null, despesas_proprias: '0.00', sobra: null },
      { usuario_id: 2, nome: 'Bruno', renda: '0.00', porcentagem: null, aporte: null, despesas_proprias: '0.00', sobra: null },
    ],
  },
}

function linhaDe(rotulo: string) {
  return screen.getByText(rotulo).closest('div')!
}

describe('Cenario: detalhe e resultado (CA-7.11, CA-7.12)', () => {
  it('mostra o nome, as rendas e as despesas com o dono de cada item', async () => {
    simularApi({ 'GET /api/cenarios/7': json(CENARIO) })
    renderizarApp('/planejamento/cenarios/7')
    expect(await screen.findByRole('heading', { name: 'Morar juntos' })).toBeInTheDocument()
    const aluguel = screen.getByText('Aluguel').closest('li')!
    expect(within(aluguel).getByText('Casal')).toBeInTheDocument()
    expect(within(aluguel).getByText('-R$ 1.500,00')).toBeInTheDocument()
    const salario = screen.getByText('Salário Ana').closest('li')!
    expect(within(salario).getByText('+R$ 6.000,00')).toBeInTheDocument()
  })

  it('mostra os totais, as porcentagens, aportes e sobras que vêm do servidor', async () => {
    simularApi({ 'GET /api/cenarios/7': json(CENARIO) })
    renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    expect(within(linhaDe('Total de rendas')).getByText('R$ 10.000,00')).toBeInTheDocument()
    expect(within(linhaDe('Total de despesas')).getByText('R$ 2.800,00')).toBeInTheDocument()
    expect(within(linhaDe('Saldo mensal')).getByText('R$ 7.200,00')).toBeInTheDocument()
    const ana = screen.getByRole('heading', { name: 'Ana' }).closest('li')!
    expect(within(ana).getByText('60,00%')).toBeInTheDocument()
    expect(within(ana).getByText('R$ 1.500,00')).toBeInTheDocument()
    expect(within(ana).getByText('R$ 4.500,00')).toBeInTheDocument()
    const bruno = screen.getByRole('heading', { name: 'Bruno' }).closest('li')!
    expect(within(bruno).getByText('40,00%')).toBeInTheDocument()
    expect(within(bruno).getByText('R$ 1.000,00')).toBeInTheDocument()
    expect(within(bruno).getByText('R$ 2.700,00')).toBeInTheDocument()
    expect(within(bruno).getByText('R$ 300,00')).toBeInTheDocument()
  })

  it('aportes que somam a base do casal com centavos (1.547,62 e 952,38) são mostrados como vieram', async () => {
    const r: ResultadoSaida = {
      ...RESULTADO,
      pessoas: [
        { ...RESULTADO.pessoas[0]!, aporte: '1547.62', porcentagem: '61.90' },
        { ...RESULTADO.pessoas[1]!, aporte: '952.38', porcentagem: '38.10' },
      ],
    }
    simularApi({ 'GET /api/cenarios/7': json({ ...CENARIO, resultado: r }) })
    renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    expect(screen.getByText('R$ 1.547,62')).toBeInTheDocument()
    expect(screen.getByText('R$ 952,38')).toBeInTheDocument()
  })

  it('cenário recém-criado não tem itens e mostra "sem proporção", sem aporte', async () => {
    simularApi({ 'GET /api/cenarios/7': json(VAZIO) })
    renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    expect(screen.getByText('Nenhum item de renda.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum item de despesa.')).toBeInTheDocument()
    expect(screen.getByText(/sem proporção/)).toBeInTheDocument()
    expect(screen.queryByText('Aporte')).toBeNull()
    expect(screen.queryByText('Porcentagem')).toBeNull()
    expect(screen.queryByText('Sobra')).toBeNull()
  })

  it('cenário inexistente (404) mostra "Cenário não encontrado."', async () => {
    simularApi({ 'GET /api/cenarios/9': erroApi(404, 'NAO_ENCONTRADO', 'Cenário não encontrado.') })
    renderizarApp('/planejamento/cenarios/9')
    expect(await screen.findByText('Cenário não encontrado.')).toBeInTheDocument()
  })

  it('id inválido na URL não consulta a API e mostra "Cenário não encontrado."', async () => {
    const api = simularApi({})
    renderizarApp('/planejamento/cenarios/12abc')
    expect(await screen.findByText('Cenário não encontrado.')).toBeInTheDocument()
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/cenarios'))).toHaveLength(0)
  })

  it('cenários não chamam rotas do Controle (itens hipotéticos ficam fora dos lançamentos)', async () => {
    const api = simularApi({ 'GET /api/cenarios/7': json(CENARIO) })
    renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/lancamentos'))).toHaveLength(0)
  })
})

describe('FormItemCenario: adicionar (CA-7.11)', () => {
  it('adiciona renda com dono e valor, envia o corpo certo e mostra o resultado devolvido', async () => {
    const api = simularApi({
      'GET /api/cenarios/7': json(VAZIO),
      'POST /api/cenarios/7/itens': json(CENARIO, 201),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo item' })
    await user.selectOptions(within(dialogo).getByLabelText('Dono'), 'Ana')
    await user.type(within(dialogo).getByLabelText('Descrição'), ' Salário Ana ')
    await user.type(within(dialogo).getByLabelText('Valor'), '600000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(linhaDe('Saldo mensal')).findByText('R$ 7.200,00')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/cenarios/7/itens')[0]!.corpo).toEqual({
      tipo: 'renda',
      dono_usuario_id: 1,
      descricao: 'Salário Ana',
      valor: '6000.00',
    })
  })

  it('despesa vem com dono "Casal" e envia dono_usuario_id null', async () => {
    const api = simularApi({
      'GET /api/cenarios/7': json(VAZIO),
      'POST /api/cenarios/7/itens': json(CENARIO, 201),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo item' })
    await user.selectOptions(within(dialogo).getByLabelText('Tipo'), 'Despesa')
    expect(within(dialogo).getByLabelText('Dono')).toHaveValue('casal')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Aluguel')
    await user.type(within(dialogo).getByLabelText('Valor'), '150000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await within(linhaDe('Saldo mensal')).findByText('R$ 7.200,00')
    expect(api.chamadasDe('POST /api/cenarios/7/itens')[0]!.corpo).toEqual({
      tipo: 'despesa',
      dono_usuario_id: null,
      descricao: 'Aluguel',
      valor: '1500.00',
    })
  })

  it('valor zero é recusado na tela, sem chamar a API', async () => {
    const api = simularApi({ 'GET /api/cenarios/7': json(VAZIO) })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo item' })
    await user.selectOptions(within(dialogo).getByLabelText('Dono'), 'Ana')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Salário')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe um valor maior que zero.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Valor')).toHaveFocus()
    expect(api.chamadasDe('POST /api/cenarios/7/itens')).toHaveLength(0)
  })

  it('renda sem dono e item sem descrição são recusados na tela', async () => {
    const api = simularApi({ 'GET /api/cenarios/7': json(VAZIO) })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo item' })
    await user.type(within(dialogo).getByLabelText('Valor'), '1000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Escolha quem recebe a renda.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Informe a descrição.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/cenarios/7/itens')).toHaveLength(0)
  })

  it('valor negativo recusado pelo servidor aparece junto ao campo', async () => {
    simularApi({
      'GET /api/cenarios/7': json(VAZIO),
      'POST /api/cenarios/7/itens': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        valor: 'O valor deve ser maior que zero.',
      }),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByRole('heading', { name: 'Resultado' })
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo item' })
    await user.selectOptions(within(dialogo).getByLabelText('Dono'), 'Ana')
    await user.type(within(dialogo).getByLabelText('Descrição'), 'Salário')
    await user.type(within(dialogo).getByLabelText('Valor'), '100')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect((await within(dialogo).findAllByText('O valor deve ser maior que zero.')).length).toBeGreaterThan(0)
    expect(within(dialogo).getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('FormItemCenario e exclusão: editar e excluir item (CA-7.11)', () => {
  it('editar abre o formulário preenchido, sem seletor de tipo, e envia PATCH sem tipo', async () => {
    const api = simularApi({
      'GET /api/cenarios/7': json(CENARIO),
      'PATCH /api/cenarios/7/itens/3': json({
        ...CENARIO,
        itens: CENARIO.itens.map((i) => (i.id === 3 ? { ...i, valor: '1800.00' } : i)),
        resultado: { ...RESULTADO, saldo_mensal: '6900.00' },
      }),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByText('Aluguel')
    await user.click(screen.getByRole('button', { name: 'Editar Aluguel' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar item' })
    expect(within(dialogo).queryByLabelText('Tipo')).toBeNull()
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('1.500,00')
    expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('Aluguel')
    const valor = within(dialogo).getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '180000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(linhaDe('Saldo mensal')).findByText('R$ 6.900,00')).toBeInTheDocument()
    expect(api.chamadasDe('PATCH /api/cenarios/7/itens/3')[0]!.corpo).toEqual({
      dono_usuario_id: null,
      descricao: 'Aluguel',
      valor: '1800.00',
    })
  })

  it('excluir item pede confirmação e atualiza o resultado com a resposta do servidor', async () => {
    const api = simularApi({
      'GET /api/cenarios/7': json(CENARIO),
      'DELETE /api/cenarios/7/itens/4': json({
        ...CENARIO,
        itens: CENARIO.itens.filter((i) => i.id !== 4),
        resultado: { ...RESULTADO, total_despesas: '1500.00', saldo_mensal: '8500.00' },
      }),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByText('Academia')
    await user.click(screen.getByRole('button', { name: 'Excluir Academia' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir item' })
    expect(api.chamadasDe('DELETE /api/cenarios/7/itens/4')).toHaveLength(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await within(linhaDe('Saldo mensal')).findByText('R$ 8.500,00')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('erro ao excluir item fecha a confirmação e mostra a mensagem', async () => {
    simularApi({
      'GET /api/cenarios/7': json(CENARIO),
      'DELETE /api/cenarios/7/itens/4': erroApi(403, 'CASAL_ENCERRADO', 'O casal foi encerrado.'),
    })
    const { user } = renderizarApp('/planejamento/cenarios/7')
    await screen.findByText('Academia')
    await user.click(screen.getByRole('button', { name: 'Excluir Academia' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir item' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('O casal foi encerrado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Academia')).toBeInTheDocument()
  })
})
