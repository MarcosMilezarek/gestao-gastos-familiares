import type { LancamentoEdicao, LancamentoEntrada, LancamentoSaida } from '../api/lancamentos'
import type { Sessao } from '../api/sessao'
import { mascararEntrada, paraApi } from '../formatacao/dinheiro'
import type { ValorRecorrencia } from './CampoRecorrencia'
import type { ValoresCampos } from './CamposLancamento'

// Marcada se a data já chegou (RF-2.16). Datas "AAAA-MM-DD" comparam como texto.
export function situacaoPara(data: string, hoje: string): ValoresCampos['situacao'] {
  return data <= hoje ? 'confirmada' : 'prevista'
}

// Abertura de um formulário novo: dono = pessoa logada, data = hoje do servidor.
export function valoresAbertura(sessao: Sessao): ValoresCampos {
  return {
    valor: '',
    data: sessao.hoje,
    descricao: '',
    categoria_id: null,
    dono_usuario_id: sessao.usuario.id,
    conta_id: null,
    conta_destino_id: null,
    tag_ids: [],
    observacao: '',
    situacao: 'confirmada', // data = hoje: marcada (RF-2.16)
  }
}

// Lançamento da API para valores do formulário. O valor vem como "1234.50" e vira máscara sem passar por number.
export function valoresDeLancamento(lancamento: LancamentoSaida): ValoresCampos {
  const [inteiro = '0', centavos = ''] = lancamento.valor.split('.')
  return {
    valor: mascararEntrada(inteiro + centavos.padEnd(2, '0')),
    data: lancamento.data,
    descricao: lancamento.descricao ?? '',
    categoria_id: lancamento.categoria?.id ?? null,
    dono_usuario_id: lancamento.dono_usuario_id,
    conta_id: lancamento.conta_id,
    conta_destino_id: lancamento.conta_destino_id,
    tag_ids: lancamento.tags.map((t) => t.id),
    observacao: lancamento.observacao ?? '',
    // "atrasada" não é aceita na edição: o formulário mostra "prevista".
    situacao: lancamento.situacao === 'confirmada' ? 'confirmada' : 'prevista',
  }
}

function mesmoConjunto(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

// Edição com alcance múltiplo: só o que mudou, nunca `situacao`. O PATCH aplica cada campo enviado a
// todas as ocorrências do conjunto; o formulário inteiro trocaria o valor das confirmadas (CA-3.03, CA-3.05).
// Conta nula não é enviada: o formulário já barra o salvamento sem conta e sem categoria.
export function corpoAlcanceMultiplo(
  inicial: ValoresCampos,
  atual: ValoresCampos,
): LancamentoEdicao {
  const corpo: LancamentoEdicao = {}
  if (atual.valor !== inicial.valor) corpo.valor = paraApi(atual.valor)
  if (atual.data !== inicial.data) corpo.data = atual.data
  if (atual.descricao !== inicial.descricao) corpo.descricao = atual.descricao
  if (atual.categoria_id !== null && atual.categoria_id !== inicial.categoria_id) {
    corpo.categoria_id = atual.categoria_id
  }
  // Dono e conta vão juntos (RG-04); na transferência, origem e destino também.
  if (atual.dono_usuario_id !== inicial.dono_usuario_id || atual.conta_id !== inicial.conta_id) {
    corpo.dono_usuario_id = atual.dono_usuario_id
    if (atual.conta_id !== null) corpo.conta_id = atual.conta_id
  }
  if (
    atual.conta_id !== inicial.conta_id ||
    atual.conta_destino_id !== inicial.conta_destino_id
  ) {
    if (atual.conta_id !== null) corpo.conta_id = atual.conta_id
    if (atual.conta_destino_id !== null) corpo.conta_destino_id = atual.conta_destino_id
  }
  if (!mesmoConjunto(atual.tag_ids, inicial.tag_ids)) corpo.tag_ids = atual.tag_ids
  if (atual.observacao !== inicial.observacao) corpo.observacao = atual.observacao
  return corpo
}

// Corpo da recorrência na criação. A faixa 2 a 60 de `meses` é validada no servidor.
export function corpoRecorrencia(valor: ValorRecorrencia): NonNullable<LancamentoEntrada['recorrencia']> {
  return valor.modo === 'sem_fim'
    ? { modo: 'sem_fim' }
    : { modo: 'n_meses', meses: Number(valor.meses) }
}
