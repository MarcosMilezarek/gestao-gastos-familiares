import { cliente } from './cliente'

export type Tema = 'claro' | 'escuro'

export type UsuarioSaida = { id: number; nome: string; email: string; tema: Tema }

export type Sessao = {
  usuario: { id: number; nome: string; email: string; tema: 'claro' | 'escuro' }
  hoje: string /* "AAAA-MM-DD" */
  casal: null | { id: number; parceiro: { id: number; nome: string } }
}

export function obterSessao(): Promise<Sessao> {
  return cliente.get<Sessao>('/api/sessao')
}

export function cadastrar(corpo: {
  nome: string
  email: string
  senha: string
  senha_confirmacao: string
}): Promise<Sessao> {
  return cliente.post<Sessao>('/api/cadastro', corpo)
}

export function entrar(corpo: { email: string; senha: string }): Promise<Sessao> {
  return cliente.post<Sessao>('/api/sessao', corpo)
}

export function sair(): Promise<void> {
  return cliente.del<void>('/api/sessao')
}
