import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient } from '@tanstack/react-query'
import type { ContaSaida, ListagemContas } from '../../api/contas'
import type { ListaControle } from '../../api/controle'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

function conta(parcial: Partial<ContaSaida> & { id: number; nome: string }): ContaSaida {
  return {
    instituicao: null,
    tipo: 'conta_corrente',
    cor: '#1E88E5',
    saldo_inicial: '0.00',
    dono_usuario_id: 1,
    arquivado: false,
    casal_encerrado: false,
    saldo_atual: '0.00',
    saldo_previsto: '0.00',
    ...parcial,
  }
}

const ANA = conta({
  id: 1,
  nome: 'Conta da Ana',
  instituicao: 'Banco X',
  saldo_inicial: '1000.00',
  saldo_atual: '850.00',
  saldo_previsto: '800.00',
})
const BRUNO = conta({
  id: 2,
  nome: 'Conta do Bruno',
  dono_usuario_id: 2,
  saldo_inicial: '200.00',
  saldo_atual: '200.00',
  saldo_previsto: '200.00',
})
const CONJUNTA = conta({
  id: 3,
  nome: 'Conta conjunta',
  dono_usuario_id: null,
  tipo: 'poupanca',
  saldo_inicial: '0.00',
  saldo_atual: '50.00',
  saldo_previsto: '50.00',
})

function listagem(contas: ContaSaida[]): ListagemContas {
  const soma = (campo: 'saldo_atual' | 'saldo_previsto') =>
    contas.reduce((t, c) => t + Math.round(Number(c[campo]) * 100), 0) / 100
  return {
    mes: '2026-10',
    contas,
    total_saldo_atual: contas.length ? soma('saldo_atual').toFixed(2) : null,
    total_saldo_previsto: contas.length ? soma('saldo_previsto').toFixed(2) : null,
  }
}

const listaVazia: ListaControle = {
  mes: '2026-10',
  filtros_ativos: false,
  resumo: {
    entradas: { previsto: '0.00', realizado: '0.00' },
    saidas: { previsto: '0.00', realizado: '0.00' },
    saldo: { previsto: '0.00', realizado: '0.00' },
    saldo_atual_total: '0.00',
  },
  dias: [],
}

async function abrirEdicao(user: ReturnType<typeof renderizarApp>['user'], nomeConta: string) {
  const card = (await screen.findByRole('heading', { name: nomeConta })).closest('article')!
  await user.click(within(card).getByRole('button', { name: 'Editar' }))
  return screen.findByRole('dialog', { name: 'Editar conta' })
}

describe('Contas (CA-2.01, CA-2.06)', () => {
  it('mostra um card por conta ativa com nome, instituição e saldos', async () => {
    simularApi({ 'GET /api/contas': json(listagem([ANA, BRUNO, CONJUNTA])) })
    renderizarApp('/controle/contas')
    expect(await screen.findByRole('heading', { name: 'Conta da Ana' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByText('Banco X')).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: 'Conta da Ana' }).closest('article')!
    expect(within(card).getByText('R$ 850,00')).toBeInTheDocument()
    expect(within(card).getByText('R$ 800,00')).toBeInTheDocument()
  })

  it('mostra o total de saldo atual e previsto vindos da API (soma dos cards)', async () => {
    simularApi({ 'GET /api/contas': json(listagem([ANA, BRUNO, CONJUNTA])) })
    renderizarApp('/controle/contas')
    await screen.findByRole('heading', { name: 'Conta da Ana' })
    const atual = screen.getByText('Saldo atual total').parentElement!
    const previsto = screen.getByText('Saldo previsto total').parentElement!
    expect(within(atual).getByText('R$ 1.100,00')).toBeInTheDocument()
    expect(within(previsto).getByText('R$ 1.050,00')).toBeInTheDocument()
  })

  it('não oferece criar nova conta nem excluir conta', async () => {
    simularApi({ 'GET /api/contas': json(listagem([ANA, BRUNO, CONJUNTA])) })
    renderizarApp('/controle/contas')
    await screen.findByRole('heading', { name: 'Conta da Ana' })
    expect(screen.queryByRole('button', { name: /nova conta|adicionar conta|criar conta/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /excluir/i })).toBeNull()
  })

  it('exibe saldo inicial negativo no card (-R$ 50,00)', async () => {
    const negativa = conta({ id: 1, nome: 'Carteira', saldo_inicial: '-50.00', saldo_atual: '-50.00', saldo_previsto: '-50.00' })
    simularApi({ 'GET /api/contas': json(listagem([negativa])) })
    renderizarApp('/controle/contas')
    const card = (await screen.findByRole('heading', { name: 'Carteira' })).closest('article')!
    expect(within(card).getAllByText('-R$ 50,00')).toHaveLength(2)
  })

  it('mostra o estado vazio quando não há conta ativa', async () => {
    simularApi({ 'GET /api/contas': json(listagem([])) })
    renderizarApp('/controle/contas')
    expect(await screen.findByText('Nenhuma conta ativa neste momento.')).toBeInTheDocument()
  })

  it('mostra a mensagem do servidor quando a lista falha', async () => {
    simularApi({ 'GET /api/contas': erroApi(500, 'ERRO_INTERNO', 'Falha ao carregar contas.') })
    renderizarApp('/controle/contas')
    expect(await screen.findByText('Falha ao carregar contas.')).toBeInTheDocument()
  })

  it('"Contas arquivadas" leva à tela de contas arquivadas', async () => {
    simularApi({
      'GET /api/contas': (c) =>
        c.params.arquivadas === 'true' ? json(listagem([])) : json(listagem([ANA])),
    })
    const { user } = renderizarApp('/controle/contas')
    await user.click(await screen.findByRole('link', { name: 'Contas arquivadas' }))
    expect(await screen.findByRole('heading', { name: 'Contas arquivadas' })).toBeInTheDocument()
  })

  it('"Ver lançamentos" abre o controle da conta', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'GET /api/contas/1': json(ANA),
      'GET /api/controle/lista': json(listaVazia),
    })
    const { user } = renderizarApp('/controle/contas')
    await user.click(await screen.findByRole('button', { name: 'Ver lançamentos' }))
    expect(await screen.findByRole('heading', { name: 'Conta da Ana' })).toBeInTheDocument()
  })
})

describe('FormConta: editar (CA-2.01, CA-2.02)', () => {
  it('envia nome, instituição, tipo e cor editados', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': json(ANA),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    const nome = within(dialogo).getByLabelText('Nome')
    await user.clear(nome)
    await user.type(nome, 'Principal')
    const inst = within(dialogo).getByLabelText('Instituição')
    await user.clear(inst)
    await user.type(inst, 'Banco Y')
    await user.selectOptions(within(dialogo).getByLabelText('Tipo'), 'poupanca')
    await user.click(within(dialogo).getByRole('button', { name: 'cor verde' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    await screen.findByRole('heading', { name: 'Conta da Ana' })
    const chamadas = api.chamadasDe('PATCH /api/contas/1')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.corpo).toEqual({
      nome: 'Principal',
      instituicao: 'Banco Y',
      tipo: 'poupanca',
      cor: '#2E7D32',
      saldo_inicial: '1000.00',
    })
  })

  it('fecha o formulário e recarrega as contas depois de salvar', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': json(ANA),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('GET /api/contas').length).toBeGreaterThanOrEqual(2)
  })

  it('instituição vazia é enviada como null', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': json(ANA),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.clear(within(dialogo).getByLabelText('Instituição'))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect((api.chamadasDe('PATCH /api/contas/1')[0]!.corpo as { instituicao: unknown }).instituicao).toBeNull()
  })

  it('editar o saldo inicial para R$ 800,00 envia "800.00"', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': json(ANA),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    const saldo = within(dialogo).getByLabelText('Saldo inicial')
    expect(saldo).toHaveValue('1.000,00')
    await user.clear(saldo)
    await user.type(saldo, '80000')
    expect(saldo).toHaveValue('800,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect((api.chamadasDe('PATCH /api/contas/1')[0]!.corpo as { saldo_inicial: string }).saldo_inicial).toBe('800.00')
  })

  it('aceita saldo inicial negativo (-R$ 50,00) pelo botão "Valor negativo"', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': json(ANA),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    const saldo = within(dialogo).getByLabelText('Saldo inicial')
    await user.clear(saldo)
    await user.type(saldo, '5000')
    await user.click(within(dialogo).getAllByRole('button', { name: 'Valor negativo' })[0]!)
    expect(saldo).toHaveValue('-50,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect((api.chamadasDe('PATCH /api/contas/1')[0]!.corpo as { saldo_inicial: string }).saldo_inicial).toBe('-50.00')
  })

  it('nome vazio mostra o erro junto ao campo, marca aria-invalid, foca e não chama a API', async () => {
    const api = simularApi({ 'GET /api/contas': json(listagem([ANA])) })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.clear(within(dialogo).getByLabelText('Nome'))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    const nome = within(dialogo).getByLabelText('Nome')
    expect(within(dialogo).getByText('Informe o nome da conta.')).toBeInTheDocument()
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveFocus()
    expect(api.chamadasDe('PATCH /api/contas/1')).toHaveLength(0)
  })

  it('erro do servidor em um campo aparece junto ao campo e o formulário continua aberto', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'PATCH /api/contas/1': erroApi(422, 'DADOS_INVALIDOS', 'Dados inválidos.', {
        saldo_inicial: 'Saldo inicial fora do limite.',
      }),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Saldo inicial fora do limite.')).toBeInTheDocument()
    const saldo = within(dialogo).getByLabelText('Saldo inicial')
    expect(saldo).toHaveAttribute('aria-invalid', 'true')
    expect(saldo).toHaveFocus()
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Dados inválidos.')
  })
})

describe('FormConta: reajuste de saldo (CA-2.04)', () => {
  it('informar R$ 900,00 envia saldo_real "900.00" e fecha o formulário', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'POST /api/contas/1/reajuste': json({ conta: ANA, lancamento: { id: 9 } }),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    const real = within(dialogo).getByLabelText('Saldo real')
    expect(real).toHaveValue('850,00')
    await user.clear(real)
    await user.type(real, '90000')
    await user.click(within(dialogo).getByRole('button', { name: 'Reajustar saldo' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/contas/1/reajuste')[0]!.corpo).toEqual({ saldo_real: '900.00' })
  })

  it('reajuste para o mesmo saldo não cria lançamento: avisa e mantém o formulário aberto', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'POST /api/contas/1/reajuste': json({ conta: ANA, lancamento: null }),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Reajustar saldo' }))
    expect(
      await within(dialogo).findByText('O saldo já estava igual ao informado. Nenhum lançamento foi criado.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar conta' })).toBeInTheDocument()
  })

  it('erro do servidor no saldo real aparece junto ao campo', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'POST /api/contas/1/reajuste': erroApi(422, 'DADOS_INVALIDOS', 'Dados inválidos.', {
        saldo_real: 'Saldo real inválido.',
      }),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Reajustar saldo' }))
    expect(await within(dialogo).findByText('Saldo real inválido.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Saldo real')).toHaveAttribute('aria-invalid', 'true')
  })

  it('I2: depois do reajuste, o Controle logo em seguida mostra o ajuste (staleTime de produção)', async () => {
    let reajustado = false
    const ajuste = {
      kind: 'lancamento' as const,
      conta_nome: 'Conta da Ana',
      conta_destino_nome: null,
      rotulo: 'Reajuste de saldo',
      meta: null,
      lancamento: {
        id: 77,
        tipo: 'reajuste' as const,
        valor: '50.00',
        data: '2026-10-15',
        situacao: 'confirmada' as const,
        descricao: 'Ajuste de saldo',
        categoria: null,
        dono_usuario_id: 1,
        conta_id: 1,
        conta_destino_id: null,
        aporte: false,
        tags: [],
        observacao: null,
        criado_por: { id: 1, nome: 'Ana' },
        criado_em: '2026-10-15T10:00:00',
        recorrente: false,
        recorrencia_id: null,
        numero_recorrencia: null,
        total_ocorrencias: null,
        meta: null,
      },
    }
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'GET /api/categorias': json([]),
      'GET /api/cartoes': json({ cartoes: [] }),
      'POST /api/contas/1/reajuste': () => {
        reajustado = true
        return json({ conta: ANA, lancamento: ajuste.lancamento })
      },
      'GET /api/controle/lista': () =>
        json(
          reajustado
            ? {
                ...listaVazia,
                dias: [{ data: '2026-10-15', itens: [ajuste], saldo_fim_do_dia: '900.00' }],
              }
            : listaVazia,
        ),
    })
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })
    const { user } = renderizarApp('/controle', { cliente })
    // Controle carrega a lista (vazia) e fica "fresca" no cache.
    await screen.findByRole('heading', { name: 'Controle' })
    await user.click(await screen.findByRole('link', { name: 'Contas' }))
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Reajustar saldo' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: /Controle/ }))
    expect(await screen.findByText('Ajuste de saldo')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/controle/lista').length).toBeGreaterThanOrEqual(2)
  })
})

describe('FormConta: arquivar (CA-2.05)', () => {
  it('pede confirmação antes de arquivar e só chama a API ao confirmar', async () => {
    const api = simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'POST /api/contas/1/arquivar': json({ ...ANA, arquivado: true }),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar conta' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Arquivar conta' })
    expect(api.chamadasDe('POST /api/contas/1/arquivar')).toHaveLength(0)
    await user.click(within(confirmacao).getByRole('button', { name: 'Arquivar' }))
    await screen.findByRole('heading', { name: 'Contas' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/contas/1/arquivar')).toHaveLength(1)
  })

  it('cancelar a confirmação não arquiva e mantém o formulário', async () => {
    const api = simularApi({ 'GET /api/contas': json(listagem([ANA])) })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar conta' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Arquivar conta' })
    await user.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Arquivar conta' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Editar conta' })).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/contas/1/arquivar')).toHaveLength(0)
  })

  it('recusa do servidor ao arquivar mostra a mensagem e mantém o formulário', async () => {
    simularApi({
      'GET /api/contas': json(listagem([ANA])),
      'POST /api/contas/1/arquivar': erroApi(409, 'CONTA_EM_USO', 'Não é possível arquivar esta conta.'),
    })
    const { user } = renderizarApp('/controle/contas')
    const dialogo = await abrirEdicao(user, 'Conta da Ana')
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar conta' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Arquivar conta' })
    await user.click(within(confirmacao).getByRole('button', { name: 'Arquivar' }))
    expect(await screen.findByText('Não é possível arquivar esta conta.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar conta' })).toBeInTheDocument()
  })
})
