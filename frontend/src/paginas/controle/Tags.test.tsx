import { afterEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { TagSaida } from '../../api/categorias'
import { erroApi, json, limparTudo, renderizarApp, semConteudo, simularApi } from '../../testes/utilitarios'

afterEach(limparTudo)

const TAGS: TagSaida[] = [
  { id: 1, nome: 'essencial' },
  { id: 2, nome: 'viagem' },
]

function cardDe(nome: string) {
  return screen.getByText(nome).closest('li')!
}

describe('Tags: lista e estado vazio (CA-0.07)', () => {
  it('lista as tags com Renomear e Excluir', async () => {
    simularApi({ 'GET /api/tags': json(TAGS) })
    renderizarApp('/controle/tags')
    expect(await screen.findByText('essencial')).toBeInTheDocument()
    expect(screen.getByText('viagem')).toBeInTheDocument()
    expect(within(cardDe('essencial')).getByRole('button', { name: 'Renomear' })).toBeInTheDocument()
    expect(within(cardDe('essencial')).getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
  })

  it('sem tags mostra a frase e o botão "Nova tag" do estado vazio, que abre o formulário', async () => {
    simularApi({ 'GET /api/tags': json([]) })
    const { user } = renderizarApp('/controle/tags')
    const frase = await screen.findByText('Nenhuma tag criada.')
    await user.click(within(frase.parentElement!).getByRole('button', { name: 'Nova tag' }))
    expect(await screen.findByRole('dialog', { name: 'Nova tag' })).toBeInTheDocument()
  })

  it('erro ao listar mostra a mensagem do servidor', async () => {
    simularApi({ 'GET /api/tags': erroApi(500, 'ERRO_INTERNO', 'Falha ao listar tags.') })
    renderizarApp('/controle/tags')
    expect(await screen.findByText('Falha ao listar tags.')).toBeInTheDocument()
  })
})

describe('FormTag (CA-2.11)', () => {
  it('cria a tag "essencial" e recarrega a lista', async () => {
    let tags: TagSaida[] = []
    const api = simularApi({
      'GET /api/tags': () => json(tags),
      'POST /api/tags': () => {
        tags = [{ id: 1, nome: 'essencial' }]
        return json(tags[0], 201)
      },
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('Nenhuma tag criada.')
    await user.click(screen.getAllByRole('button', { name: 'Nova tag' })[0]!)
    const dialogo = await screen.findByRole('dialog', { name: 'Nova tag' })
    await user.type(within(dialogo).getByLabelText('Nome'), '  essencial ')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('essencial')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('POST /api/tags')[0]!.corpo).toEqual({ nome: 'essencial' })
  })

  it('tag com mesmo nome ignorando maiúsculas é recusada junto ao campo, com foco', async () => {
    simularApi({
      'GET /api/tags': json(TAGS),
      'POST /api/tags': erroApi(409, 'TAG_JA_EXISTE', 'Já existe uma tag com esse nome.', {
        nome: 'Já existe uma tag com esse nome.',
      }),
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(screen.getAllByRole('button', { name: 'Nova tag' })[0]!)
    const dialogo = await screen.findByRole('dialog', { name: 'Nova tag' })
    await user.type(within(dialogo).getByLabelText('Nome'), 'Essencial')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    const nome = within(dialogo).getByLabelText('Nome')
    await within(dialogo).findAllByText('Já existe uma tag com esse nome.')
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Nova tag' })).toBeInTheDocument()
  })

  it('nome vazio mostra o erro junto ao campo, foca e não chama a API', async () => {
    const api = simularApi({ 'GET /api/tags': json(TAGS) })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(screen.getAllByRole('button', { name: 'Nova tag' })[0]!)
    const dialogo = await screen.findByRole('dialog', { name: 'Nova tag' })
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    const nome = within(dialogo).getByLabelText('Nome')
    expect(within(dialogo).getByText('Informe o nome da tag.')).toBeInTheDocument()
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveFocus()
    expect(api.chamadasDe('POST /api/tags')).toHaveLength(0)
  })

  it('nome com mais de 40 caracteres é recusado no cliente; 40 é aceito', async () => {
    const api = simularApi({
      'GET /api/tags': json(TAGS),
      'POST /api/tags': json({ id: 3, nome: 'x' }, 201),
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(screen.getAllByRole('button', { name: 'Nova tag' })[0]!)
    const dialogo = await screen.findByRole('dialog', { name: 'Nova tag' })
    const nome = within(dialogo).getByLabelText('Nome')
    await user.type(nome, 'a'.repeat(41))
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(within(dialogo).getByText('Use no máximo 40 caracteres.')).toBeInTheDocument()
    expect(api.chamadasDe('POST /api/tags')).toHaveLength(0)
    await user.type(nome, '{Backspace}')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('essencial')
    expect(api.chamadasDe('POST /api/tags')).toHaveLength(1)
  })

  it('renomear abre com o nome atual e envia PATCH com o novo nome', async () => {
    const api = simularApi({
      'GET /api/tags': json(TAGS),
      'PATCH /api/tags/1': json({ id: 1, nome: 'prioridade' }),
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(within(cardDe('essencial')).getByRole('button', { name: 'Renomear' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Renomear tag' })
    const nome = within(dialogo).getByLabelText('Nome')
    expect(nome).toHaveValue('essencial')
    await user.clear(nome)
    await user.type(nome, 'prioridade')
    await user.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('essencial')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('PATCH /api/tags/1')[0]!.corpo).toEqual({ nome: 'prioridade' })
  })
})

describe('Excluir tag (CA-2.11)', () => {
  it('pede confirmação e só chama a API ao confirmar; a tag some da lista', async () => {
    let tags = [...TAGS]
    const api = simularApi({
      'GET /api/tags': () => json(tags),
      'DELETE /api/tags/1': () => {
        tags = tags.filter((t) => t.id !== 1)
        return semConteudo()
      },
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(within(cardDe('essencial')).getByRole('button', { name: 'Excluir' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir tag' })
    expect(within(confirmacao).getByText(/os lançamentos continuam guardados/)).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/tags/1')).toHaveLength(0)
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))
    await screen.findByText('viagem')
    expect(screen.queryByText('essencial')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.chamadasDe('DELETE /api/tags/1')).toHaveLength(1)
  })

  it('cancelar não exclui', async () => {
    const api = simularApi({ 'GET /api/tags': json(TAGS) })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(within(cardDe('essencial')).getByRole('button', { name: 'Excluir' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir tag' })
    await user.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('essencial')).toBeInTheDocument()
    expect(api.chamadasDe('DELETE /api/tags/1')).toHaveLength(0)
  })

  it('erro do servidor ao excluir mostra a mensagem e fecha a confirmação', async () => {
    simularApi({
      'GET /api/tags': json(TAGS),
      'DELETE /api/tags/1': erroApi(404, 'TAG_NAO_ENCONTRADA', 'Tag não encontrada.'),
    })
    const { user } = renderizarApp('/controle/tags')
    await screen.findByText('essencial')
    await user.click(within(cardDe('essencial')).getByRole('button', { name: 'Excluir' }))
    const confirmacao = await screen.findByRole('dialog', { name: 'Excluir tag' })
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tag não encontrada.')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
