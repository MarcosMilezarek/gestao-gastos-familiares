import {
  Banknote,
  Car,
  CircleHelp,
  Clock,
  Ellipsis,
  FileText,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  PartyPopper,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Target,
  TreePalm,
  Truck,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

// Lista fechada: o banco guarda o nome do ícone (icone VARCHAR(40)); os nomes são os de padroes.py (§4.7).
const ICONES = {
  house: { rotulo: 'Casa', componente: House },
  receipt: { rotulo: 'Recibo', componente: Receipt },
  'file-text': { rotulo: 'Documento', componente: FileText },
  'heart-pulse': { rotulo: 'Saúde', componente: HeartPulse },
  car: { rotulo: 'Carro', componente: Car },
  'shopping-bag': { rotulo: 'Sacola', componente: ShoppingBag },
  'shopping-cart': { rotulo: 'Compras', componente: ShoppingCart },
  utensils: { rotulo: 'Refeição', componente: Utensils },
  repeat: { rotulo: 'Assinatura', componente: Repeat },
  'graduation-cap': { rotulo: 'Educação', componente: GraduationCap },
  'party-popper': { rotulo: 'Lazer', componente: PartyPopper },
  'piggy-bank': { rotulo: 'Cofrinho', componente: PiggyBank },
  ellipsis: { rotulo: 'Outros', componente: Ellipsis },
  banknote: { rotulo: 'Dinheiro', componente: Banknote },
  gift: { rotulo: 'Presente', componente: Gift },
  'tree-palm': { rotulo: 'Férias', componente: TreePalm },
  clock: { rotulo: 'Horas', componente: Clock },
  shield: { rotulo: 'Escudo', componente: Shield },
  target: { rotulo: 'Alvo', componente: Target },
  heart: { rotulo: 'Coração', componente: Heart },
  truck: { rotulo: 'Caminhão', componente: Truck },
  plane: { rotulo: 'Avião', componente: Plane },
} satisfies Record<string, { rotulo: string; componente: LucideIcon }>

export type NomeIcone = keyof typeof ICONES

export const NOMES_ICONES = Object.keys(ICONES) as NomeIcone[]

export const ICONE_PADRAO = { rotulo: 'Ícone', componente: CircleHelp } as const

export function rotuloIcone(nome: string): string {
  return Object.hasOwn(ICONES, nome) ? ICONES[nome as NomeIcone].rotulo : ICONE_PADRAO.rotulo
}

// Nome desconhecido (ou vindo de fora da lista) cai no ícone padrão.
export function iconeDe(nome: string): LucideIcon {
  return Object.hasOwn(ICONES, nome) ? ICONES[nome as NomeIcone].componente : ICONE_PADRAO.componente
}
