import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { erroApi, json, limparTudo, renderizarApp, simularApi, SESSAO_PADRAO } from '../../testes/utilitarios'

afterEach(limparTudo)

const USUARIO = SESSAO_PADRAO.usuario

describe('Perfil', () => {
  it('mostra o nome atual no campo Nome', async () => {
    simularApi({})
    renderizarApp('/configuracoes/perfil')
    expect(await screen.findByLabelText('Nome')).toHaveValue('Ana')
  })

  it('CA-1.11: salvar o nome envia PATCH /api/perfil com o nome sem espaços nas pontas e confirma', async () => {
    const api = simularApi({ 'PATCH /api/perfil': json({ ...USUARIO, nome: 'Ana Maria' }) })
    const { user } = renderizarApp('/configuracoes/perfil')
    const campo = await screen.findByLabelText('Nome')
    await user.clear(campo)
    await user.type(campo, '  Ana Maria  ')
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Nome salvo.')
    expect(api.chamadasDe('PATCH /api/perfil')[0]?.corpo).toEqual({ nome: 'Ana Maria' })
  })

  it('CA-1.11: após salvar, a sessão é recarregada para refletir o novo nome', async () => {
    const api = simularApi({ 'PATCH /api/perfil': json({ ...USUARIO, nome: 'Bia' }) })
    const { user } = renderizarApp('/configuracoes/perfil')
    const campo = await screen.findByLabelText('Nome')
    await user.clear(campo)
    await user.type(campo, 'Bia')
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
    await screen.findByRole('status')
    await waitFor(() => expect(api.chamadasDe('GET /api/sessao').length).toBeGreaterThanOrEqual(2))
  })

  it('erro do servidor no nome aparece junto ao campo com aria-invalid e aria-describedby', async () => {
    simularApi({
      'PATCH /api/perfil': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { nome: 'O nome é obrigatório.' }),
    })
    const { user } = renderizarApp('/configuracoes/perfil')
    await screen.findByLabelText('Nome')
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
    const msg = await screen.findByText('O nome é obrigatório.')
    const campo = screen.getByLabelText('Nome')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo.getAttribute('aria-describedby')).toContain(msg.id)
  })

  it('CA-1.12: escolher tema escuro envia PATCH com o tema e marca o botão como pressionado', async () => {
    const api = simularApi({ 'PATCH /api/perfil': json({ ...USUARIO, tema: 'escuro' }) })
    const { user } = renderizarApp('/configuracoes/perfil')
    expect(await screen.findByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Escuro' }))
    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.tema).toBe('escuro')
    await waitFor(() => expect(api.chamadasDe('PATCH /api/perfil')).toHaveLength(1))
    expect(api.chamadasDe('PATCH /api/perfil')[0]?.corpo).toEqual({ tema: 'escuro' })
  })

  it('CA-1.12: usuário com tema escuro salvo abre o perfil com Escuro selecionado', async () => {
    simularApi({}, { sessao: { ...SESSAO_PADRAO, usuario: { ...USUARIO, tema: 'escuro' } } })
    renderizarApp('/configuracoes/perfil')
    expect(await screen.findByRole('button', { name: 'Escuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.tema).toBe('escuro')
  })

  it('tema recusado pelo servidor volta ao anterior e mostra alerta', async () => {
    simularApi({ 'PATCH /api/perfil': erroApi(500, 'ERRO_INTERNO', 'Não foi possível salvar o tema.') })
    const { user } = renderizarApp('/configuracoes/perfil')
    await screen.findByRole('button', { name: 'Claro' })
    await user.click(screen.getByRole('button', { name: 'Escuro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar o tema.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true'))
  })

  describe('sugestões t77', () => {
    it('S2: foco vai ao campo Nome quando o servidor recusa o nome', async () => {
      simularApi({
        'PATCH /api/perfil': erroApi(422, 'VALIDACAO', 'Dados inválidos.', { nome: 'O nome é obrigatório.' }),
      })
      const { user } = renderizarApp('/configuracoes/perfil')
      await screen.findByLabelText('Nome')
      await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
      await screen.findByText('O nome é obrigatório.')
      await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus())
    })
  })
})
