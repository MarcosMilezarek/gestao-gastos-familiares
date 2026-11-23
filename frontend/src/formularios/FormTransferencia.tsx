import { useCallback, useEffect, useRef, useState } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../api/cliente'
import { listarContas } from '../api/contas'
import type { LancamentoSaida } from '../api/lancamentos'
import { sugestaoAporte } from '../api/proporcao'
import type { Sessao } from '../api/sessao'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '../componentes/BottomSheet'
import type { Alcance } from '../componentes/DialogoAlcance'
import { mascararEntrada, paraApi } from '../formatacao/dinheiro'
import { useSessao } from '../hooks/useSessao'
import { CampoRecorrencia, type ValorRecorrencia } from './CampoRecorrencia'
import { CamposLancamento, type ValoresCampos } from './CamposLancamento'
import { useSalvarLancamento } from './useSalvarLancamento'
import {
  corpoAlcanceMultiplo,
  corpoRecorrencia,
  situacaoPara,
  valoresAbertura,
  valoresDeLancamento,
} from './valoresLancamento'

// Campos que `CamposLancamento` mostra na transferência; erro de outro campo aparece no formulário inteiro.
const CAMPOS_NA_TELA = [
  'valor',
  'data',
  'conta_id',
  'conta_destino_id',
  'tag_ids',
  'observacao',
  'recorrencia',
]
const OBRIGATORIO = 'Campo obrigatório.'

type Props = {
  valoresIniciais?: LancamentoSaida
  // Alcance escolhido no `DialogoAlcance` para lançamento recorrente (só na edição).
  alcance?: Alcance
  // Contas já escolhidas ao abrir (ex.: "Fazer aporte"); só vale na criação.
  preenchimento?: { conta_id: number; conta_destino_id: number }
  aoFechar(): void
  aoSalvar?(): void
}

// Sugestão da API ("1234.50") vira máscara pelos dígitos, sem `number` (como em `valoresDeLancamento`).
function mascararSugestao(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

export function FormTransferencia(props: Props) {
  const sessao = useSessao().data
  if (!sessao) return null
  return <FormularioAberto {...props} sessao={sessao} />
}

function FormularioAberto({
  valoresIniciais,
  alcance,
  preenchimento,
  aoFechar,
  aoSalvar,
  sessao,
}: Props & { sessao: Sessao }) {
  const editando = valoresIniciais !== undefined
  // Com alcance múltiplo a situação some e o corpo leva só o que mudou (fatia-3.md §5.1).
  const alcanceMultiplo = alcance === 'este_e_pendentes' || alcance === 'todos'
  const salvar = useSalvarLancamento(valoresIniciais?.id, alcance)
  const [valores, setValores] = useState<ValoresCampos>(() =>
    valoresIniciais
      ? valoresDeLancamento(valoresIniciais)
      : { ...valoresAbertura(sessao), ...preenchimento },
  )
  // `null` = não recorrente. Só existe na criação (D9).
  const [recorrencia, setRecorrencia] = useState<ValorRecorrencia | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  // Marcada quando a pessoa digita o valor; depois disso a sugestão do aporte não sobrescreve (CA-3.19).
  const [digitou, setDigitou] = useState(false)
  const corpoRef = useRef<HTMLDivElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const mudar = useCallback(
    (parcial: Partial<ValoresCampos>) => {
      // Só o campo chega com `valor`; a sugestão escreve direto em `setValores`.
      if (parcial.valor !== undefined) setDigitou(true)
      setValores((atuais) => ({
        ...atuais,
        ...parcial,
        // Na criação a situação acompanha a data (RF-2.16); na edição vale o da API.
        ...(parcial.data !== undefined && !editando
          ? { situacao: situacaoPara(parcial.data, sessao.hoje) }
          : {}),
      }))
    },
    [editando, sessao.hoje],
  )

  // Aporte (RF-3.19): na criação, de conta individual para a conjunta. Mesma chave e função de `CamposLancamento`.
  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: async () => (await listarContas()).contas,
  })
  const origem = valores.conta_id
  const contaOrigem = contas.data?.find((c) => c.id === origem)
  const contaDestino = contas.data?.find((c) => c.id === valores.conta_destino_id)
  const sugerirAporte =
    !editando &&
    origem !== null &&
    valores.data !== '' &&
    contaOrigem !== undefined &&
    contaOrigem.dono_usuario_id !== null &&
    contaDestino !== undefined &&
    contaDestino.dono_usuario_id === null
  // Falha da consulta não aparece: sem `data`, o campo fica sem sugestão.
  const sugestao = useQuery({
    queryKey: ['proporcao', 'sugestao', origem, valores.data],
    queryFn: sugerirAporte
      ? () => sugestaoAporte({ conta_origem_id: origem, data: valores.data })
      : skipToken,
    // Erro 4xx (ex.: data fora do intervalo, 422) é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const sugestaoValor = sugestao.data?.valor

  // Enquanto a pessoa não digitou, o campo mostra a sugestão; sem sugestão (ou falha) fica vazio.
  const valorTela =
    sugerirAporte && !digitou
      ? sugestaoValor
        ? mascararSugestao(sugestaoValor)
        : ''
      : valores.valor
  const valoresTela: ValoresCampos = { ...valores, valor: valorTela }

  function aoFalhar(erro: Error) {
    const campos = erro instanceof ApiError ? (erro.campos ?? {}) : {}
    const chaves = Object.keys(campos)
    const sobrou = chaves.length === 0 || chaves.some((c) => !CAMPOS_NA_TELA.includes(c))
    setErros(campos)
    setErroGeral(
      sobrou
        ? erro instanceof ApiError
          ? erro.mensagem
          : 'Erro inesperado. Tente novamente.'
        : undefined,
    )
  }

  function enviar(fecharDepois: boolean) {
    const falhas: Record<string, string> = {}
    if (!valoresTela.valor) falhas.valor = OBRIGATORIO
    if (!valores.data) falhas.data = OBRIGATORIO
    if (valores.conta_id === null) falhas.conta_id = OBRIGATORIO
    if (valores.conta_destino_id === null) falhas.conta_destino_id = OBRIGATORIO
    setErros(falhas)
    setErroGeral(undefined)
    // Origem e destino nulos já estão em `falhas`; este teste só estreita o tipo para o corpo.
    const { conta_id: origem, conta_destino_id: destino } = valores
    if (Object.keys(falhas).length > 0 || origem === null || destino === null) return

    // Recorrente nasce prevista: sem `situacao` no corpo.
    const campos = {
      valor: paraApi(valoresTela.valor),
      data: valores.data,
      conta_id: origem,
      conta_destino_id: destino,
      tag_ids: valores.tag_ids,
      observacao: valores.observacao,
      ...(recorrencia
        ? { recorrencia: corpoRecorrencia(recorrencia) }
        : { situacao: valores.situacao }),
    }
    const corpo =
      valoresIniciais && alcanceMultiplo
        ? corpoAlcanceMultiplo(valoresDeLancamento(valoresIniciais), valoresTela)
        : campos
    // Alcance múltiplo sem alteração: nada a enviar, só fecha (t136 S1).
    if (valoresIniciais && alcanceMultiplo && Object.keys(corpo).length === 0) {
      aoFechar()
      return
    }
    salvar.mutate(valoresIniciais ? corpo : { tipo: 'transferencia', ...corpo }, {
      onSuccess: () => {
        aoSalvar?.()
        if (fecharDepois) aoFechar()
        else {
          // No aporte, "Salvar e criar nova" mantém origem e destino (t193); na transferência comum, limpa tudo.
          setValores({
            ...valoresAbertura(sessao),
            ...(preenchimento ? { conta_id: origem, conta_destino_id: destino } : {}),
          })
          setRecorrencia(null)
          setDigitou(false)
          setErros({})
        }
      },
      onError: aoFalhar,
    })
  }

  return (
    <BottomSheet
      titulo={`${editando ? 'Editar' : 'Nova'} transferência`}
      aoFechar={aoFechar}
      rodape={
        <>
          {!editando && (
            <Button
              type="button"
              variant="secondary"
              disabled={salvar.isPending}
              onClick={() => enviar(false)}
            >
              Salvar e criar nova
            </Button>
          )}
          <Button type="button" disabled={salvar.isPending} onClick={() => enviar(true)}>
            Salvar
          </Button>
        </>
      }
    >
      <div ref={corpoRef}>
        <CamposLancamento
          tipo="transferencia"
          valores={valoresTela}
          aoMudar={mudar}
          erros={erros}
          ocultarSituacao={recorrencia !== null || alcanceMultiplo}
          forcarDetalhes={recorrencia !== null}
          detalhesExtras={
            editando ? undefined : (
              <CampoRecorrencia
                valor={recorrencia}
                aoMudar={setRecorrencia}
                erro={erros.recorrencia}
              />
            )
          }
        />
        {erroGeral && (
          <p role="alert" className="text-14 text-saida-texto">
            {erroGeral}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
