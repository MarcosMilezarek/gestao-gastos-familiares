import type { NomeIcone } from '../../componentes/icones'

// Modelos sugeridos ao criar meta (RF-6.02): não são guardados. Escolher um preenche nome, ícone e cor, todos editáveis.
// `cor` usa os hex de `SeletorCor`. "Personalizado" não tem nome sugerido (null). Não há valor-alvo.
export type ModeloMeta = {
  rotulo: string
  nome: string | null
  icone: NomeIcone
  cor: string
}

export const MODELOS_META: readonly ModeloMeta[] = [
  { rotulo: 'Personalizado', nome: null, icone: 'target', cor: '#455A64' },
  { rotulo: 'Reserva de emergência', nome: 'Reserva de emergência', icone: 'shield', cor: '#00897B' },
  { rotulo: 'Entrada do apê', nome: 'Entrada do apê', icone: 'house', cor: '#3949AB' },
  { rotulo: 'Casamento', nome: 'Casamento', icone: 'heart', cor: '#D81B60' },
  { rotulo: 'Mudança', nome: 'Mudança', icone: 'truck', cor: '#E65100' },
  { rotulo: 'Viagem', nome: 'Viagem', icone: 'plane', cor: '#00838F' },
]
