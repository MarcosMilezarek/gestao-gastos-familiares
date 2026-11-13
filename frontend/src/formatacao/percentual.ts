// Porcentagem chega da API como string ("62.50"); manipulada como string, sem number.
const PADRAO_PERCENTUAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

// "62.50" -> "62,50%"
export function formatarPercentual(valor: string): string {
  const m = PADRAO_PERCENTUAL.exec(valor)
  if (!m) throw new RangeError(`percentual inválido: "${valor}"`)
  const [, sinal = '', inteiro = '', centavos = ''] = m
  const parteInteira = inteiro.replace(/^0+(?=\d)/, '')
  const parteCentavos = centavos.padEnd(2, '0')
  const negativo = sinal === '-' && /[1-9]/.test(parteInteira + parteCentavos)
  return `${negativo ? '-' : ''}${parteInteira},${parteCentavos}%`
}
