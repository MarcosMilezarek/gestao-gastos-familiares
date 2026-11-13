import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import {
  criarOrcamento,
  editarOrcamento,
  previaOrcamento,
  type CategoriaEntrada,
  type OrcamentoEntrada,
  type OrcamentoSaida,
} from '../../api/orcamentos'
import { BottomSheet } from '../../componentes/BottomSheet'
import { Campo } from '../../componentes/Campo'
import estado from '../../componentes/estado.module.css'
import { formatarBRL, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import css from '../../formularios/formularios.module.css'
import { LimitesCategorias, montarCategoriasCorpo, type LimitesValor } from './LimitesCategorias'
import styles from './assistente.module.css'

// Pausa na digitação antes de consultar a prévia.
const PAUSA_PREVIA_MS = 400

// Percentual digitado: de 0 a 100, com vírgula ou ponto e até 2 casas.
const PADRAO_PERCENTUAL = /^(100([.,]0{1,2})?|\d{1,2}([.,]\d{1,2})?)$/

// Valor da API ("10000.00") -> texto mascarado ("10.000,00"), sem passar por number.
function paraCampo(valor: string): string {
  const [inteiro = '0', centavos = ''] = valor.split('.')
  return mascararEntrada(inteiro + centavos.padEnd(2, '0'))
}

// Texto digitado ("20,5") -> "20.50" para a API; null se fora de 0 a 100. Só manipula a string.
function percentualParaApi(texto: string): string | null {
  if (!PADRAO_PERCENTUAL.test(texto)) return null
  const [inteiro = '', decimal = ''] = texto.split(/[.,]/)
  return `${inteiro.replace(/^0+(?=\d)/, '')}.${decimal.padEnd(2, '0')}`
}

// Edição: cada categoria do orçamento entra marcada. Subcategoria com limite zero entra como "0,00".
function limitesIniciais(orcamento: OrcamentoSaida | null): LimitesValor {
  return (orcamento?.categorias ?? []).map((categoria) => ({
    categoria_id: categoria.categoria_id,
    marcada: true,
    texto: categoria.por_subcategoria ? '' : paraCampo(categoria.limite),
    subcategorias: categoria.por_subcategoria
      ? categoria.subcategorias.map((sub) => ({
          categoria_id: sub.categoria_id,
          texto: paraCampo(sub.limite),
        }))
      : [],
  }))
}

// Erros `categorias.N...`: N é a posição em `corpo.categorias`; mostra o nome da categoria quando há.
function textosCategorias(
  campos: Record<string, string>,
  corpo: CategoriaEntrada[],
  previa: OrcamentoSaida | null,
): string[] {
  return Object.entries(campos)
    .filter(([chave]) => chave === 'categorias' || chave.startsWith('categorias.'))
    .map(([chave, mensagem]) => {
      const posicao = /^categorias\.(\d+)/.exec(chave)?.[1]
      if (posicao === undefined) return mensagem
      const indice = parseInt(posicao, 10)
      const categoriaId = corpo[indice]?.categoria_id
      const nome =
        previa?.categorias.find((categoria) => categoria.categoria_id === categoriaId)?.nome ??
        `Categoria ${indice + 1}`
      return `${nome}: ${mensagem}`
    })
}

type AssistenteOrcamentoProps = {
  mes: string
  // Com orçamento: edição (PUT). Sem: criação (POST).
  orcamento: OrcamentoSaida | null
  rendaSugerida: string
  aoFechar(): void
  aoSalvar(): void
}

// Assistente do orçamento em dois passos (fatia-7.md §5.1). Não é rota: vive no BottomSheet.
export function AssistenteOrcamento({
  mes,
  orcamento,
  rendaSugerida,
  aoFechar,
  aoSalvar,
}: AssistenteOrcamentoProps) {
  const queryClient = useQueryClient()
  const [passo, setPasso] = useState<1 | 2>(1)
  const [renda, setRenda] = useState(paraCampo(orcamento?.renda ?? rendaSugerida))
  const [percentual, setPercentual] = useState(
    orcamento ? orcamento.percentual_economia.replace('.', ',') : '20,00',
  )
  const [limites, setLimites] = useState<LimitesValor>(() => limitesIniciais(orcamento))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [avisosCategorias, setAvisosCategorias] = useState<string[]>([])
  const formRef = useRef<HTMLFormElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const percentualApi = percentualParaApi(percentual)
  // Corpo da prévia e do salvar; nulo enquanto o percentual não for válido.
  const entrada = useMemo<OrcamentoEntrada | null>(
    () =>
      percentualApi === null
        ? null
        : {
            renda: paraApi(renda),
            percentual_economia: percentualApi,
            categorias: montarCategoriasCorpo(limites),
          },
    [renda, percentualApi, limites],
  )

  // A prévia só é pedida depois de uma pausa; cada corpo é uma chave própria do React Query,
  // então uma resposta velha não sobrescreve a da consulta atual.
  const [previaPedida, setPreviaPedida] = useState<OrcamentoEntrada | null>(entrada)
  useEffect(() => {
    const temporizador = setTimeout(() => setPreviaPedida(entrada), PAUSA_PREVIA_MS)
    return () => clearTimeout(temporizador)
  }, [entrada])

  const consulta = useQuery({
    queryKey: ['previa-orcamento', previaPedida],
    queryFn: () => previaOrcamento(previaPedida as OrcamentoEntrada),
    enabled: previaPedida !== null,
    retry: repetirSem4xx,
    placeholderData: keepPreviousData,
  })
  const previa = previaPedida === null ? null : (consulta.data ?? null)
  const erroPrevia = previaPedida !== null && consulta.error instanceof ApiError ? consulta.error : null

  const salvar = useMutation({
    mutationFn: (corpo: OrcamentoEntrada) =>
      orcamento ? editarOrcamento(mes, corpo) : criarOrcamento(mes, corpo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamento', mes] })
      aoSalvar()
    },
    onError: (erro, corpo) => {
      if (!(erro instanceof ApiError)) {
        setAviso('Erro inesperado. Tente novamente.')
        return
      }
      if (erro.codigo === 'ORCAMENTO_JA_EXISTE') {
        // O orçamento existe no servidor: a tela reconsulta para sair do estado vazio.
        queryClient.invalidateQueries({ queryKey: ['orcamento', mes] })
      }
      const campos = erro.campos ?? {}
      setErros(campos)
      if (campos.renda || campos.percentual_economia) setPasso(1)
      setAviso(
        erro.codigo === 'ORCAMENTO_JA_EXISTE'
          ? 'Este mês já tem orçamento. Feche o assistente e confira a tela antes de tentar de novo.'
          : erro.mensagem,
      )
      setAvisosCategorias(textosCategorias(campos, corpo.categorias, previa))
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setAviso(null)
    setAvisosCategorias([])
    const percentualInvalido = { percentual_economia: 'Informe um percentual de 0 a 100.' }
    if (entrada === null) {
      setPasso(1)
      setErros(percentualInvalido)
      return
    }
    setErros({})
    if (passo === 1) {
      setPasso(2)
      return
    }
    salvar.mutate(entrada)
  }

  return (
    <BottomSheet
      titulo="Assistente do orçamento"
      aoFechar={aoFechar}
      rodape={
        passo === 1 ? (
          <button type="submit" form="form-assistente" className={estado.acao}>
            Avançar
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.secundario}
              onClick={() => setPasso(1)}
              disabled={salvar.isPending}
            >
              Voltar
            </button>
            <button
              type="submit"
              form="form-assistente"
              className={estado.acao}
              disabled={salvar.isPending}
            >
              Salvar
            </button>
          </>
        )
      }
    >
      {aviso && (
        <p role="alert" className={styles.erro}>
          {aviso}
        </p>
      )}
      {avisosCategorias.length > 0 && (
        <div role="alert" className={styles.erro}>
          {avisosCategorias.map((texto) => (
            <p key={texto}>{texto}</p>
          ))}
        </div>
      )}
      {erroPrevia && (
        <div role="alert" className={styles.erro}>
          <p>{erroPrevia.mensagem}</p>
          {textosCategorias(erroPrevia.campos ?? {}, previaPedida?.categorias ?? [], previa).map(
            (texto) => (
              <p key={texto}>{texto}</p>
            ),
          )}
        </div>
      )}

      <form ref={formRef} id="form-assistente" className={css.campos} onSubmit={enviar}>
        {passo === 1 ? (
          <>
            <Campo
              rotulo="Renda do mês"
              erro={erros.renda}
              ajuda={`Sugerida pelos salários do mês: ${formatarBRL(rendaSugerida)}`}
            >
              <input
                className={css.controle}
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={renda}
                onChange={(evento) => setRenda(mascararEntrada(evento.target.value))}
              />
            </Campo>

            <Campo rotulo="Percentual para economizar" erro={erros.percentual_economia} ajuda="De 0 a 100.">
              <input
                className={css.controle}
                type="text"
                inputMode="decimal"
                value={percentual}
                onChange={(evento) => setPercentual(evento.target.value)}
              />
            </Campo>

            <div className={styles.resumo} aria-live="polite">
              {previa ? (
                <>
                  <p className={styles.linhaResumo}>
                    Orçamento de gastos: {formatarBRL(previa.orcamento_gastos)}
                  </p>
                  <p className={styles.linhaResumo}>Economia: {formatarBRL(previa.economia)}</p>
                </>
              ) : (
                <p className={styles.aviso}>
                  {entrada === null
                    ? 'Informe um percentual de 0 a 100 para ver os valores.'
                    : consulta.isError
                      ? null
                      : 'Calculando…'}
                </p>
              )}
            </div>
          </>
        ) : (
          <LimitesCategorias valor={limites} previa={previa} onMudar={setLimites} />
        )}
      </form>
    </BottomSheet>
  )
}
