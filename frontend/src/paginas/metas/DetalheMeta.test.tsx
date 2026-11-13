import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ListaControle } from '../../api/controle'
import type { LancamentoSaida } from '../../api/lancamentos'
import type { MetaDetalhe, MovimentoMeta } from '../../api/metas'
import {
  erroApi,
  fixarHoje,
  json,
  limparTudo,
  renderizarApp,
  semConteudo,
  simularApi,
  type Handler,
} from '../../testes/utilitarios'

// O BottomSheet chama history.back() ao desmontar (popstate assíncrono): espera assentar.
afterEach(async () => {
  limparTudo()
  await new Promise((r) => setTimeout(r, 20))
})

const INICIAL: MovimentoMeta = {
  tipo: 'inicial', id: null, data: '2026-01-10', valor: '1000.00', situacao: null, descricao: null,
}
const APLICACAO: MovimentoMeta = {
  tipo: 'aplicacao', id: 11, data: '2026-02-10', valor: '2000.00', situacao: 'confirmada', descricao: 'CDB',
}
const PREVISTA: MovimentoMeta = {
  tipo: 'aplicacao', id: 12, data: '2026-12-10', valor: '700.00', situacao: 'prevista', descricao: null,
}
const RESGATE: MovimentoMeta = {
  tipo: 'resgate', id: 13, data: '2026-03-10', valor: '-300.00', situacao: 'confirmada', descricao: null,
}
const RENDIMENTO: MovimentoMeta = {
  tipo: 'rendimento', id: 14, data: '2026-04-10', valor: '100.00', situacao: null, descricao: null,
}
const RENDIMENTO_NEGATIVO: MovimentoMeta = {
  tipo: 'rendimento', id: 15, data: '2026-05-10', valor: '-50.00', situacao: null, descricao: null,
}

function detalhe(parcial: Partial<MetaDetalhe> = {}): MetaDetalhe {
  return {
    id: 5,
    nome: 'Viagem',
    valor_alvo: '10000.00',
    data_alvo: '2027-06-30',
    valor_inicial: '1000.00',
    cor: '#00838F',
    icone: 'plane',
    descricao: 'Europa em 2027',
    valor_atual: '3300.00',
    aplicado_liquido: '2200.00',
    rendeu: '100.00',
    falta: '6700.00',
    porcentagem: '33.00',
    situacao: 'em_andamento',
    casal_encerrado: false,
    movimentos: [INICIAL, APLICACAO, PREVISTA, RESGATE, RENDIMENTO],
    ...parcial,
  }
}

function rotas(m: MetaDetalhe, sobre: Record<string, Handler> = {}): Record<string, Handler> {
  return { 'GET /api/metas/5': json(m), 'GET /api/metas': json({ patrimonio_total: '0.00', metas: [] }), ...sobre }
}

function itemHistorico(rotulo: string, indice = 0): HTMLElement {
  const itens = screen.getAllByText(rotulo, { selector: 'span' })
  return itens[indice]!.closest('li') as HTMLElement
}

describe('DetalheMeta: indicadores (CA-6.07, CA-6.11)', () => {
  it('mostra nome, descrição, data-alvo e os cinco indicadores do servidor', async () => {
    simularApi(rotas(detalhe()))
    renderizarApp('/metas/5')
    expect(await screen.findByRole('heading', { level: 1, name: 'Viagem' })).toBeInTheDocument()
    expect(screen.getByText('Europa em 2027')).toBeInTheDocument()
    expect(screen.getByText('30/06/2027')).toBeInTheDocument()
    const valor = (rotulo: string) => screen.getByText(rotulo, { selector: 'dt' }).nextSibling
    expect(valor('Valor atual')).toHaveTextContent('R$ 3.300,00')
    expect(valor('Alvo')).toHaveTextContent('R$ 10.000,00')
    expect(valor('Aplicado líquido')).toHaveTextContent('R$ 2.200,00')
    expect(valor('Rendeu')).toHaveTextContent('R$ 100,00')
    expect(valor('Falta')).toHaveTextContent('R$ 6.700,00')
    expect(screen.getByText('33,00%')).toBeInTheDocument()
  })

  it('omite descrição e data-alvo quando a meta não tem', async () => {
    simularApi(rotas(detalhe({ descricao: null, data_alvo: null })))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    expect(screen.queryByText(/Data-alvo/)).not.toBeInTheDocument()
    expect(screen.queryByText('Europa em 2027')).not.toBeInTheDocument()
  })

  it('meta acima do alvo mostra 110,00 % e falta R$ 0,00', async () => {
    simularApi(
      rotas(detalhe({ valor_alvo: '1000.00', valor_atual: '1100.00', falta: '0.00', porcentagem: '110.00', situacao: 'concluida' })),
    )
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    expect(screen.getByText('110,00%')).toBeInTheDocument()
    expect(screen.getByText('Falta', { selector: 'dt' }).nextSibling).toHaveTextContent('R$ 0,00')
  })

  it('rendeu negativo aparece com sinal de menos', async () => {
    simularApi(rotas(detalhe({ rendeu: '-50.00' })))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    expect(screen.getByText('Rendeu', { selector: 'dt' }).nextSibling).toHaveTextContent('-R$ 50,00')
  })

  it('o link Metas leva de volta à lista', async () => {
    simularApi(rotas(detalhe()))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    // Há dois links "Metas" (voltar e aba da navegação): o de voltar vem primeiro na página.
    await user.click(screen.getAllByRole('link', { name: 'Metas' })[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: 'Metas' })).toBeInTheDocument()
  })
})

describe('DetalheMeta: histórico (CA-6.11)', () => {
  it('lista inicial, aplicações, resgate e rendimento com data, valor e situação', async () => {
    simularApi(rotas(detalhe({ movimentos: [INICIAL, APLICACAO, PREVISTA, RESGATE, RENDIMENTO, RENDIMENTO_NEGATIVO] })))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })

    const inicial = itemHistorico('Valor inicial')
    expect(inicial).toHaveTextContent('10/01/2026')
    expect(inicial).toHaveTextContent('R$ 1.000,00')

    const aplicacao = itemHistorico('Aplicação', 0)
    expect(aplicacao).toHaveTextContent('10/02/2026')
    expect(aplicacao).toHaveTextContent('+R$ 2.000,00')
    expect(aplicacao).toHaveTextContent('Confirmada')
    expect(aplicacao).toHaveTextContent('CDB')

    expect(itemHistorico('Aplicação', 1)).toHaveTextContent('Prevista')

    const resgate = itemHistorico('Resgate')
    expect(resgate).toHaveTextContent('-R$ 300,00')
    expect(resgate).toHaveTextContent('Confirmada')

    expect(itemHistorico('Rendimento', 0)).toHaveTextContent('+R$ 100,00')
    expect(itemHistorico('Rendimento', 1)).toHaveTextContent('-R$ 50,00')
  })

  it('o valor inicial não tem ações; os demais têm Editar e Excluir', async () => {
    simularApi(rotas(detalhe()))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    expect(within(itemHistorico('Valor inicial')).queryByRole('button')).not.toBeInTheDocument()
    for (const [rotulo, i] of [['Aplicação', 0], ['Aplicação', 1], ['Resgate', 0], ['Rendimento', 0]] as const) {
      const li = itemHistorico(rotulo, i)
      expect(within(li).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
      expect(within(li).getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
    }
  })

  it('Confirmar só aparece em aplicação ou resgate ainda não confirmado', async () => {
    simularApi(rotas(detalhe()))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    expect(within(itemHistorico('Aplicação', 1)).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(within(itemHistorico('Aplicação', 0)).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(within(itemHistorico('Resgate')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(within(itemHistorico('Rendimento')).queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('confirmar uma aplicação prevista chama a confirmação com o valor real', async () => {
    const api = simularApi(
      rotas(detalhe(), {
        'POST /api/lancamentos/12/confirmar': ({ corpo }) => json({ ...(corpo as object) }),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Aplicação', 1)).getByRole('button', { name: 'Confirmar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmar lançamento' })
    expect(within(dialogo).getByLabelText('Valor real')).toHaveValue('700,00')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    expect(api.chamadasDe('POST /api/lancamentos/12/confirmar')[0]!.corpo).toEqual({ valor: '700.00' })
  })

  it('confirmar um resgate prevista abre o valor sem sinal', async () => {
    const resgatePrevisto: MovimentoMeta = { ...RESGATE, id: 16, situacao: 'prevista', valor: '-400.00' }
    simularApi(rotas(detalhe({ movimentos: [INICIAL, resgatePrevisto] })))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Resgate')).getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByLabelText('Valor real')).toHaveValue('400,00')
  })

  it('excluir uma aplicação pede confirmação e chama a exclusão do lançamento', async () => {
    const api = simularApi(rotas(detalhe(), { 'DELETE /api/lancamentos/11': semConteudo() }))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Aplicação', 0)).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir movimento' })
    expect(api.chamadasDe('DELETE /api/lancamentos/11')).toHaveLength(0)
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    expect(api.chamadasDe('DELETE /api/lancamentos/11')).toHaveLength(1)
  })

  it('excluir um rendimento chama a rota de rendimentos da meta', async () => {
    const api = simularApi(rotas(detalhe(), { 'DELETE /api/metas/5/rendimentos/14': semConteudo() }))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Rendimento')).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir movimento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    expect(api.chamadasDe('DELETE /api/metas/5/rendimentos/14')).toHaveLength(1)
  })

  it('cancelar a exclusão não chama a API', async () => {
    const api = simularApi(rotas(detalhe()))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Resgate')).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir movimento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.chamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(0)
  })

  it('erro do servidor ao excluir movimento aparece em alerta', async () => {
    simularApi(
      rotas(detalhe(), {
        'DELETE /api/lancamentos/11': erroApi(409, 'META_FICARIA_NEGATIVA', 'O resgate existente passaria a superar o valor atual.'),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 2, name: 'Histórico' })
    await user.click(within(itemHistorico('Aplicação', 0)).getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir movimento' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O resgate existente passaria a superar o valor atual.')
  })
})

describe('DetalheMeta: ações e casal desfeito (CA-6.11, CA-6.13, CA-6.14)', () => {
  it('mostra Aplicar, Resgatar, Atualizar valor atual, Editar meta e Excluir meta', async () => {
    simularApi(rotas(detalhe()))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    for (const nome of ['Aplicar', 'Resgatar', 'Atualizar valor atual', 'Editar meta', 'Excluir meta']) {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument()
    }
  })

  it('com casal desfeito só consulta: aviso, nenhum botão de escrita e histórico sem ações', async () => {
    simularApi(rotas(detalhe({ casal_encerrado: true })))
    renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    expect(screen.getByText('O casal foi desfeito: esta meta só pode ser consultada.')).toBeInTheDocument()
    for (const nome of ['Aplicar', 'Resgatar', 'Atualizar valor atual', 'Editar meta', 'Excluir meta', 'Editar', 'Excluir', 'Confirmar']) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()
    }
    expect(itemHistorico('Aplicação', 1)).toHaveTextContent('Prevista')
  })

  it('excluir meta sem movimentos pede confirmação, chama DELETE e volta à lista', async () => {
    const api = simularApi(rotas(detalhe({ movimentos: [INICIAL] }), { 'DELETE /api/metas/5': semConteudo() }))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    await user.click(screen.getByRole('button', { name: 'Excluir meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir meta' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Metas' })).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/metas/5')).toHaveLength(1)
  })

  it('exclusão recusada pelo servidor (meta com movimentos) mostra a mensagem e continua no detalhe', async () => {
    simularApi(
      rotas(detalhe(), {
        'DELETE /api/metas/5': erroApi(409, 'META_COM_MOVIMENTOS', 'A meta tem movimentos e não pode ser excluída.'),
      }),
    )
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    await user.click(screen.getByRole('button', { name: 'Excluir meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir meta' })
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A meta tem movimentos e não pode ser excluída.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Viagem' })).toBeInTheDocument()
  })

  it('cancelar a exclusão da meta não chama a API', async () => {
    const api = simularApi(rotas(detalhe()))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    await user.click(screen.getByRole('button', { name: 'Excluir meta' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir meta' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(api.chamadas.filter((c) => c.metodo === 'DELETE')).toHaveLength(0)
  })

  it('cada botão abre o seu formulário', async () => {
    simularApi(rotas(detalhe()))
    const { user } = renderizarApp('/metas/5')
    await screen.findByRole('heading', { level: 1, name: 'Viagem' })
    for (const [botao, titulo] of [
      ['Aplicar', 'Aplicar'],
      ['Resgatar', 'Resgatar'],
      ['Atualizar valor atual', 'Atualizar valor atual'],
      ['Editar meta', 'Editar meta'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: botao }))
      expect(await screen.findByRole('dialog', { name: titulo })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })
})

describe('DetalheMeta: carga e erros', () => {
  it('meta inexistente (404) mostra "Meta não encontrada."', async () => {
    simularApi({ 'GET /api/metas/5': erroApi(404, 'NAO_ENCONTRADO', 'Meta não encontrada.') })
    renderizarApp('/metas/5')
    expect(await screen.findByRole('alert')).toHaveTextContent('Meta não encontrada.')
  })

  it('identificador inválido na rota não consulta a API', async () => {
    const api = simularApi({})
    renderizarApp('/metas/abc')
    expect(await screen.findByRole('alert')).toHaveTextContent('Meta não encontrada.')
    expect(api.chamadasDe('GET /api/metas/abc')).toHaveLength(0)
    expect(api.chamadas.filter((c) => c.caminho.startsWith('/api/metas'))).toHaveLength(0)
  })

  it('outro erro do servidor mostra a mensagem dele', async () => {
    simularApi({ 'GET /api/metas/5': erroApi(403, 'SEM_VINCULO', 'Você não tem um casal vinculado.') })
    renderizarApp('/metas/5')
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem um casal vinculado.')
  })
})

describe('Controle -> detalhe da meta (CA-6.15, S1 da t212)', () => {
  it('a aplicação na lista do Controle mostra "Aplicação em meta" e o link "Abrir meta" abre o detalhe', async () => {
    fixarHoje('2026-10-15')
    const par = (previsto: string, realizado: string) => ({ previsto, realizado })
    const lanc: LancamentoSaida = {
      id: 11, tipo: 'aplicacao_meta', valor: '500.00', data: '2026-10-05', situacao: 'confirmada',
      descricao: null, categoria: null, dono_usuario_id: null, conta_id: 2, conta_destino_id: null,
      aporte: false, tags: [], observacao: null, criado_por: { id: 1, nome: 'Ana' },
      criado_em: '2026-10-01T10:00:00', recorrente: false, recorrencia_id: null,
      numero_recorrencia: null, total_ocorrencias: null, meta: { id: 5, nome: 'Viagem' },
    } as unknown as LancamentoSaida
    const controle: ListaControle = {
      mes: '2026-10',
      filtros_ativos: false,
      resumo: {
        entradas: par('0.00', '0.00'), saidas: par('0.00', '0.00'), saldo: par('0.00', '0.00'), saldo_atual_total: '0.00',
      },
      dias: [
        {
          data: '2026-10-05',
          saldo_fim_do_dia: '0.00',
          itens: [
            {
              kind: 'lancamento', lancamento: lanc, conta_nome: 'Conta conjunta', conta_destino_nome: null,
              rotulo: 'Aplicação em meta', meta: { id: 5, nome: 'Viagem' },
            },
          ],
        },
      ],
    }
    simularApi(
      rotas(detalhe(), {
        'GET /api/controle/lista': json(controle),
        'GET /api/proporcao': json({ mes: '2026-10', base_despesas_casal: '0.00', origem_porcentagem: 'mes', mes_origem: null, pessoas: [] }),
        'GET /api/contas': json({ mes: '2026-10', contas: [], total_saldo_atual: null, total_saldo_previsto: null }),
        'GET /api/categorias': json([]),
        'GET /api/cartoes': json({ cartoes: [], limite_disponivel_total: '0.00', total_faturas_mes: '0.00' }),
        'GET /api/tags': json([]),
      }),
    )
    const { user } = renderizarApp('/controle')
    expect(await screen.findByText(/Aplicação em meta · Viagem/)).toBeInTheDocument()
    const abrir = screen.getByRole('link', { name: 'Abrir meta' })
    expect(abrir).toHaveAttribute('href', '/metas/5')
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
    await user.click(abrir)
    expect(await screen.findByRole('heading', { level: 1, name: 'Viagem' })).toBeInTheDocument()
  })
})
