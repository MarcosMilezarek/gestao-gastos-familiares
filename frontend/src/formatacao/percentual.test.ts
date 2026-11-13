import { describe, expect, it } from 'vitest'
import { formatarPercentual } from './percentual'

describe('formatarPercentual', () => {
  it('formata "62.50" como "62,50%"', () => {
    expect(formatarPercentual('62.50')).toBe('62,50%')
  })
  it('completa casas e aceita inteiro', () => {
    expect(formatarPercentual('5')).toBe('5,00%')
    expect(formatarPercentual('7.5')).toBe('7,50%')
  })
  it('zero negativo não leva sinal', () => {
    expect(formatarPercentual('-0.00')).toBe('0,00%')
  })
  it('mantém sinal de negativo', () => {
    expect(formatarPercentual('-12.34')).toBe('-12,34%')
  })
  it('rejeita entrada inválida com RangeError', () => {
    expect(() => formatarPercentual('abc')).toThrow(RangeError)
    expect(() => formatarPercentual('62,50')).toThrow(RangeError)
  })
})
