import { useEffect, useEffectEvent, useState, type ChangeEvent } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { listarFaturas, type FaturaStatus } from '../api/cartoes'
import { repetirSem4xx } from '../api/cliente'
import { Select } from '@/components/ui/select'
import { Campo } from '../componentes/Campo'
import { rotuloMes } from '../formatacao/data'

const STATUS_ROTULO: Record<FaturaStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  vencida: 'Vencida',
  zerada: 'Zerada',
  paga: 'Paga',
}

type Props = {
  cartaoId: number | null
  data: string
  valor: string | null
  aoMudar(valor: string | null): void
  erro?: string
}

export function SeletorFatura({ cartaoId, data, valor, aoMudar, erro }: Props) {
  // Com valor já definido (edição ou fatura inicial), a pessoa já escolheu: a sugerida não sobrescreve.
  const [escolheu, setEscolheu] = useState(valor !== null)
  const mudar = useEffectEvent(aoMudar)
  // Sem data, a consulta vai sem `?data=` (o servidor recusa `data` vazio).
  const dataConsulta = data === '' ? undefined : data
  // Falha 4xx (ex.: data fora da faixa, 422) não repete: o seletor fica sem sugestão.
  const consulta = useQuery({
    queryKey: ['cartoes', cartaoId, 'faturas', dataConsulta],
    queryFn:
      cartaoId !== null ? () => listarFaturas(cartaoId, { data: dataConsulta }) : skipToken,
    retry: repetirSem4xx,
  })
  const carregando = consulta.isFetching
  const faturas = consulta.data?.faturas ?? []
  const sugerida = consulta.data?.sugerida ?? null
  // Fatura paga não é oferecida: a lista a desabilita (I2), então a sugerida não entra no campo.
  const sugeridaPaga = faturas.some((f) => f.mes === sugerida && f.status === 'paga')
  const sugeridaUtil = sugeridaPaga ? null : sugerida

  // Enquanto a pessoa não escolheu, a sugerida (pela data) preenche o campo; depois de escolher, a data não mexe nele.
  useEffect(() => {
    if (!escolheu && !carregando && sugeridaUtil !== valor) mudar(sugeridaUtil)
  }, [escolheu, carregando, sugeridaUtil, valor])

  function escolher(e: ChangeEvent<HTMLSelectElement>) {
    setEscolheu(true)
    aoMudar(e.target.value === '' ? null : e.target.value)
  }

  return (
    <Campo
      rotulo="Fatura de destino"
      erro={erro}
      ajuda={!escolheu && sugeridaPaga ? 'A fatura da data já está paga: escolha outra' : undefined}
    >
      <Select value={valor ?? ''} onChange={escolher}>
        <option value="">Escolha a fatura</option>
        {/* Fatura com valor fora da janela da consulta (I3): sem esta opção o campo mostraria "Escolha a fatura". */}
        {valor !== null && !faturas.some((f) => f.mes === valor) && (
          <option value={valor}>{rotuloMes(valor)}</option>
        )}
        {consulta.data?.faturas.map((fatura) => (
          <option key={fatura.mes} value={fatura.mes} disabled={fatura.status === 'paga'}>
            {`${rotuloMes(fatura.mes)} · ${STATUS_ROTULO[fatura.status]}`}
          </option>
        ))}
      </Select>
    </Campo>
  )
}
