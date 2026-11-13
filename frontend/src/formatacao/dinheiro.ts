// Valores monetários chegam da API como string ("1234.50"). Tudo aqui manipula
// a string: nunca converte para number (RNF-02).
const PADRAO_VALOR = /^(-?)(\d+)(?:\.(\d{1,2}))?$/
const PADRAO_MASCARADO = /^(\d+(?:\.\d{3})*),(\d{2})$/

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function lerValor(valor: string): { inteiro: string; centavos: string } {
  const m = PADRAO_VALOR.exec(valor)
  if (!m) throw new RangeError(`valor monetário inválido: "${valor}"`)
  const [, , inteiro = '', centavos = ''] = m
  return { inteiro: inteiro.replace(/^0+(?=\d)/, ''), centavos: centavos.padEnd(2, '0') }
}

export function eZero(valor: string): boolean {
  return /^-?0+(\.0+)?$/.test(valor)
}

export function eNegativo(valor: string): boolean {
  return valor.startsWith('-') && !eZero(valor)
}

export function formatarBRL(valor: string): string {
  const { inteiro, centavos } = lerValor(valor)
  const sinal = eNegativo(valor) ? '-' : ''
  return `${sinal}R$ ${agruparMilhar(inteiro)},${centavos}`
}

// Digitos da pessoa entram da direita: "12050" -> "120,50".
export function mascararEntrada(digitos: string): string {
  const limpos = digitos.replace(/\D/g, '').replace(/^0+/, '').padStart(3, '0')
  return `${agruparMilhar(limpos.slice(0, -2))},${limpos.slice(-2)}`
}

// Texto mascarado para o corpo da requisição: "1.234,56" -> "1234.56".
export function paraApi(textoMascarado: string): string {
  const m = PADRAO_MASCARADO.exec(textoMascarado)
  if (!m) throw new RangeError(`texto mascarado inválido: "${textoMascarado}"`)
  const [, inteiro = '', centavos = ''] = m
  return `${inteiro.replace(/\./g, '')}.${centavos}`
}
