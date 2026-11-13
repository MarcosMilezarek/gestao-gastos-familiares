import { describe, expect, it } from 'vitest'
import { formatarData, mesAnterior, mesSeguinte, rotuloMes } from './data'

describe('formatarData', () => {
  it('converte AAAA-MM-DD em DD/MM/AAAA', () => {
    expect(formatarData('2026-03-05')).toBe('05/03/2026')
  })
  it('rejeita formato inválido com RangeError', () => {
    expect(() => formatarData('05/03/2026')).toThrow(RangeError)
    expect(() => formatarData('')).toThrow(RangeError)
    expect(() => formatarData('2026-3-5')).toThrow(RangeError)
  })
})

describe('rotuloMes', () => {
  it('devolve nome do mês por extenso', () => {
    expect(rotuloMes('2026-10')).toBe('outubro de 2026')
    expect(rotuloMes('2026-03')).toBe('março de 2026')
  })
  it('rejeita mês fora de 01..12', () => {
    expect(() => rotuloMes('2026-13')).toThrow(RangeError)
    expect(() => rotuloMes('2026-00')).toThrow(RangeError)
    expect(() => rotuloMes('2026')).toThrow(RangeError)
  })
})

describe('mesAnterior e mesSeguinte', () => {
  it('mesAnterior volta o ano em janeiro', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
  })
  it('mesSeguinte avança o ano em dezembro', () => {
    expect(mesSeguinte('2026-12')).toBe('2027-01')
  })
  it('meios de ano', () => {
    expect(mesAnterior('2026-03')).toBe('2026-02')
    expect(mesSeguinte('2026-03')).toBe('2026-04')
  })
  it('rejeitam entrada inválida', () => {
    expect(() => mesAnterior('2026-13')).toThrow(RangeError)
    expect(() => mesSeguinte('x')).toThrow(RangeError)
  })
})
