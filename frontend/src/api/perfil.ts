import { cliente } from './cliente'
import type { Tema, UsuarioSaida } from './sessao'

export function atualizarPerfil(corpo: { nome?: string; tema?: Tema }): Promise<UsuarioSaida> {
  return cliente.patch<UsuarioSaida>('/api/perfil', corpo)
}

export function alterarSenha(corpo: { senha_atual: string; senha_nova: string }): Promise<void> {
  return cliente.post<void>('/api/perfil/senha', corpo)
}
