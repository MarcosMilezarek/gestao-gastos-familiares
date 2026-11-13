import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import type { MetaDetalhe, MetaSaida, MovimentoMeta } from '../../api/metas'
import { erroApi, json, limparTudo, renderizarApp, simularApi, type Handler } from '../../testes/utilitarios'
import { MODELOS_META } from './modelosMeta'
import { SeletorModelo } from './SeletorModelo'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera assentar.
afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 20))
})

// Data do servidor nas fixtures (SESSAO_PADRAO.hoje) = 2026-10-15.
const META: MetaSaida = {
  id: 5,
  nome: 'Viagem',
  valor_alvo: '10000.00',
  data_alvo: '2027-06-30',
  valor_inicial: '1000.00',
  cor: '#00838F',
  icone: 'plane',
  descricao: 'Europa',
  valor_atual: '1500.00',
  aplicado_liquido: '500.00',
  rendeu: '0.00',
  falta: '8500.00',
  porcentagem: '15.00',
  situacao: 'em_andamento',
  casal_encerrado: false,
}

const mov = (p: Partial<MovimentoMeta> & Pick<MovimentoMeta, 'tipo' | 'id'>): MovimentoMeta => ({
  data: '2026-10-05',
  valor: '500.00',
  situacao: 'confirmada',
  descricao: null,
  ...p,
})

function detalhe(movimentos: MovimentoMeta[], parcial: Partial<MetaDetalhe> = {}): MetaDetalhe {
  return {
    ...META,
    movimentos: [mov({ tipo: 'inicial', id: null, valor: '1000.00', situacao: null }), ...movimentos],
    ...parcial,
  }
}

const LISTA_VAZIA = { patrimonio_total: '0.00', metas: [] }

function rotasDetalhe(m: MetaDetalhe, sobre: Record<string, Handler> = {}): Record<string, Handler> {
  return { 'GET /api/metas/5': json(m), 'GET /api/metas': json(LISTA_VAZIA), ...sobre }
}

function linhaDoHistorico(rotulo: string): HTMLElement {
  return screen.getByText(rotulo, { selector: 'span' }).closest('li') as HTMLElement
}

async function abrirNovaMeta() {
  const api = simularApi({
    'GET /api/metas': json(LISTA_VAZIA),
    'POST /api/metas': ({ corpo }) => json({ ...META, ...(corpo as object), id: 9 }, 201),
  })
  const r = renderizarApp('/metas')
  await r.user.click(await screen.findByRole('button', { name: 'Nova meta' }))
  const dialogo = await screen.findByRole('dialog', { name: 'Nova meta' })
  return { ...r, api, dialogo }
}

describe('SeletorModelo (CA-6.02)', () => {
  afterEach(cleanup)

  it('oferece exatamente os seis modelos e nenhuma opção individual', () => {
    render(<SeletorModelo aoEscolher={() => {}} />)
    const rotulos = screen.getAllByRole('button').map((b) => b.textContent)
    expect(rotulos).toEqual([
      'Personalizado',
      'Reserva de emergência',
      'Entrada do apê',
      'Casamento',
      'Mudança',
      'Viagem',
    ])
    expect(screen.queryByText(/individual/i)).not.toBeInTheDocument()
  })

  it('escolher um modelo entrega o modelo inteiro a quem chamou', async () => {
    const aoEscolher = vi.fn()
    render(<SeletorModelo aoEscolher={aoEscolher} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Viagem' }))
    expect(aoEscolher).toHaveBeenCalledTimes(1)
    expect(aoEscolher).toHaveBeenCalledWith(MODELOS_META.find((m) => m.rotulo === 'Viagem'))
  })
})

describe('FormMeta: criar (CA-6.01, CA-6.02, CA-6.03)', () => {
  it('meta mínima: nome e alvo, sem data nem valor inicial, vai com valor inicial 0,00 e sem data_alvo', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '3000000')
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveValue('30.000,00')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas')[0]!.corpo).toEqual({
      nome: 'Reserva',
      valor_alvo: '30000.00',
      valor_inicial: '0.00',
      cor: '#1E88E5',
      icone: 'target',
    })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('com data-alvo, valor inicial e descrição, envia os três', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '3000000')
    fireEvent.change(within(dialogo).getByLabelText('Data-alvo (opcional)'), { target: { value: '2027-12-31' } })
    const inicial = within(dialogo).getByLabelText('Valor inicial')
    expect(inicial).toHaveValue('0,00')
    await user.type(inicial, '100000')
    expect(inicial).toHaveValue('1.000,00')
    await user.type(within(dialogo).getByLabelText('Descrição (opcional)'), '  Para o imprevisto  ')
    await user.click(within(dialogo).getByRole('button', { name: 'cor verde' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas')[0]!.corpo).toMatchObject({
      valor_inicial: '1000.00',
      data_alvo: '2027-12-31',
      descricao: 'Para o imprevisto',
    })
  })

  it('nome vazio é recusado na tela, junto ao campo, sem chamar a API', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe o nome da meta.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByLabelText('Nome')).toHaveFocus()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(0)
  })

  it('nome só com espaços também é recusado', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), '   ')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe o nome da meta.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(0)
  })

  it('alvo vazio ou zero é recusado sem chamar a API', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe um valor-alvo maior que zero.')).toBeInTheDocument()
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '0')
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveValue('0,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe um valor-alvo maior que zero.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(0)
  })

  it('sem cor escolhida pede a cor e não chama a API', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe a cor da meta.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(0)
  })

  it('erro do servidor aparece junto ao campo e na mensagem do topo, e o formulário continua aberto', async () => {
    const api = simularApi({
      'GET /api/metas': json(LISTA_VAZIA),
      'POST /api/metas': erroApi(422, 'VALIDACAO', 'Dados inválidos.', {
        valor_alvo: 'O valor-alvo deve ser maior que zero.',
      }),
    })
    const { user } = renderizarApp('/metas')
    await user.click(await screen.findByRole('button', { name: 'Nova meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova meta' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('O valor-alvo deve ser maior que zero.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Dados inválidos.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveFocus()
    expect(api.chamadasDe('POST /api/metas')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Nova meta' })).toBeInTheDocument()
  })

  it('erro sem campo (SEM_VINCULO) mostra só a mensagem do servidor', async () => {
    simularApi({
      'GET /api/metas': json(LISTA_VAZIA),
      'POST /api/metas': erroApi(403, 'SEM_VINCULO', 'Você não tem um casal vinculado.'),
    })
    const { user } = renderizarApp('/metas')
    await user.click(await screen.findByRole('button', { name: 'Nova meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova meta' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Reserva')
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'cor azul' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Você não tem um casal vinculado.')).toBeInTheDocument()
  })
})

describe('FormMeta: modelos (CA-6.02)', () => {
  it('escolher "Viagem" preenche nome, ícone e cor, e tudo pode ser alterado antes de salvar', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.click(within(dialogo).getByRole('button', { name: 'Viagem' }))
    const nome = within(dialogo).getByLabelText('Nome')
    expect(nome).toHaveValue('Viagem')
    expect(within(dialogo).getByRole('button', { name: 'cor ciano' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveValue('')

    await user.clear(nome)
    await user.type(nome, 'Viagem à Itália')
    await user.click(within(dialogo).getByRole('button', { name: 'cor rosa' }))
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '2000000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas')[0]!.corpo).toMatchObject({
      nome: 'Viagem à Itália',
      cor: '#D81B60',
      icone: 'plane',
      valor_alvo: '20000.00',
    })
  })

  it('o modelo preenche o ícone do próprio modelo', async () => {
    const { user, api, dialogo } = await abrirNovaMeta()
    await user.click(within(dialogo).getByRole('button', { name: 'Casamento' }))
    await user.type(within(dialogo).getByLabelText('Valor-alvo'), '100000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas')[0]!.corpo).toMatchObject({
      nome: 'Casamento',
      icone: 'heart',
      cor: '#D81B60',
    })
  })

  it('"Personalizado" preserva o nome já digitado e usa o ícone Alvo', async () => {
    const { user, dialogo } = await abrirNovaMeta()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Minha meta')
    await user.click(within(dialogo).getByRole('button', { name: 'Personalizado' }))
    expect(within(dialogo).getByLabelText('Nome')).toHaveValue('Minha meta')
    expect(within(dialogo).getByRole('button', { name: 'cor azul-acinzentado' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('FormMeta: editar (CA-6.12)', () => {
  it('abre com os dados da meta e não mostra o seletor de modelos', async () => {
    simularApi(rotasDetalhe(detalhe([])))
    const { user } = renderizarApp('/metas/5')
    await user.click(await screen.findByRole('button', { name: 'Editar meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar meta' })
    expect(within(dialogo).getByLabelText('Nome')).toHaveValue('Viagem')
    expect(within(dialogo).getByLabelText('Valor-alvo')).toHaveValue('10.000,00')
    expect(within(dialogo).getByLabelText('Data-alvo (opcional)')).toHaveValue('2027-06-30')
    expect(within(dialogo).getByLabelText('Valor inicial')).toHaveValue('1.000,00')
    expect(within(dialogo).getByLabelText('Descrição (opcional)')).toHaveValue('Europa')
    expect(within(dialogo).queryByText('Modelo')).not.toBeInTheDocument()
  })

  it('editar o alvo envia PATCH com o novo alvo', async () => {
    const api = simularApi(
      rotasDetalhe(detalhe([]), { 'PATCH /api/metas/5': ({ corpo }) => json({ ...META, ...(corpo as object) }) }),
    )
    const { user } = renderizarApp('/metas/5')
    await user.click(await screen.findByRole('button', { name: 'Editar meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar meta' })
    const alvo = within(dialogo).getByLabelText('Valor-alvo')
    await user.clear(alvo)
    await user.type(alvo, '2000000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/metas/5')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/metas/5')[0]!.corpo).toMatchObject({ valor_alvo: '20000.00', nome: 'Viagem' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('esvaziar data-alvo e descrição envia null para removê-los', async () => {
    const api = simularApi(rotasDetalhe(detalhe([]), { 'PATCH /api/metas/5': json(META) }))
    const { user } = renderizarApp('/metas/5')
    await user.click(await screen.findByRole('button', { name: 'Editar meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar meta' })
    fireEvent.change(within(dialogo).getByLabelText('Data-alvo (opcional)'), { target: { value: '' } })
    await user.clear(within(dialogo).getByLabelText('Descrição (opcional)'))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/metas/5')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/metas/5')[0]!.corpo).toMatchObject({ data_alvo: null, descricao: null })
  })

  it('recusa do servidor ao editar mostra a mensagem e mantém o formulário', async () => {
    simularApi(
      rotasDetalhe(detalhe([]), {
        'PATCH /api/metas/5': erroApi(409, 'META_FICARIA_NEGATIVA', 'O valor inicial deixaria a meta negativa.', {
          valor_inicial: 'Valor inicial inválido.',
        }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await user.click(await screen.findByRole('button', { name: 'Editar meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar meta' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('O valor inicial deixaria a meta negativa.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Valor inicial inválido.')).toBeInTheDocument()
  })
})

describe('FormMovimentoMeta: aplicar e resgatar (CA-6.04, CA-6.05)', () => {
  async function abrir(botao: 'Aplicar' | 'Resgatar', sobre: Record<string, Handler> = {}) {
    const api = simularApi(
      rotasDetalhe(detalhe([]), {
        'POST /api/metas/5/aplicacoes': ({ corpo }) => json({ id: 21, ...(corpo as object) }, 201),
        'POST /api/metas/5/resgates': ({ corpo }) => json({ id: 22, ...(corpo as object) }, 201),
        ...sobre,
      }),
    )
    const r = renderizarApp('/metas/5')
    await r.user.click(await screen.findByRole('button', { name: botao }))
    const dialogo = await screen.findByRole('dialog', { name: botao })
    return { ...r, api, dialogo }
  }

  it('aplicar abre com hoje, "Foi aplicado" marcado e sem campo de conta nem de dono', async () => {
    const { dialogo } = await abrir('Aplicar')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-15')
    expect(within(dialogo).getByLabelText('Foi aplicado')).toBeChecked()
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('0,00')
    expect(within(dialogo).queryByLabelText(/conta/i)).not.toBeInTheDocument()
    expect(within(dialogo).queryByLabelText(/dono/i)).not.toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('aplicar R$ 500,00 confirmada envia valor, data de hoje e situação confirmada, sem meta_id nem conta', async () => {
    const { user, api, dialogo } = await abrir('Aplicar')
    await user.type(within(dialogo).getByLabelText('Valor'), '50000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/aplicacoes')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/aplicacoes')[0]!.corpo).toEqual({
      valor: '500.00',
      data: '2026-10-15',
      situacao: 'confirmada',
    })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a descrição digitada vai aparada; vazia é omitida', async () => {
    const { user, api, dialogo } = await abrir('Aplicar')
    await user.type(within(dialogo).getByLabelText('Valor'), '100')
    await user.type(within(dialogo).getByLabelText('Descrição'), ' CDB ')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/aplicacoes')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/aplicacoes')[0]!.corpo).toEqual({
      valor: '1.00',
      data: '2026-10-15',
      situacao: 'confirmada',
      descricao: 'CDB',
    })
  })

  it('escolher data futura desmarca "Foi aplicado" e envia prevista (B1 da t212)', async () => {
    const { user, api, dialogo } = await abrir('Aplicar')
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-12-10' } })
    expect(within(dialogo).getByLabelText('Foi aplicado')).not.toBeChecked()
    await user.type(within(dialogo).getByLabelText('Valor'), '70000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/aplicacoes')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/aplicacoes')[0]!.corpo).toMatchObject({
      data: '2026-12-10',
      valor: '700.00',
      situacao: 'prevista',
    })
  })

  it('voltar a uma data de hoje ou passada marca "Foi aplicado" de novo', async () => {
    const { user, dialogo } = await abrir('Aplicar')
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-12-10' } })
    expect(within(dialogo).getByLabelText('Foi aplicado')).not.toBeChecked()
    await user.click(within(dialogo).getByRole('button', { name: 'Ontem' }))
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-14')
    expect(within(dialogo).getByLabelText('Foi aplicado')).toBeChecked()
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-12-10' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Hoje' }))
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-15')
    expect(within(dialogo).getByLabelText('Foi aplicado')).toBeChecked()
  })

  it('"Outra data" leva o foco ao campo de data', async () => {
    const { user, dialogo } = await abrir('Aplicar')
    await user.click(within(dialogo).getByRole('button', { name: 'Outra data' }))
    expect(within(dialogo).getByLabelText('Data')).toHaveFocus()
  })

  it('a pessoa pode desmarcar "Foi aplicado" para registrar uma aplicação prevista', async () => {
    const { user, api, dialogo } = await abrir('Aplicar')
    await user.click(within(dialogo).getByLabelText('Foi aplicado'))
    await user.type(within(dialogo).getByLabelText('Valor'), '100')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/aplicacoes')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/aplicacoes')[0]!.corpo).toMatchObject({ situacao: 'prevista' })
  })

  it('resgatar usa a rota de resgates e o rótulo "Foi resgatado"', async () => {
    const { user, api, dialogo } = await abrir('Resgatar')
    expect(within(dialogo).getByLabelText('Foi resgatado')).toBeChecked()
    await user.type(within(dialogo).getByLabelText('Valor'), '40000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/resgates')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/resgates')[0]!.corpo).toMatchObject({ valor: '400.00', situacao: 'confirmada' })
    expect(api.chamadasDe('POST /api/metas/5/aplicacoes')).toHaveLength(0)
  })

  it('resgate acima do valor atual recusado pelo servidor mostra a mensagem junto ao campo e no topo', async () => {
    const { user, dialogo } = await abrir('Resgatar', {
      'POST /api/metas/5/resgates': erroApi(409, 'META_FICARIA_NEGATIVA', 'O resgate é maior que o valor atual da meta.', {
        valor: 'Maior que o valor atual.',
      }),
    })
    await user.type(within(dialogo).getByLabelText('Valor'), '160000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Maior que o valor atual.')).toBeInTheDocument()
    expect(within(dialogo).getByText('O resgate é maior que o valor atual da meta.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialogo).getByLabelText('Valor')).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Resgatar' })).toBeInTheDocument()
  })

  it('valor 0 recusado pelo servidor mostra a mensagem e mantém o formulário aberto', async () => {
    const { user, dialogo } = await abrir('Aplicar', {
      'POST /api/metas/5/aplicacoes': erroApi(422, 'VALIDACAO', 'O valor deve ser maior que zero.', {
        valor: 'O valor deve ser maior que zero.',
      }),
    })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect((await within(dialogo).findAllByText('O valor deve ser maior que zero.')).length).toBeGreaterThan(0)
  })

  it('conta arquivada (CA-6.14): a recusa do servidor aparece em alerta', async () => {
    const { user, dialogo } = await abrir('Aplicar', {
      'POST /api/metas/5/aplicacoes': erroApi(409, 'CONTA_ARQUIVADA', 'A conta conjunta está arquivada.'),
    })
    await user.type(within(dialogo).getByLabelText('Valor'), '100')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A conta conjunta está arquivada.')
  })
})

describe('FormMovimentoMeta: editar (CA-6.12)', () => {
  it('editar aplicação abre com o valor, a data e a situação do movimento', async () => {
    simularApi(rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11, valor: '500.00', descricao: 'CDB' })])))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('500,00')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-05')
    expect(within(dialogo).getByLabelText('Descrição')).toHaveValue('CDB')
    expect(within(dialogo).getByLabelText('Foi aplicado')).toBeChecked()
  })

  it('editar de R$ 500,00 para R$ 400,00 envia PATCH do lançamento com valor, data, descrição e situação', async () => {
    const api = simularApi(
      rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11, valor: '500.00' })]), {
        'PATCH /api/lancamentos/11': ({ corpo }) => json({ id: 11, ...(corpo as object) }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    const valor = within(dialogo).getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '40000')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/lancamentos/11')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/lancamentos/11')[0]!.corpo).toEqual({
      valor: '400.00',
      data: '2026-10-05',
      descricao: null,
      situacao: 'confirmada',
    })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('na edição, trocar a data para o futuro não muda a situação (vale a da API)', async () => {
    const api = simularApi(
      rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11 })]), { 'PATCH /api/lancamentos/11': json({ id: 11 }) }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-12-10' } })
    expect(within(dialogo).getByLabelText('Foi aplicado')).toBeChecked()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/lancamentos/11')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/lancamentos/11')[0]!.corpo).toMatchObject({ situacao: 'confirmada' })
  })

  it('resgate guardado negativo abre sem sinal e é enviado positivo', async () => {
    const api = simularApi(
      rotasDetalhe(detalhe([mov({ tipo: 'resgate', id: 13, valor: '-300.00' })]), {
        'PATCH /api/lancamentos/13': json({ id: 13 }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Resgate')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar resgate' })
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('300,00')
    expect(within(dialogo).getByLabelText('Foi resgatado')).toBeChecked()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/lancamentos/13')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/lancamentos/13')[0]!.corpo).toMatchObject({ valor: '300.00' })
  })

  it('movimento atrasado abre como previsto', async () => {
    simularApi(rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11, situacao: 'atrasada' })])))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    expect(within(dialogo).getByLabelText('Foi aplicado')).not.toBeChecked()
  })

  it('descrição apagada na edição vai como null', async () => {
    const api = simularApi(
      rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11, descricao: 'CDB' })]), {
        'PATCH /api/lancamentos/11': json({ id: 11 }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    await user.clear(within(dialogo).getByLabelText('Descrição'))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/lancamentos/11')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/lancamentos/11')[0]!.corpo).toMatchObject({ descricao: null })
  })

  it('edição que faria um resgate superar o valor atual é recusada e a mensagem aparece', async () => {
    simularApi(
      rotasDetalhe(detalhe([mov({ tipo: 'aplicacao', id: 11 })]), {
        'PATCH /api/lancamentos/11': erroApi(409, 'META_FICARIA_NEGATIVA', 'Um resgate existente passaria a superar o valor atual.'),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Aplicação')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar aplicação' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Um resgate existente passaria a superar o valor atual.',
    )
  })
})

describe('FormAtualizarValor: registrar rendimento (CA-6.06, I1 e I2 da t212)', () => {
  async function abrir(sobre: Record<string, Handler> = {}) {
    const api = simularApi(rotasDetalhe(detalhe([]), sobre))
    const r = renderizarApp('/metas/5')
    await r.user.click(await screen.findByRole('button', { name: 'Atualizar valor atual' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Atualizar valor atual' })
    return { ...r, api, dialogo }
  }

  it('abre com o valor atual da meta no campo, não com 0,00 (I2)', async () => {
    const { dialogo } = await abrir()
    expect(within(dialogo).getByLabelText('Valor atual')).toHaveValue('1.500,00')
  })

  it('salvar sem alterar envia o valor atual da meta, nunca zero (I2)', async () => {
    const { user, api, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': json({ rendimento: null, meta: META }, 201),
    })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/rendimentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/rendimentos')[0]!.corpo).toEqual({ valor_atual: '1500.00' })
  })

  it('informar R$ 1.600,00 envia valor_atual e fecha o formulário ao registrar o rendimento', async () => {
    const { user, api, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': json(
        { rendimento: { id: 30, meta_id: 5, data: '2026-10-15', valor: '100.00' }, meta: META },
        201,
      ),
    })
    const campo = within(dialogo).getByLabelText('Valor atual')
    await user.clear(campo)
    await user.type(campo, '160000')
    expect(campo).toHaveValue('1.600,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('POST /api/metas/5/rendimentos')).toHaveLength(1))
    expect(api.chamadasDe('POST /api/metas/5/rendimentos')[0]!.corpo).toEqual({ valor_atual: '1600.00' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('valor igual ao atual (rendimento: null): avisa que nada mudou e mantém o formulário aberto (I1)', async () => {
    const { user, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': json({ rendimento: null, meta: META }, 201),
    })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'O valor informado é igual ao valor atual da meta; nada foi alterado.',
    )
    expect(screen.getByRole('dialog', { name: 'Atualizar valor atual' })).toBeInTheDocument()
  })

  it('com rendimento: null as consultas são invalidadas (a meta é buscada de novo)', async () => {
    const { user, api, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': json({ rendimento: null, meta: META }, 201),
    })
    const antes = api.chamadasDe('GET /api/metas/5').length
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await within(dialogo).findByRole('alert')
    await vi.waitFor(() => expect(api.chamadasDe('GET /api/metas/5').length).toBeGreaterThan(antes))
  })

  it('o aviso some ao salvar de novo e vem o resultado seguinte', async () => {
    let n = 0
    const { user, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': () => {
        n += 1
        return n === 1
          ? json({ rendimento: null, meta: META }, 201)
          : json({ rendimento: { id: 31, meta_id: 5, data: '2026-10-15', valor: '10.00' }, meta: META }, 201)
      },
    })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await within(dialogo).findByRole('alert')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('erro do servidor aparece junto ao campo e no topo', async () => {
    const { user, dialogo } = await abrir({
      'POST /api/metas/5/rendimentos': erroApi(422, 'VALIDACAO', 'Valor atual inválido.', {
        valor_atual: 'Informe um valor igual ou maior que zero.',
      }),
    })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Informe um valor igual ou maior que zero.')).toBeInTheDocument()
    expect(within(dialogo).getByText('Valor atual inválido.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Valor atual')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('FormAtualizarValor: editar rendimento (CA-6.06)', () => {
  const rend = (p: Partial<MovimentoMeta> = {}) => mov({ tipo: 'rendimento', id: 14, valor: '100.00', situacao: null, ...p })

  it('abre com o valor e a data do rendimento', async () => {
    simularApi(rotasDetalhe(detalhe([rend({ data: '2026-10-05' })])))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Rendimento')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar rendimento' })
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('100,00')
    expect(within(dialogo).getByLabelText('Data')).toHaveValue('2026-10-05')
  })

  it('rendimento negativo abre com sinal e o botão "Valor negativo" pressionado', async () => {
    simularApi(rotasDetalhe(detalhe([rend({ valor: '-50.00' })])))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Rendimento')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar rendimento' })
    expect(within(dialogo).getByLabelText('Valor')).toHaveValue('-50,00')
    expect(within(dialogo).getByRole('button', { name: 'Valor negativo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('alternar o sinal envia o rendimento negativo', async () => {
    const api = simularApi(rotasDetalhe(detalhe([rend()]), { 'PATCH /api/metas/5/rendimentos/14': json({ id: 14 }) }))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Rendimento')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar rendimento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Valor negativo' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/metas/5/rendimentos/14')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/metas/5/rendimentos/14')[0]!.corpo).toEqual({ valor: '-100.00', data: '2026-10-05' })
  })

  it('mudar a data para uma data futura é aceito e enviado', async () => {
    const api = simularApi(rotasDetalhe(detalhe([rend()]), { 'PATCH /api/metas/5/rendimentos/14': json({ id: 14 }) }))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Rendimento')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar rendimento' })
    fireEvent.change(within(dialogo).getByLabelText('Data'), { target: { value: '2026-12-31' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await vi.waitFor(() => expect(api.chamadasDe('PATCH /api/metas/5/rendimentos/14')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/metas/5/rendimentos/14')[0]!.corpo).toEqual({ valor: '100.00', data: '2026-12-31' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('erro do servidor ao editar rendimento aparece junto ao campo', async () => {
    simularApi(
      rotasDetalhe(detalhe([rend()]), {
        'PATCH /api/metas/5/rendimentos/14': erroApi(409, 'META_FICARIA_NEGATIVA', 'A meta ficaria negativa.', {
          valor: 'Valor deixaria a meta negativa.',
        }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(linhaDoHistorico('Rendimento')).getByRole('button', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar rendimento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Valor deixaria a meta negativa.')).toBeInTheDocument()
    expect(within(dialogo).getByText('A meta ficaria negativa.')).toBeInTheDocument()
  })
})
