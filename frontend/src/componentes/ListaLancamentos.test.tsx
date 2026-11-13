import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router'
import type { FaturaResumo } from '../api/cartoes'
import type { DiaLista, ItemLancamentoLista } from '../api/controle'
import type { LancamentoSaida } from '../api/lancamentos'
import { ListaLancamentos } from './ListaLancamentos'

afterEach(async () => {
  cleanup()
  // O BottomSheet do DialogoAlcance chama history.back() ao desmontar (popstate assíncrono).
  await new Promise((r) => setTimeout(r, 10))
})

function lancamento(sobre: Partial<LancamentoSaida> = {}): LancamentoSaida {
  return {
    id: 1,
    tipo: 'despesa',
    valor: '100.00',
    data: '2026-10-05',
    situacao: 'confirmada',
    descricao: 'Mercado',
    categoria: { id: 10, nome: 'Mercado', pai_nome: null, cor: '#112233', icone: 'tag' },
    dono_usuario_id: 1,
    conta_id: 1,
    conta_destino_id: null,
    aporte: false,
    tags: [],
    observacao: null,
    criado_por: { id: 1, nome: 'Ana' },
    criado_em: '2026-10-01T10:00:00',
    recorrente: false,
    recorrencia_id: null,
    numero_recorrencia: null,
    total_ocorrencias: null,
    meta: null,
    ...sobre,
  }
}

function item(sobre: Partial<LancamentoSaida> = {}, rotulo = 'Despesa'): ItemLancamentoLista {
  return {
    kind: 'lancamento',
    lancamento: lancamento(sobre),
    conta_nome: 'Conta Ana',
    conta_destino_nome: null,
    rotulo,
    meta: null,
  }
}

const FATURA: FaturaResumo = {
  cartao_id: 7,
  cartao_nome: 'Nubank',
  conta_id: 2,
  mes: '2026-10',
  id: 30,
  status: 'vencida',
  fechamento: '2026-10-10',
  vencimento: '2026-10-20',
  valor: '800.00',
  pagamento: null,
}

function dia(data: string, itens: DiaLista['itens'], saldo: string): DiaLista {
  return { data, itens, saldo_fim_do_dia: saldo }
}

function montar(props: Partial<React.ComponentProps<typeof ListaLancamentos>> & { dias: DiaLista[] }) {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ListaLancamentos {...props} />
    </MemoryRouter>,
  )
  return { user }
}

describe('ListaLancamentos (CA-5.05, CA-5.06, CA-5.07, CA-5.12, CA-5.13, CA-0.07)', () => {
  it('agrupa por dia, mostra descrição, categoria, conta, valor e situação, e o saldo do fim do dia', () => {
    montar({
      dias: [
        dia('2026-10-05', [item()], '900.00'),
        dia('2026-10-10', [item({ id: 2, valor: '50.00', situacao: 'prevista', descricao: 'Luz' })], '850.00'),
      ],
    })
    expect(screen.getByRole('heading', { name: '05/10/2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '10/10/2026' })).toBeInTheDocument()
    expect(screen.getByText('Mercado', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByText('Despesa · Mercado · Conta Ana')).toHaveLength(2)
    expect(screen.getByText('-R$ 100,00')).toBeInTheDocument()
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByText('Prevista')).toBeInTheDocument()
    expect(screen.getByText('R$ 900,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 850,00')).toBeInTheDocument()
    expect(screen.getAllByText(/Saldo do fim do dia/)).toHaveLength(2)
  })

  it('lançamento atrasado mostra o texto "Atrasada" além da cor', () => {
    montar({ dias: [dia('2026-10-05', [item({ situacao: 'atrasada' })], '0.00')] })
    expect(screen.getByText('Atrasada')).toBeInTheDocument()
  })

  it('receita aparece com sinal positivo', () => {
    montar({ dias: [dia('2026-10-05', [item({ tipo: 'receita', valor: '6000.00' }, 'Receita')], '6000.00')] })
    expect(screen.getByText('+R$ 6.000,00')).toBeInTheDocument()
  })

  it('fatura vira uma linha com ícone de cartão, nome do cartão, valor e status, sem Editar/Excluir/Confirmar', () => {
    const { container } = render(
      <MemoryRouter>
        <ListaLancamentos
          dias={[dia('2026-10-20', [{ kind: 'fatura', data: '2026-10-20', fatura: FATURA }], '650.00')]}
          aoConfirmar={() => {}}
          aoEditar={() => {}}
          aoExcluir={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Nubank')).toBeInTheDocument()
    expect(screen.getByText('Fatura do cartão')).toBeInTheDocument()
    expect(screen.getByText('-R$ 800,00')).toBeInTheDocument()
    expect(screen.getByText('Vencida')).toBeInTheDocument()
    expect(container.querySelector('svg.lucide-credit-card')).not.toBeNull()
    for (const nome of ['Confirmar', 'Editar', 'Excluir']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
    expect(screen.getByText('R$ 650,00')).toBeInTheDocument()
  })

  it('tocar na linha da fatura chama aoAbrirFatura com a fatura', async () => {
    const aoAbrirFatura = vi.fn()
    const { user } = montar({
      dias: [dia('2026-10-20', [{ kind: 'fatura', data: '2026-10-20', fatura: FATURA }], '650.00')],
      aoAbrirFatura,
    })
    await user.click(screen.getByRole('button', { name: /Nubank/ }))
    expect(aoAbrirFatura).toHaveBeenCalledWith(FATURA)
  })

  it('cada status de fatura mostra seu texto', () => {
    const status = ['aberta', 'fechada', 'vencida', 'zerada', 'paga'] as const
    const rotulos = ['Aberta', 'Fechada', 'Vencida', 'Zerada', 'Paga']
    montar({
      dias: status.map((s, i) =>
        dia(`2026-10-0${i + 1}`, [{ kind: 'fatura', data: `2026-10-0${i + 1}`, fatura: { ...FATURA, cartao_id: i + 1, status: s } }], '0.00'),
      ),
    })
    for (const r of rotulos) expect(screen.getByText(r)).toBeInTheDocument()
  })

  it('Confirmar aparece só em lançamento não confirmado', async () => {
    const aoConfirmar = vi.fn()
    const { user } = montar({
      dias: [
        dia('2026-10-05', [item({ id: 1, situacao: 'confirmada' }), item({ id: 2, situacao: 'prevista', descricao: 'Luz' })], '0.00'),
      ],
      aoConfirmar,
    })
    const botoes = screen.getAllByRole('button', { name: 'Confirmar' })
    expect(botoes).toHaveLength(1)
    await user.click(botoes[0]!)
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('lançamento simples: Editar e Excluir chamam direto, sem perguntar o alcance', async () => {
    const aoEditar = vi.fn()
    const aoExcluir = vi.fn()
    const { user } = montar({ dias: [dia('2026-10-05', [item()], '0.00')], aoEditar, aoExcluir })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(aoEditar).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(aoExcluir).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lançamento recorrente: Editar pergunta o alcance e repassa a escolha', async () => {
    const aoEditar = vi.fn()
    const { user } = montar({ dias: [dia('2026-10-05', [item({ recorrente: true })], '0.00')], aoEditar })
    expect(screen.getByText('Recorrente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(aoEditar).not.toHaveBeenCalled()
    const dialogo = await screen.findByRole('dialog', { name: 'Editar lançamento recorrente' })
    await user.click(within(dialogo).getByRole('button', { name: 'Este e os pendentes' }))
    expect(aoEditar).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'este_e_pendentes')
  })

  it('lançamento recorrente: Excluir pergunta o alcance e Cancelar não exclui', async () => {
    const aoExcluir = vi.fn()
    const { user } = montar({ dias: [dia('2026-10-05', [item({ recorrente: true })], '0.00')], aoExcluir })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir lançamento recorrente' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(aoExcluir).not.toHaveBeenCalled()
  })

  it('tocar no lançamento chama aoAbrir', async () => {
    const aoAbrir = vi.fn()
    const { user } = montar({ dias: [dia('2026-10-05', [item()], '0.00')], aoAbrir })
    await user.click(screen.getByRole('button', { name: /Mercado/ }))
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('sem ações recebidas, não mostra botões de Confirmar, Editar nem Excluir', () => {
    montar({ dias: [dia('2026-10-05', [item({ situacao: 'prevista' })], '0.00')] })
    for (const nome of ['Confirmar', 'Editar', 'Excluir']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull()
    }
  })

  it('sem dias mostra o estado vazio e "Novo lançamento" chama aoNovo', async () => {
    const aoNovo = vi.fn()
    const { user } = montar({ dias: [], aoNovo })
    expect(screen.getByText('Nenhum lançamento para mostrar.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    expect(aoNovo).toHaveBeenCalledOnce()
  })

  it('sem dias e sem aoNovo não oferece o botão', () => {
    montar({ dias: [] })
    expect(screen.queryByRole('button', { name: 'Novo lançamento' })).toBeNull()
  })

  it('transferência mostra origem e destino; conta não visível aparece como "Conta externa"', () => {
    montar({
      dias: [
        dia(
          '2026-10-05',
          [
            {
              ...item({ tipo: 'transferencia', descricao: null, conta_destino_id: 2 }, 'Transferência'),
              conta_nome: 'Conta Ana',
              conta_destino_nome: null,
            },
          ],
          '0.00',
        ),
      ],
    })
    expect(screen.getByText(/Conta Ana → Conta externa/)).toBeInTheDocument()
  })
})
