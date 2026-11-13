import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient } from '@tanstack/react-query'
import type { CategoriaSaida } from '../../api/categorias'
import type { ListaControle } from '../../api/controle'
import { erroApi, json, limparTudo, renderizarApp, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

type Base = Omit<CategoriaSaida, 'subcategorias'>

function base(parcial: Partial<Base> & { id: number; nome: string }): Base {
  return {
    tipo: 'despesa',
    icone: 'ellipsis',
    cor: '#6D4C41',
    fixa: false,
    arquivado: false,
    categoria_pai_id: null,
    ...parcial,
  }
}

function raiz(parcial: Partial<Base> & { id: number; nome: string }, subs: Base[] = []): CategoriaSaida {
  return { ...base(parcial), subcategorias: subs }
}

const MORADIA = raiz({ id: 1, nome: 'Moradia', cor: '#1E88E5', icone: 'house' }, [
  base({ id: 11, nome: 'Aluguel', cor: '#1E88E5', categoria_pai_id: 1 }),
])
const VARIAVEIS = raiz({ id: 2, nome: 'Gastos variáveis', cor: '#F9A825', icone: 'shopping-cart' })
const MERCADO = raiz({ id: 3, nome: 'Mercado', cor: '#2E7D32', icone: 'shopping-cart' })
const SALARIO = raiz({ id: 20, nome: 'Salário', tipo: 'receita', fixa: true, cor: '#2E7D32', icone: 'banknote' }, [
  base({ id: 21, nome: 'Férias', tipo: 'receita', cor: '#2E7D32', categoria_pai_id: 20 }),
])
const DESPESAS = [MORADIA, VARIAVEIS, MERCADO]

function arvorePorTipo(c: { params: Record<string, string> }) {
  return json(c.params.tipo === 'receita' ? [SALARIO] : DESPESAS)
}

function itemDe(nome: string) {
  return screen.getByText(nome, { selector: 'span' }).closest('div')!
}

async function abrirFormEdicao(user: ReturnType<typeof renderizarApp>['user'], nome: string) {
  await user.click(within(itemDe(nome)).getByRole('button', { name: 'Editar' }))
  return screen.findByRole('dialog', { name: /Editar (categoria|subcategoria)/ })
}

describe('Categorias: lista (CA-2.07, CA-2.08)', () => {
  it('lista a árvore de despesas ativa com subcategorias, consultando só o tipo despesa', async () => {
    const api = simularApi({ 'GET /api/categorias': arvorePorTipo })
    renderizarApp('/controle/categorias')
    expect(await screen.findByText('Moradia')).toBeInTheDocument()
    expect(screen.getByText('Aluguel')).toBeInTheDocument()
    expect(screen.getByText('Gastos variáveis')).toBeInTheDocument()
    expect(api.chamadasDe('GET /api/categorias')[0]!.params).toEqual({ tipo: 'despesa' })
  })

  it('a aba Receitas consulta o tipo receita e mostra Salário', async () => {
    const api = simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Receitas' }))
    expect(await screen.findByText('Salário')).toBeInTheDocument()
    expect(screen.queryByText('Moradia')).toBeNull()
    expect(api.chamadasDe('GET /api/categorias').some((c) => c.params.tipo === 'receita')).toBe(true)
  })

  it('não há "Nova subcategoria" em subcategoria (sem nível 3)', async () => {
    simularApi({ 'GET /api/categorias': arvorePorTipo })
    renderizarApp('/controle/categorias')
    await screen.findByText('Aluguel')
    expect(within(itemDe('Moradia')).getByRole('button', { name: 'Nova subcategoria' })).toBeInTheDocument()
    expect(within(itemDe('Aluguel')).queryByRole('button', { name: 'Nova subcategoria' })).toBeNull()
  })

  it('erro ao listar mostra a mensagem do servidor', async () => {
    simularApi({ 'GET /api/categorias': erroApi(500, 'ERRO_INTERNO', 'Falha ao listar categorias.') })
    renderizarApp('/controle/categorias')
    expect(await screen.findByText('Falha ao listar categorias.')).toBeInTheDocument()
  })
})

describe('Categorias: estado vazio (CA-0.07)', () => {
  it('sem categorias mostra a frase e o botão "Nova categoria" do estado vazio, que abre o formulário', async () => {
    simularApi({ 'GET /api/categorias': json([]) })
    const { user } = renderizarApp('/controle/categorias')
    const frase = await screen.findByText('Nenhuma categoria de despesa ativa.')
    await user.click(within(frase.parentElement!).getByRole('button', { name: 'Nova categoria' }))
    expect(await screen.findByRole('dialog', { name: 'Nova categoria' })).toBeInTheDocument()
  })
})

describe('FormCategoria: criar (CA-2.07)', () => {
  it('cria categoria com nome, ícone e cor', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias': json(raiz({ id: 50, nome: 'Pets' }), 201),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.type(within(dialogo).getByLabelText('Nome'), '  Pets ')
    await user.click(within(dialogo).getByRole('button', { name: 'Coração' }))
    await user.click(within(dialogo).getByRole('button', { name: 'cor rosa' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Moradia')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/categorias')[0]!.corpo).toEqual({
      tipo: 'despesa',
      nome: 'Pets',
      icone: 'heart',
      cor: '#D81B60',
    })
  })

  it('cria subcategoria dentro da categoria, sem enviar cor e sem seletor de cor', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias': json(base({ id: 51, nome: 'Condomínio', categoria_pai_id: 1 }), 201),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(within(itemDe('Moradia')).getByRole('button', { name: 'Nova subcategoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova subcategoria' })
    expect(within(dialogo).queryByRole('group', { name: 'Cor' })).toBeNull()
    await user.type(within(dialogo).getByLabelText('Nome'), 'Condomínio')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Moradia')
    expect(api.chamadasDe('POST /api/categorias')[0]!.corpo).toEqual({
      tipo: 'despesa',
      nome: 'Condomínio',
      icone: 'ellipsis',
      categoria_pai_id: 1,
    })
  })

  it('nome vazio mostra o erro junto ao campo, foca o nome e não chama a API', async () => {
    const api = simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    const nome = within(dialogo).getByLabelText('Nome')
    expect(within(dialogo).getByText('Informe o nome da categoria.')).toBeInTheDocument()
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveFocus()
    expect(api.chamadasDe('POST /api/categorias')).toHaveLength(0)
  })

  it('categoria raiz sem cor: mostra o erro de cor, marca aria-invalid e foca o campo de cor (t111r N1)', async () => {
    const api = simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Pets')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(within(dialogo).getByText('Informe a cor da categoria.')).toBeInTheDocument()
    const invalido = dialogo.querySelector<HTMLElement>('[aria-invalid="true"]')
    expect(invalido).not.toBeNull()
    expect(invalido).toContainElement(within(dialogo).getByRole('group', { name: 'Cor' }))
    expect(invalido).toHaveFocus()
    expect(api.chamadasDe('POST /api/categorias')).toHaveLength(0)
  })

  it('erro de ícone vindo do servidor: mostra a mensagem, marca aria-invalid e foca o seletor de ícone (t111r N1, t113)', async () => {
    simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias': erroApi(422, 'DADOS_INVALIDOS', 'Dados inválidos.', {
        icone: 'Ícone fora da lista.',
      }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Pets')
    await user.click(within(dialogo).getByRole('button', { name: 'cor rosa' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByText('Ícone fora da lista.')).toBeInTheDocument()
    const invalido = dialogo.querySelector<HTMLElement>('[aria-invalid="true"]')
    expect(invalido).not.toBeNull()
    expect(invalido).toContainElement(within(dialogo).getByRole('group', { name: 'Ícone' }))
    expect(invalido).toHaveFocus()
  })

  it('nome repetido recusado pelo servidor aparece junto ao campo nome', async () => {
    simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias': erroApi(409, 'CATEGORIA_JA_EXISTE', 'Já existe uma categoria com esse nome.', {
        nome: 'Já existe uma categoria com esse nome.',
      }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova categoria' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Mercado')
    await user.click(within(dialogo).getByRole('button', { name: 'cor verde' }))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    const nome = within(dialogo).getByLabelText('Nome')
    await within(dialogo).findAllByText('Já existe uma categoria com esse nome.')
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveFocus()
  })
})

describe('FormCategoria: editar (CA-2.08, CA-2.09, I3)', () => {
  it('permite renomear categoria padrão', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'PATCH /api/categorias/3': json(MERCADO),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    const dialogo = await abrirFormEdicao(user, 'Mercado')
    const nome = within(dialogo).getByLabelText('Nome')
    await user.clear(nome)
    await user.type(nome, 'Supermercado')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Moradia')
    expect((api.chamadasDe('PATCH /api/categorias/3')[0]!.corpo as { nome: string }).nome).toBe('Supermercado')
  })

  it('I3: editar "Gastos variáveis" (#F9A825) abre com a cor amarela marcada', async () => {
    simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Gastos variáveis')
    const dialogo = await abrirFormEdicao(user, 'Gastos variáveis')
    expect(within(dialogo).getByRole('button', { name: 'cor amarelo' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialogo).getAllByRole('button', { pressed: true }).filter((b) => b.getAttribute('aria-label')?.startsWith('cor '))).toHaveLength(1)
  })

  it('I3: sem tocar na cor, o PATCH mantém a cor original (#F9A825)', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'PATCH /api/categorias/2': json(VARIAVEIS),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Gastos variáveis')
    const dialogo = await abrirFormEdicao(user, 'Gastos variáveis')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Moradia')
    expect((api.chamadasDe('PATCH /api/categorias/2')[0]!.corpo as { cor: string }).cor).toBe('#F9A825')
  })

  it('Salário: nome desabilitado, não é enviado e não há "Arquivar" (CA-2.09)', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'PATCH /api/categorias/20': json(SALARIO),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Receitas' }))
    await screen.findByText('Salário')
    expect(within(itemDe('Salário')).queryByRole('button', { name: 'Arquivar' })).toBeNull()
    const dialogo = await abrirFormEdicao(user, 'Salário')
    expect(within(dialogo).getByLabelText('Nome')).toBeDisabled()
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Salário')
    expect(api.chamadasDe('PATCH /api/categorias/20')[0]!.corpo).not.toHaveProperty('nome')
  })

  it('subcategoria de Salário continua com nome editável e com "Arquivar"', async () => {
    simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Receitas' }))
    await screen.findByText('Férias')
    expect(within(itemDe('Férias')).getByRole('button', { name: 'Arquivar' })).toBeInTheDocument()
    const dialogo = await abrirFormEdicao(user, 'Férias')
    expect(within(dialogo).getByLabelText('Nome')).toBeEnabled()
  })

  it('adicionar a subcategoria "Bônus" ao Salário é aceito', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias': json(base({ id: 60, nome: 'Bônus', tipo: 'receita', categoria_pai_id: 20 }), 201),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Receitas' }))
    await screen.findByText('Salário')
    await user.click(within(itemDe('Salário')).getByRole('button', { name: 'Nova subcategoria' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova subcategoria' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Bônus')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Salário')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/categorias')[0]!.corpo).toMatchObject({
      tipo: 'receita',
      nome: 'Bônus',
      categoria_pai_id: 20,
    })
  })

  it('recusa do servidor ao editar Salário mostra a mensagem e mantém o formulário', async () => {
    simularApi({
      'GET /api/categorias': arvorePorTipo,
      'PATCH /api/categorias/20': erroApi(409, 'CATEGORIA_FIXA', 'A categoria Salário não pode ser alterada.'),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(screen.getByRole('button', { name: 'Receitas' }))
    await screen.findByText('Salário')
    const dialogo = await abrirFormEdicao(user, 'Salário')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A categoria Salário não pode ser alterada.')
    expect(screen.getByRole('dialog', { name: 'Editar categoria' })).toBeInTheDocument()
  })
})

describe('ArquivarCategoria (CA-2.10)', () => {
  it('categoria sem lançamentos é arquivada direto, sem pedir destino', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias/3/arquivar': json({ ...MERCADO, arquivado: true }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Arquivar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Arquivar categoria' })
    expect(within(dialogo).queryByLabelText('Categoria de destino')).toBeNull()
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar' }))
    await screen.findByText('Moradia')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/categorias/3/arquivar')[0]!.corpo).toEqual({})
  })

  it('categoria usada exige o destino: pede, valida e reenvia com mover_para_id', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias/3/arquivar': (c) =>
        (c.corpo as { mover_para_id?: number }).mover_para_id === undefined
          ? erroApi(409, 'CATEGORIA_EM_USO', 'A categoria tem lançamentos.')
          : json({ ...MERCADO, arquivado: true }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Arquivar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Arquivar categoria' })
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar' }))
    const destino = await within(dialogo).findByLabelText('Categoria de destino')
    expect(within(dialogo).getByText(/Escolha para onde eles vão/)).toBeInTheDocument()
    // Sem escolher destino, não reenvia.
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar e mover' }))
    expect(within(dialogo).getByText('Escolha a categoria para onde os lançamentos serão movidos.')).toBeInTheDocument()
    expect(destino).toHaveAttribute('aria-invalid', 'true')
    expect(destino).toHaveFocus()
    expect(api.chamadasDe('POST /api/categorias/3/arquivar')).toHaveLength(1)

    await user.selectOptions(destino, 'Gastos variáveis')
    await user.click(within(dialogo).getByRole('button', { name: 'Arquivar e mover' }))
    await screen.findByText('Moradia')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/categorias/3/arquivar')[1]!.corpo).toEqual({ mover_para_id: 2 })
  })

  it('destinos listam subcategorias como "Raiz > Sub" e excluem a própria categoria', async () => {
    simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    const destino = within(dialogo).getByLabelText('Categoria de destino')
    const opcoes = within(destino).getAllByRole('option').map((o) => o.textContent)
    expect(opcoes).toEqual(['Escolha uma categoria', 'Moradia', 'Moradia > Aluguel', 'Gastos variáveis'])
  })

  it('mover lançamentos de uma raiz exclui da lista a própria raiz e suas subcategorias', async () => {
    simularApi({ 'GET /api/categorias': arvorePorTipo })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Moradia')
    await user.click(within(itemDe('Moradia')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    const opcoes = within(within(dialogo).getByLabelText('Categoria de destino'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Escolha uma categoria', 'Gastos variáveis', 'Mercado'])
  })

  it('"Mover lançamentos" de A para B envia o destino e informa quantos foram movidos', async () => {
    const api = simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias/3/mover-lancamentos': json({ movidos: 3 }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    await user.selectOptions(within(dialogo).getByLabelText('Categoria de destino'), 'Gastos variáveis')
    await user.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(await within(dialogo).findByRole('status')).toHaveTextContent('3 lançamentos movidos.')
    expect(api.chamadasDe('POST /api/categorias/3/mover-lancamentos')[0]!.corpo).toEqual({ destino_id: 2 })
  })

  it('um único lançamento movido usa o singular', async () => {
    simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias/3/mover-lancamentos': json({ movidos: 1 }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    await user.selectOptions(within(dialogo).getByLabelText('Categoria de destino'), 'Moradia')
    await user.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(await within(dialogo).findByRole('status')).toHaveTextContent('1 lançamento movido.')
  })

  it('destino recusado pelo servidor aparece junto ao campo de destino', async () => {
    simularApi({
      'GET /api/categorias': arvorePorTipo,
      'POST /api/categorias/3/mover-lancamentos': erroApi(409, 'CATEGORIA_DESTINO_INVALIDO', 'Destino inválido.', {
        destino_id: 'Esta categoria não pode ser o destino.',
      }),
    })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    await user.selectOptions(within(dialogo).getByLabelText('Categoria de destino'), 'Moradia')
    await user.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(await within(dialogo).findByText('Esta categoria não pode ser o destino.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Categoria de destino')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sem outra categoria ativa para receber, avisa e desabilita a ação de mover', async () => {
    simularApi({ 'GET /api/categorias': json([MERCADO]) })
    const { user } = renderizarApp('/controle/categorias')
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    expect(within(dialogo).getByText(/Não há outra categoria ativa/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeDisabled()
  })
})

describe('Cache das categorias (I1, staleTime de produção)', () => {
  const ARQUIVADA = raiz({ id: 9, nome: 'Antiga', cor: '#757575', arquivado: true })
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
  const CONTAS = {
    mes: '2026-10',
    total_saldo_atual: '0.00',
    total_saldo_previsto: '0.00',
    contas: [
      {
        id: 1,
        nome: 'Conta da Ana',
        instituicao: null,
        tipo: 'conta_corrente',
        cor: '#1E88E5',
        saldo_inicial: '0.00',
        dono_usuario_id: 1,
        arquivado: false,
        casal_encerrado: false,
        saldo_atual: '0.00',
        saldo_previsto: '0.00',
      },
    ],
  }

  async function abrirFormularioDeDespesaEIrParaCategorias() {
    const api = simularApi({
      'GET /api/categorias': (c) =>
        json(c.params.incluir_arquivadas === 'true' ? [MERCADO, ARQUIVADA] : [MERCADO]),
      'GET /api/contas': json(CONTAS),
      'GET /api/tags': json([]),
      'GET /api/cartoes': json({ cartoes: [] }),
      'GET /api/controle/lista': json(listaVazia),
    })
    const cliente = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })
    const { user } = renderizarApp('/controle', { cliente })
    await screen.findByRole('heading', { name: 'Controle' })
    await user.click(screen.getByRole('button', { name: 'Novo lançamento' }))
    await user.click(await screen.findByRole('button', { name: 'Despesa' }))
    const form = await screen.findByRole('dialog', { name: /despesa/i })
    // A consulta do formulário (com arquivadas) completa antes de sair.
    await within(form).findByRole('option', { name: 'Mercado' })
    await user.keyboard('{Escape}')
    await user.click(await screen.findByRole('link', { name: 'Categorias' }))
    await screen.findByRole('heading', { name: 'Categorias' })
    return { api, user }
  }

  it('depois de abrir o formulário de lançamento, a tela Categorias não lista arquivada como ativa', async () => {
    const { api } = await abrirFormularioDeDespesaEIrParaCategorias()
    await screen.findByText('Mercado')
    expect(screen.queryByText('Antiga')).toBeNull()
    const consultas = api.chamadasDe('GET /api/categorias').map((c) => c.params)
    expect(consultas).toContainEqual({ tipo: 'despesa', incluir_arquivadas: 'true' })
    expect(consultas).toContainEqual({ tipo: 'despesa' })
  })

  it('a categoria arquivada não é oferecida como destino em ArquivarCategoria', async () => {
    const { user } = await abrirFormularioDeDespesaEIrParaCategorias()
    await screen.findByText('Mercado')
    await user.click(within(itemDe('Mercado')).getByRole('button', { name: 'Mover lançamentos' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover lançamentos' })
    expect(within(dialogo).queryByText('Antiga')).toBeNull()
    expect(within(dialogo).getByText(/Não há outra categoria ativa/)).toBeInTheDocument()
  })
})
