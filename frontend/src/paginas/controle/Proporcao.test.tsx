import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { ProporcaoSaida } from '../../api/proporcao'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

type Pessoa = ProporcaoSaida['pessoas'][number]

const ANA: Pessoa = {
  usuario_id: 1,
  nome: 'Ana',
  porcentagem: '60.00',
  devido: '600.00',
  aportado: '100.00',
  faltante: '500.00',
  excedente: '0.00',
}
const BRUNO: Pessoa = {
  usuario_id: 2,
  nome: 'Bruno',
  porcentagem: '40.00',
  devido: '400.00',
  aportado: '450.00',
  faltante: '0.00',
  excedente: '50.00',
}

function proporcao(sobre: Partial<ProporcaoSaida> = {}): ProporcaoSaida {
  return {
    mes: '2026-10',
    base_despesas_casal: '1000.00',
    origem_porcentagem: 'mes',
    mes_origem: null,
    pessoas: [ANA, BRUNO],
    ...sobre,
  }
}

// Texto de dinheiro sem depender do espaço (comum ou não separável) entre "R$" e o número.
const brl = (valor: string) => new RegExp(`^-?R\\$\\s${valor.replace(/\./g, '\\.')}$`)

function card(nome: string): HTMLElement {
  const secao = screen.getByRole('heading', { level: 2, name: nome }).closest('section')
  if (!secao) throw new Error(`card de ${nome} não encontrado`)
  return secao
}

function valorDe(secao: HTMLElement, rotulo: string): string {
  const termo = within(secao).getByText(rotulo, { selector: 'dt' })
  return termo.nextElementSibling?.textContent ?? ''
}

describe('tela "Proporção e aporte do mês" (CA-3.20)', () => {
  it('mostra porcentagem, devido, aportado e faltante de cada pessoa e a base de despesas', async () => {
    simularApi({ 'GET /api/proporcao': json(proporcao()) })
    renderizarApp('/controle/proporcao')

    await screen.findByRole('heading', { level: 2, name: 'Ana' })
    const ana = card('Ana')
    expect(within(ana).getByText('60,00%')).toBeInTheDocument()
    expect(valorDe(ana, 'Devido')).toMatch(brl('600,00'))
    expect(valorDe(ana, 'Aportado')).toMatch(brl('100,00'))
    expect(valorDe(ana, 'Faltante')).toMatch(brl('500,00'))
    expect(within(ana).queryByText('Excedente')).not.toBeInTheDocument()

    const bruno = card('Bruno')
    expect(within(bruno).getByText('40,00%')).toBeInTheDocument()
    expect(valorDe(bruno, 'Devido')).toMatch(brl('400,00'))
    expect(valorDe(bruno, 'Aportado')).toMatch(brl('450,00'))

    const base = card('Base de despesas do casal')
    expect(base.textContent).toMatch(/R\$\s1\.000,00/)
  })

  it('mostra Excedente no lugar de Faltante quando a pessoa aportou mais que o devido', async () => {
    simularApi({ 'GET /api/proporcao': json(proporcao()) })
    renderizarApp('/controle/proporcao')

    await screen.findByRole('heading', { level: 2, name: 'Bruno' })
    const bruno = card('Bruno')
    expect(valorDe(bruno, 'Excedente')).toMatch(brl('50,00'))
    expect(within(bruno).queryByText('Faltante')).not.toBeInTheDocument()
  })

  it('consulta o mês do seletor e, ao trocar o mês, mostra os valores do novo mês', async () => {
    const api = simularApi({
      'GET /api/proporcao': ({ params }) =>
        params.mes === '2026-09'
          ? json(
              proporcao({
                mes: '2026-09',
                base_despesas_casal: '200.00',
                pessoas: [
                  { ...ANA, devido: '120.00', aportado: '120.00', faltante: '0.00' },
                  { ...BRUNO, devido: '80.00', aportado: '80.00', excedente: '0.00' },
                ],
              }),
            )
          : json(proporcao()),
    })
    const { user } = renderizarApp('/controle/proporcao')

    await screen.findByText('outubro de 2026')
    await waitFor(() => expect(valorDe(card('Ana'), 'Devido')).toMatch(brl('600,00')))
    expect(api.chamadasDe('GET /api/proporcao')[0]?.params.mes).toBe('2026-10')

    await user.click(screen.getByRole('button', { name: 'mês anterior' }))

    await screen.findByText('setembro de 2026')
    await waitFor(() => expect(valorDe(card('Ana'), 'Devido')).toMatch(brl('120,00')))
    expect(api.chamadasDe('GET /api/proporcao').at(-1)?.params.mes).toBe('2026-09')
    expect(card('Base de despesas do casal').textContent).toMatch(/R\$\s200,00/)
  })

  it('sem despesas do casal no mês, avisa e mostra a base zerada', async () => {
    simularApi({
      'GET /api/proporcao': json(proporcao({ base_despesas_casal: '0.00' })),
    })
    renderizarApp('/controle/proporcao')

    expect(await screen.findByText('Sem despesas do casal neste mês')).toBeInTheDocument()
  })
})

describe('origem da porcentagem (CA-3.20, RF-3.20)', () => {
  it('sem Salário no histórico mostra 50% para cada com o aviso', async () => {
    simularApi({
      'GET /api/proporcao': json(
        proporcao({
          origem_porcentagem: 'padrao_50_50',
          pessoas: [
            { ...ANA, porcentagem: '50.00', devido: '500.00', faltante: '400.00' },
            { ...BRUNO, porcentagem: '50.00', devido: '500.00', aportado: '0.00', faltante: '500.00', excedente: '0.00' },
          ],
        }),
      ),
    })
    renderizarApp('/controle/proporcao')

    expect(await screen.findByText('50% para cada, por falta de Salário no histórico')).toBeInTheDocument()
    expect(within(card('Ana')).getByText('50,00%')).toBeInTheDocument()
    expect(within(card('Bruno')).getByText('50,00%')).toBeInTheDocument()
  })

  it('porcentagem herdada informa o mês de origem', async () => {
    simularApi({
      'GET /api/proporcao': json(proporcao({ origem_porcentagem: 'herdada', mes_origem: '2026-09' })),
    })
    renderizarApp('/controle/proporcao')

    expect(await screen.findByText('Porcentagem herdada de setembro de 2026')).toBeInTheDocument()
  })

  it('porcentagem do próprio mês não mostra aviso de origem', async () => {
    simularApi({ 'GET /api/proporcao': json(proporcao()) })
    renderizarApp('/controle/proporcao')

    await screen.findByRole('heading', { level: 2, name: 'Ana' })
    expect(screen.queryByText(/herdada/)).not.toBeInTheDocument()
    expect(screen.queryByText(/50% para cada/)).not.toBeInTheDocument()
  })
})

describe('erros da consulta (4xx não repete)', () => {
  it('sem vínculo mostra o estado vazio com ação para o vínculo e consulta uma vez só', async () => {
    const api = simularApi({
      'GET /api/proporcao': erroApi(409, 'SEM_VINCULO', 'Você não está vinculado.'),
    })
    const { user } = renderizarApp('/controle/proporcao')

    expect(await screen.findByText('Você ainda não está vinculado a um casal.')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/proporcao')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Ana' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ir para o vínculo' }))
    expect(screen.queryByText('Você ainda não está vinculado a um casal.')).not.toBeInTheDocument()
  })

  it('outro 4xx mostra a mensagem do servidor e não repete a consulta', async () => {
    const api = simularApi({
      'GET /api/proporcao': erroApi(422, 'MES_INVALIDO', 'Mês fora do intervalo.'),
    })
    renderizarApp('/controle/proporcao')

    // findBy espera até 1 s: com repetição (atraso de 1 s) o alerta não apareceria a tempo.
    expect(await screen.findByRole('alert')).toHaveTextContent('Mês fora do intervalo.')
    expect(api.chamadasDe('GET /api/proporcao')).toHaveLength(1)
  })
})
