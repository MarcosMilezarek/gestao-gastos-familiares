import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ItemFaturaSaida } from '../api/cartoes'
import { ApiError } from '../api/cliente'
import { editarItem, lancarEstorno, type EstornoEntrada } from '../api/itensFatura'
import { BottomSheet } from '../componentes/BottomSheet'
import { Campo } from '../componentes/Campo'
import estado from '../componentes/estado.module.css'
import type { Sessao } from '../api/sessao'
import { formatarData } from '../formatacao/data'
import { mascararEntrada, paraApi } from '../formatacao/dinheiro'
import { useSessao } from '../hooks/useSessao'
import { CamposLancamento, type ValoresCampos } from './CamposLancamento'
import css from './formularios.module.css'
import { SeletorFatura } from './SeletorFatura'
import { valoresAbertura } from './valoresLancamento'

// Campos que o formulário mostra; erro de outro campo aparece como mensagem geral.
const CAMPOS_NA_TELA = [
  'valor',
  'data',
  'descricao',
  'categoria_id',
  'tag_ids',
  'observacao',
  'fatura_mes',
  'item_origem_id',
]
const OBRIGATORIO = 'Campo obrigatório.'

type Props = {
  cartaoId: number
  // Mês da fatura da tela: padrão da fatura de destino na criação.
  mes: string
  // Compras da fatura mostrada na tela (o vínculo só aponta para elas).
  compras: ItemFaturaSaida[]
  // Estorno em edição; ausente na criação.
  item?: ItemFaturaSaida
  aoFechar(): void
}

export function FormEstorno(props: Props) {
  const sessao = useSessao().data
  if (!sessao) return null
  return <FormularioEstorno {...props} sessao={sessao} />
}

function FormularioEstorno({
  cartaoId,
  mes,
  compras,
  item,
  aoFechar,
  sessao,
}: Props & { sessao: Sessao }) {
  const editando = item !== undefined
  const queryClient = useQueryClient()
  const corpoRef = useRef<HTMLDivElement>(null)
  const [valores, setValores] = useState<ValoresCampos>(() =>
    item
      ? {
          ...valoresAbertura(sessao),
          // Estorno é gravado positivo; a fatura mostra o sinal negativo, que sai aqui.
          valor: mascararEntrada(item.valor.replace(/\D/g, '')),
          data: item.data,
          descricao: item.descricao,
          categoria_id: item.categoria?.id ?? null,
          tag_ids: item.tags.map((t) => t.id),
          observacao: item.observacao ?? '',
        }
      : valoresAbertura(sessao),
  )
  const [faturaMes, setFaturaMes] = useState<string | null>(item ? item.fatura_mes : mes)
  const [origem, setOrigem] = useState<number | null>(item ? item.item_origem_id : null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const mudar = useCallback(
    (parcial: Partial<ValoresCampos>) => setValores((atuais) => ({ ...atuais, ...parcial })),
    [],
  )

  const salvar = useMutation({
    mutationFn: (corpo: EstornoEntrada) =>
      item ? editarItem(item.id, corpo) : lancarEstorno(cartaoId, corpo),
    onSuccess: () => {
      queryClient.invalidateQueries()
      aoFechar()
    },
  })

  function aoFalhar(erro: Error) {
    const campos = erro instanceof ApiError ? (erro.campos ?? {}) : {}
    const sobrou =
      Object.keys(campos).length === 0 || Object.keys(campos).some((c) => !CAMPOS_NA_TELA.includes(c))
    setErros(campos)
    setErroGeral(
      sobrou
        ? erro instanceof ApiError
          ? erro.mensagem
          : 'Erro inesperado. Tente novamente.'
        : undefined,
    )
  }

  // Vínculo opcional: escolher uma compra preenche a categoria dela (CA-4.16).
  function escolherCompra(e: ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value === '' ? null : Number(e.target.value)
    setOrigem(id)
    const compra = compras.find((c) => c.id === id)
    if (compra?.categoria) mudar({ categoria_id: compra.categoria.id })
  }

  function enviar() {
    const falhas: Record<string, string> = {}
    if (!valores.valor) falhas.valor = OBRIGATORIO
    if (!valores.data) falhas.data = OBRIGATORIO
    if (!valores.descricao.trim()) falhas.descricao = OBRIGATORIO
    if (valores.categoria_id === null) falhas.categoria_id = OBRIGATORIO
    if (faturaMes === null) falhas.fatura_mes = OBRIGATORIO
    setErros(falhas)
    setErroGeral(undefined)
    // Categoria e fatura nulas já estão em `falhas`; este teste só estreita o tipo para o corpo.
    const { categoria_id: categoria } = valores
    if (Object.keys(falhas).length > 0 || categoria === null || faturaMes === null) return

    // Na edição o vínculo não muda (a API mantém a compra de origem): só entra na criação.
    const corpo: EstornoEntrada = {
      valor: paraApi(valores.valor),
      data: valores.data,
      descricao: valores.descricao,
      categoria_id: categoria,
      fatura_mes: faturaMes,
      tag_ids: valores.tag_ids,
      observacao: valores.observacao,
      ...(!editando && origem !== null ? { item_origem_id: origem } : {}),
    }
    salvar.mutate(corpo, { onError: aoFalhar })
  }

  return (
    <BottomSheet
      titulo={editando ? 'Editar estorno' : 'Lançar estorno'}
      aoFechar={aoFechar}
      rodape={
        <button
          type="button"
          className={estado.acao}
          disabled={salvar.isPending}
          onClick={enviar}
        >
          Salvar
        </button>
      }
    >
      <div ref={corpoRef}>
        <CamposLancamento
          tipo="despesa"
          valores={valores}
          aoMudar={mudar}
          erros={erros}
          ocultarSituacao
          ocultarDonoConta
          camposEssenciais={
            <>
              <SeletorFatura
                cartaoId={cartaoId}
                data={valores.data}
                valor={faturaMes}
                aoMudar={setFaturaMes}
                erro={erros.fatura_mes}
              />
              <Campo
                rotulo="Compra vinculada"
                erro={erros.item_origem_id}
                ajuda={editando ? 'O vínculo não muda na edição.' : undefined}
              >
                <select
                  className={css.controle}
                  value={origem ?? ''}
                  disabled={editando}
                  onChange={escolherCompra}
                >
                  <option value="">Sem vínculo</option>
                  {compras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {`${c.descricao} · ${formatarData(c.data)}`}
                    </option>
                  ))}
                  {/* Vínculo com compra de outra fatura: sem esta opção o select mostraria "Sem vínculo" por engano. */}
                  {origem !== null && !compras.some((c) => c.id === origem) && (
                    <option value={origem}>Compra de outra fatura</option>
                  )}
                </select>
              </Campo>
            </>
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
