import { afterEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { CartaoSaida, FaturaResumo, FaturaSaida } from '../api/cartoes'
import type { ContaSaida } from '../api/contas'
import {
  erroApi,
  json,
  limparTudo,
  renderizarApp,
  simularApi,
  simularResizeObserver,
} from '../testes/utilitarios'

afterEach(limparTudo)

const CONTA: ContaSaida = {
  id: 1,
  nome: 'Conta Teste',
  instituicao: null,
  tipo: 'conta_corrente',
  cor: '#336699',
  saldo_inicial: '0.00',
  dono_usuario_id: 1,
  arquivado: false,
  casal_encerrado: false,
  saldo_atual: '0.00',
  saldo_previsto: '0.00',
}

const RESUMO_FATURA: FaturaResumo = {
  cartao_id: 1,
  cartao_nome: 'Cartão Teste',
  conta_id: 1,
  mes: '2026-10',
  id: null,
  status: 'aberta',
  fechamento: '2026-10-10',
  vencimento: '2026-10-20',
  valor: '0.00',
  pagamento: null,
}

const CARTAO: CartaoSaida = {
  id: 1,
  nome: 'Cartão Teste',
  conta_id: 1,
  dono_usuario_id: 1,
  limite: '1000.00',
  dia_fechamento: 10,
  dia_vencimento: 20,
  bandeira: null,
  conta_arquivada: false,
  limite_usado: '0.00',
  limite_disponivel: '1000.00',
  uso_porcentagem: '0.00',
  fatura_corrente: RESUMO_FATURA,
}

const FATURA: FaturaSaida = {
  ...RESUMO_FATURA,
  bruto: '0.00',
  credito_recebido: '0.00',
  credito_repassado: '0.00',
  itens: [],
  conta_arquivada: false,
  pode_pagar: false,
  editavel: true,
}

const NAO_ENCONTRADO = erroApi(404, 'NAO_ENCONTRADO', 'Não encontrado.')

type Alvo = { tipo: 'titulo'; nome: string } | { tipo: 'texto'; texto: string }
const titulo = (nome: string): Alvo => ({ tipo: 'titulo', nome })
const texto = (t: string): Alvo => ({ tipo: 'texto', texto: t })

// As 27 rotas de App.tsx (front.md §4), com parâmetros preenchidos, e o que cada tela real mostra.
const ROTAS: [string, Alvo][] = [
  ['/', titulo('Início')],
  ['/projecao', titulo('Projeção de saldo')],
  ['/controle', titulo('Controle')],
  ['/controle/contas', titulo('Contas')],
  ['/controle/contas/arquivadas', titulo('Contas arquivadas')],
  ['/controle/contas/1', titulo('Conta Teste')],
  ['/controle/categorias', titulo('Categorias')],
  ['/controle/tags', titulo('Tags')],
  ['/controle/proporcao', titulo('Proporção e aporte do mês')],
  ['/controle/balanco', titulo('Balanço do mês')],
  ['/controle/relatorios', titulo('Relatórios')],
  ['/controle/relatorios/receitas', texto('Relatório não encontrado.')],
  ['/cartoes', titulo('Cartões')],
  ['/cartoes/novo', titulo('Novo cartão')],
  ['/cartoes/1', titulo('Cartão Teste')],
  ['/cartoes/1/faturas/2026-10', titulo('Cartão Teste')],
  ['/metas', titulo('Metas')],
  ['/metas/1', texto('Meta não encontrada.')],
  ['/planejamento', titulo('Planejamento')],
  ['/planejamento/orcamento', titulo('Orçamento')],
  ['/planejamento/cenarios', titulo('Cenários')],
  ['/planejamento/cenarios/1', texto('Cenário não encontrado.')],
  ['/planejamento/plano-de-metas', titulo('Plano de metas')],
  ['/configuracoes', titulo('Configurações')],
  ['/configuracoes/perfil', titulo('Perfil e tema')],
  ['/configuracoes/senha', titulo('Alterar senha')],
  ['/configuracoes/vinculo', titulo('Vínculo do casal')],
]

function simular() {
  simularResizeObserver()
  return simularApi({
    'GET /api/contas/1': json(CONTA),
    'GET /api/cartoes/1': json(CARTAO),
    'GET /api/cartoes/1/faturas/2026-10': json(FATURA),
    'GET /api/metas/1': NAO_ENCONTRADO,
    'GET /api/cenarios/1': NAO_ENCONTRADO,
  })
}

describe('Shell e rotas (F4j)', () => {
  it('cobre as 27 rotas de App.tsx', () => {
    expect(ROTAS).toHaveLength(27)
  })

  it.each(ROTAS)('a rota %s renderiza a tela real dentro do Shell (main + barra inferior)', async (rota, alvo) => {
    simular()
    renderizarApp(rota)
    const principal = await screen.findByRole('main')
    if (alvo.tipo === 'titulo') {
      expect(await screen.findByRole('heading', { name: alvo.nome })).toBeInTheDocument()
    } else {
      expect(await screen.findByText(alvo.texto)).toBeInTheDocument()
    }
    expect(principal).toContainElement(
      alvo.tipo === 'titulo'
        ? screen.getByRole('heading', { name: alvo.nome })
        : screen.getByText(alvo.texto),
    )
    expect(principal).not.toHaveTextContent('ainda não está disponível')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })

  it.each(['/qualquer', '/controle/inexistente', '/cartoes/1/faturas'])(
    'a rota desconhecida %s cai no 404 dentro do Shell',
    async (rota) => {
      simular()
      renderizarApp(rota)
      expect(await screen.findByText('Página não encontrada.')).toBeInTheDocument()
      expect(screen.getByRole('main')).toHaveTextContent('Página não encontrada.')
      expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    },
  )
})
