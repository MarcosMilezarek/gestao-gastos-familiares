import { cliente } from './cliente'

export type ConviteEnviado = { id: number; email_convidado: string }

export type VinculoSaida = {
  estado: 'sem_vinculo' | 'convite_enviado' | 'convite_recebido' | 'vinculado'
  convite_enviado: null | ConviteEnviado
  convites_recebidos: { id: number; convidante_nome: string }[]
  parceiro: null | { id: number; nome: string }
}

export function obterVinculo(): Promise<VinculoSaida> {
  return cliente.get<VinculoSaida>('/api/vinculo')
}

export function convidar(corpo: { email: string }): Promise<ConviteEnviado> {
  return cliente.post<ConviteEnviado>('/api/convites', corpo)
}

export function cancelarConvite(id: number): Promise<void> {
  return cliente.del<void>(`/api/convites/${id}`)
}

export function aceitarConvite(id: number): Promise<VinculoSaida> {
  return cliente.post<VinculoSaida>(`/api/convites/${id}/aceitar`)
}

export function recusarConvite(id: number): Promise<VinculoSaida> {
  return cliente.post<VinculoSaida>(`/api/convites/${id}/recusar`)
}

export function desvincular(): Promise<VinculoSaida> {
  return cliente.post<VinculoSaida>('/api/vinculo/desvincular', { confirmar: true })
}
