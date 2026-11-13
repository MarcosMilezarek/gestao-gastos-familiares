import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/cliente'
import type { LancamentoSaida } from '../api/lancamentos'
import type { Sessao } from '../api/sessao'
import { BottomSheet } from '../componentes/BottomSheet'
import type { Alcance } from '../componentes/DialogoAlcance'
import estado from '../componentes/estado.module.css'
import { paraApi } from '../formatacao/dinheiro'
import { useSessao } from '../hooks/useSessao'
import { CampoRecorrencia, type ValorRecorrencia } from './CampoRecorrencia'
import { CamposLancamento, type ValoresCampos } from './CamposLancamento'
import css from './formularios.module.css'
import { useSalvarLancamento } from './useSalvarLancamento'
import {
  corpoAlcanceMultiplo,
  corpoRecorrencia,
  situacaoPara,
  valoresAbertura,
  valoresDeLancamento,
} from './valoresLancamento'

// Campos que `CamposLancamento` mostra; erro de outro campo aparece no formulário inteiro.
const CAMPOS_NA_TELA = [
  'valor',
  'data',
  'descricao',
  'categoria_id',
  'conta_id',
  'tag_ids',
  'dono_usuario_id',
  'observacao',
  'recorrencia',
]
const OBRIGATORIO = 'Campo obrigatório.'

type Props = {
  tipo: 'despesa' | 'receita'
  valoresIniciais?: LancamentoSaida
  // Alcance escolhido no `DialogoAlcance` para lançamento recorrente (só na edição).
  alcance?: Alcance
  aoFechar(): void
  aoSalvar?(): void
}

export function FormDespesaReceita(props: Props) {
  const sessao = useSessao().data
  if (!sessao) return null
  return <FormularioAberto {...props} sessao={sessao} />
}

function FormularioAberto({
  tipo,
  valoresIniciais,
  alcance,
  aoFechar,
  aoSalvar,
  sessao,
}: Props & { sessao: Sessao }) {
  const editando = valoresIniciais !== undefined
  // Com alcance múltiplo a situação some e o corpo leva só o que mudou (fatia-3.md §5.1).
  const alcanceMultiplo = alcance === 'este_e_pendentes' || alcance === 'todos'
  const salvar = useSalvarLancamento(valoresIniciais?.id, alcance)
  const [valores, setValores] = useState<ValoresCampos>(() =>
    valoresIniciais ? valoresDeLancamento(valoresIniciais) : valoresAbertura(sessao),
  )
  // `null` = não recorrente. Só existe na criação (D9).
  const [recorrencia, setRecorrencia] = useState<ValorRecorrencia | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  const corpoRef = useRef<HTMLDivElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const mudar = useCallback(
    (parcial: Partial<ValoresCampos>) =>
      setValores((atuais) => ({
        ...atuais,
        ...parcial,
        // Na criação a situação acompanha a data (RF-2.16); na edição vale o da API.
        ...(parcial.data !== undefined && !editando
          ? { situacao: situacaoPara(parcial.data, sessao.hoje) }
          : {}),
      })),
    [editando, sessao.hoje],
  )

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
    if (!valores.valor) falhas.valor = OBRIGATORIO
    if (!valores.data) falhas.data = OBRIGATORIO
    if (!valores.descricao.trim()) falhas.descricao = OBRIGATORIO
    if (valores.categoria_id === null) falhas.categoria_id = OBRIGATORIO
    if (valores.conta_id === null) falhas.conta_id = OBRIGATORIO
    setErros(falhas)
    setErroGeral(undefined)
    // Categoria e conta nulas já estão em `falhas`; este teste só estreita o tipo para o corpo.
    const { categoria_id: categoria, conta_id: conta } = valores
    if (Object.keys(falhas).length > 0 || categoria === null || conta === null) return

    // Recorrente nasce prevista: sem `situacao` no corpo.
    const campos = {
      valor: paraApi(valores.valor),
      data: valores.data,
      descricao: valores.descricao,
      categoria_id: categoria,
      dono_usuario_id: valores.dono_usuario_id,
      conta_id: conta,
      tag_ids: valores.tag_ids,
      observacao: valores.observacao,
      ...(recorrencia
        ? { recorrencia: corpoRecorrencia(recorrencia) }
        : { situacao: valores.situacao }),
    }
    const corpo =
      valoresIniciais && alcanceMultiplo
        ? corpoAlcanceMultiplo(valoresDeLancamento(valoresIniciais), valores)
        : campos
    // Alcance múltiplo sem alteração: nada a enviar, só fecha (t136 S1).
    if (valoresIniciais && alcanceMultiplo && Object.keys(corpo).length === 0) {
      aoFechar()
      return
    }
    salvar.mutate(valoresIniciais ? corpo : { tipo, ...corpo }, {
      onSuccess: () => {
        aoSalvar?.()
        if (fecharDepois) aoFechar()
        else {
          setValores(valoresAbertura(sessao))
          setRecorrencia(null)
          setErros({})
        }
      },
      onError: aoFalhar,
    })
  }

  return (
    <BottomSheet
      titulo={`${editando ? 'Editar' : 'Nova'} ${tipo}`}
      aoFechar={aoFechar}
      rodape={
        <>
          {!editando && (
            <button
              type="button"
              className={estado.acao}
              disabled={salvar.isPending}
              onClick={() => enviar(false)}
            >
              Salvar e criar nova
            </button>
          )}
          <button
            type="button"
            className={estado.acao}
            disabled={salvar.isPending}
            onClick={() => enviar(true)}
          >
            Salvar
          </button>
        </>
      }
    >
      <div ref={corpoRef}>
        <CamposLancamento
          tipo={tipo}
          valores={valores}
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
          <p role="alert" className={css.erro}>
            {erroGeral}
          </p>
        )}
      </div>
    </BottomSheet>
  )
}
