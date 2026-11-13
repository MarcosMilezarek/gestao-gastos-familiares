import { describe, expect, it } from 'vitest'
import { eNegativo, eZero, formatarBRL, mascararEntrada, paraApi } from './dinheiro'

describe('formatarBRL', () => {
  it('formata "1234.5" como R$ 1.234,50', () => {
    expect(formatarBRL('1234.5')).toBe('R$ 1.234,50')
  })
  it('formata valor negativo com sinal antes do R$', () => {
    expect(formatarBRL('-50.00')).toBe('-R$ 50,00')
  })
  it('formata zero', () => {
    expect(formatarBRL('0')).toBe('R$ 0,00')
    expect(formatarBRL('0.00')).toBe('R$ 0,00')
  })
  it('zero negativo não leva sinal', () => {
    expect(formatarBRL('-0.00')).toBe('R$ 0,00')
  })
  it('não perde precisão acima de 2^53', () => {
    expect(formatarBRL('9007199254740993.01')).toBe('R$ 9.007.199.254.740.993,01')
  })
  it('agrupa milhões', () => {
    expect(formatarBRL('1000000.99')).toBe('R$ 1.000.000,99')
  })
  it('rejeita entrada inválida com RangeError', () => {
    expect(() => formatarBRL('abc')).toThrow(RangeError)
    expect(() => formatarBRL('')).toThrow(RangeError)
    expect(() => formatarBRL('1,50')).toThrow(RangeError)
    expect(() => formatarBRL('1.234')).toThrow(RangeError)
  })
})

describe('mascararEntrada', () => {
  it('dígitos enchem da direita em centavos', () => {
    expect(mascararEntrada('12050')).toBe('120,50')
    expect(mascararEntrada('5')).toBe('0,05')
    expect(mascararEntrada('123456')).toBe('1.234,56')
  })
  it('vazio vira 0,00', () => {
    expect(mascararEntrada('')).toBe('0,00')
  })
  it('ignora não dígitos e zeros à esquerda', () => {
    expect(mascararEntrada('R$ 0012a05')).toBe('12,05')
  })
})

describe('paraApi', () => {
  it('converte texto mascarado para formato da API', () => {
    expect(paraApi('1.234,56')).toBe('1234.56')
    expect(paraApi('0,05')).toBe('0.05')
  })
  it('rejeita texto sem vírgula e centavos', () => {
    expect(() => paraApi('1234')).toThrow(RangeError)
    expect(() => paraApi('')).toThrow(RangeError)
  })
  it('compõe com mascararEntrada', () => {
    expect(paraApi(mascararEntrada('12050'))).toBe('120.50')
  })
})

describe('eZero e eNegativo', () => {
  it('eZero reconhece variações de zero', () => {
    expect(eZero('0')).toBe(true)
    expect(eZero('0.00')).toBe(true)
    expect(eZero('-0.00')).toBe(true)
    expect(eZero('0.01')).toBe(false)
    expect(eZero('10.00')).toBe(false)
  })
  it('eNegativo é verdadeiro só para negativos não nulos', () => {
    expect(eNegativo('-1.00')).toBe(true)
    expect(eNegativo('-0.00')).toBe(false)
    expect(eNegativo('1.00')).toBe(false)
    expect(eNegativo('0')).toBe(false)
  })
})
