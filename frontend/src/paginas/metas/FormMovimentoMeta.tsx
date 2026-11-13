import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import {
  aplicar,
  editarMovimento,
  resgatar,
  type MovimentoEdicao,
  type MovimentoEntrada,
  type MovimentoMeta,
} from '../../api/metas'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import estado from '../../componentes/estado.module.css'
import { diaAnterior } from '../../formularios/CamposLancamento'
import css from '../../formularios/formularios.module.css'
import { situacaoPara } from '../../formularios/valoresLancamento'
import { mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import { useSessao } from '../../hooks/useSessao'

const TEXTOS = {
  aplicacao: { novo: 'Aplicar', edicao: 'Editar aplicação', situacao: 'Foi aplicado' },
  resgate: { novo: 'Resgatar', edicao: 'Editar resgate', situacao: 'Foi resgatado' },
}

// Valor da API ("-500.00" ou "500.00") -> máscara sem sinal. Resgate é guardado negativo na meta (§3.0).
function paraMascara(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.replace('-', '').split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

type Props = {
  metaId: number
  tipo: 'aplicacao' | 'resgate'
  // Movimento em edição; ausente na criação.
  movimento?: MovimentoMeta
  aoFechar(): void
}

// Aplicar ou resgatar (criar) e editar um desses movimentos (fatia-6.md §5.1, 6.F6). Sem conta nem dono.
export function FormMovimentoMeta(props: Props) {
  const sessao = useSessao().data
  if (!sessao) return null
  return <FormularioMovimento {...props} hoje={sessao.hoje} />
}

function FormularioMovimento({ metaId, tipo, movimento, aoFechar, hoje }: Props & { hoje: string }) {
  const editando = movimento !== undefined
  const textos = TEXTOS[tipo]
  const queryClient = useQueryClient()
  const corpoRef = useRef<HTMLDivElement>(null)
  const inputData = useRef<HTMLInputElement>(null)

  const [valor, setValor] = useState(() =>
    movimento ? paraMascara(movimento.valor) : mascararEntrada(''),
  )
  const [data, setData] = useState(movimento?.data ?? hoje)
  const [descricao, setDescricao] = useState(movimento?.descricao ?? '')
  const [situacao, setSituacao] = useState<'prevista' | 'confirmada'>(() =>
    movimento
      ? movimento.situacao === 'confirmada'
        ? 'confirmada'
        : 'prevista' // "atrasada" não é aceita na edição: abre como prevista
      : situacaoPara(data, hoje),
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string>()

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  // Na criação a situação acompanha a data (RF-2.16); na edição vale o da API.
  function trocarData(nova: string) {
    setData(nova)
    if (!editando) setSituacao(situacaoPara(nova, hoje))
  }

  const salvar = useMutation({
    mutationFn: () => {
      if (movimento?.id != null) {
        // Descrição vazia vai como null (remove o texto).
        const corpo: MovimentoEdicao = {
          valor: paraApi(valor),
          data,
          descricao: descricao.trim() || null,
          situacao,
        }
        return editarMovimento(movimento.id, corpo)
      }
      // Na criação o campo vazio é omitido.
      const corpo: MovimentoEntrada = {
        valor: paraApi(valor),
        data,
        situacao,
        ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
      }
      return tipo === 'aplicacao' ? aplicar(metaId, corpo) : resgatar(metaId, corpo)
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
    onError: (erro) => {
      const campos = erro instanceof ApiError ? (erro.campos ?? {}) : {}
      setErros(campos)
      setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErros({})
    setAviso(undefined)
    salvar.mutate()
  }

  return (
    <BottomSheet
      titulo={editando ? textos.edicao : textos.novo}
      aoFechar={aoFechar}
      rodape={
        <button
          type="submit"
          form="form-movimento-meta"
          className={estado.acao}
          disabled={salvar.isPending}
        >
          Salvar
        </button>
      }
    >
      <div ref={corpoRef}>
        {aviso && (
          <p role="alert" className={css.erro}>
            {aviso}
          </p>
        )}

        <form id="form-movimento-meta" className={css.campos} onSubmit={enviar}>
          <Campo rotulo="Valor" erro={erros.valor}>
            <input
              className={css.controle}
              type="text"
              inputMode="numeric"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(mascararEntrada(e.target.value))}
            />
          </Campo>

          <div className={css.atalhos} role="group" aria-label="Atalhos de data">
            <button
              type="button"
              className={css.atalho}
              aria-pressed={data === hoje}
              onClick={() => trocarData(hoje)}
            >
              Hoje
            </button>
            <button
              type="button"
              className={css.atalho}
              aria-pressed={data === diaAnterior(hoje)}
              onClick={() => trocarData(diaAnterior(hoje))}
            >
              Ontem
            </button>
            <button
              type="button"
              className={css.atalho}
              onClick={() => inputData.current?.focus()}
            >
              Outra data
            </button>
          </div>
          <Campo rotulo="Data" erro={erros.data}>
            <input
              ref={inputData}
              className={css.controle}
              type="date"
              value={data}
              onChange={(e) => trocarData(e.target.value)}
            />
          </Campo>

          <Campo rotulo="Descrição" erro={erros.descricao}>
            <input
              className={css.controle}
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </Campo>

          <label className={css.opcao}>
            <input
              type="checkbox"
              checked={situacao === 'confirmada'}
              onChange={(e) => setSituacao(e.target.checked ? 'confirmada' : 'prevista')}
            />
            {textos.situacao}
          </label>
        </form>
      </div>
    </BottomSheet>
  )
}
