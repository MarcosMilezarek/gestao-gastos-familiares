// Datas são tratadas por divisão e aritmética de string, sem Date: evita o
// deslocamento de fuso. "Hoje" vem do servidor (GET /api/sessao), não daqui.
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const PADRAO_MES = /^(\d{4})-(0[1-9]|1[0-2])$/

const MESES: Record<string, string> = {
  '01': 'janeiro',
  '02': 'fevereiro',
  '03': 'março',
  '04': 'abril',
  '05': 'maio',
  '06': 'junho',
  '07': 'julho',
  '08': 'agosto',
  '09': 'setembro',
  '10': 'outubro',
  '11': 'novembro',
  '12': 'dezembro',
}

// "AAAA-MM-DD" -> "DD/MM/AAAA"
export function formatarData(data: string): string {
  const m = PADRAO_DATA.exec(data)
  if (!m) throw new RangeError(`data inválida: "${data}"`)
  const [, ano = '', mes = '', dia = ''] = m
  return `${dia}/${mes}/${ano}`
}

// "AAAA-MM" -> "outubro de 2026"
export function rotuloMes(mes: string): string {
  const m = PADRAO_MES.exec(mes)
  if (!m) throw new RangeError(`mês inválido: "${mes}"`)
  const [, ano = '', numero = ''] = m
  return `${MESES[numero]} de ${ano}`
}

function deslocarMes(mes: string, passos: number): string {
  const m = PADRAO_MES.exec(mes)
  if (!m) throw new RangeError(`mês inválido: "${mes}"`)
  const [, ano = '', numero = ''] = m
  const total = parseInt(ano, 10) * 12 + parseInt(numero, 10) - 1 + passos
  const novoAno = Math.floor(total / 12)
  const novoMes = (total % 12) + 1
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`
}

export function mesAnterior(mes: string): string {
  return deslocarMes(mes, -1)
}

export function mesSeguinte(mes: string): string {
  return deslocarMes(mes, 1)
}
