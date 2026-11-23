import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listarCartoes, type ItemFaturaSaida } from '../api/cartoes'
import { ApiError, repetirSem4xx } from '../api/cliente'
import { editarItem, lancarCompra, type CompraEntrada, type ItemEdicao } from '../api/itensFatura'
import type { Sessao } from '../api/sessao'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { BottomSheet } from '../componentes/BottomSheet'
import { Campo } from '../componentes/Campo'
import type { Alcance } from '../componentes/DialogoAlcance'
import { mascararEntrada, paraApi } from '../formatacao/dinheiro'
import { useSessao } from '../hooks/useSessao'
import { CampoParcelas } from './CampoParcelas'
import { CampoRecorrencia, type ValorRecorrencia } from './CampoRecorrencia'
import { CamposLancamento, type ValoresCampos } from './CamposLancamento'
import { SeletorFatura } from './SeletorFatura'
import { corpoRecorrencia, valoresAbertura } from './valoresLancamento'

// Campos que `CamposLancamento` e o formulário mostram; erro de outro campo aparece no formulário inteiro.
const CAMPOS_NA_TELA = [
  'valor',
  'data',
  'descricao',
  'categoria_id',
  'tag_ids',
  'observacao',
  'recorrencia',
  'parcelas',
  'fatura_mes',
]
const OBRIGATORIO = 'Campo obrigatório.'

type Envio = { cartaoId: number; corpo: CompraEntrada } | { itemId: number; corpo: ItemEdicao }

type Props = {
  // Criação: `cartao_id` e `fatura_mes` vêm de onde o formulário foi aberto. Edição: `item` é a compra.
  valoresIniciais?: { cartao_id?: number; fatura_mes?: string; item?: ItemFaturaSaida }
  // Alcance escolhido no `DialogoAlcance` para compra em série (só na edição).
  alcance?: Alcance
  aoFechar(): void
  aoSalvar?(): void
}

// Valores do formulário a partir do item. `valor` vem da API como "1234.50" e vira máscara sem passar por number.
function valoresDoItem(item: ItemFaturaSaida, sessao: Sessao): ValoresCampos {
  const [inteiro = '0', centavos = ''] = item.valor.split('.')
  return {
    ...valoresAbertura(sessao),
    valor: mascararEntrada(inteiro + centavos.padEnd(2, '0')),
    data: item.data,
    descricao: item.descricao_base,
    categoria_id: item.categoria?.id ?? null,
    tag_ids: item.tags.map((t) => t.id),
    observacao: item.observacao ?? '',
  }
}

function mesmoConjunto(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

// Edição com alcance múltiplo: só o que mudou em relação ao item (fatia-3.md §5.1). `situacao` não vai.
// `semData`: série parcelada com alcance múltiplo não aceita `data` (fatia-4 §3.3, regra c); o campo não é enviado.
function corpoMudanca(
  inicial: ValoresCampos,
  faturaInicial: string | null,
  atual: ValoresCampos,
  fatura: string | null,
  semData: boolean,
): ItemEdicao {
  const corpo: ItemEdicao = {}
  if (atual.valor !== inicial.valor) corpo.valor = paraApi(atual.valor)
  if (!semData && atual.data !== inicial.data) corpo.data = atual.data
  if (atual.descricao !== inicial.descricao) corpo.descricao = atual.descricao
  if (atual.categoria_id !== inicial.categoria_id && atual.categoria_id !== null) {
    corpo.categoria_id = atual.categoria_id
  }
  if (fatura !== faturaInicial && fatura !== null) corpo.fatura_mes = fatura
  if (!mesmoConjunto(atual.tag_ids, inicial.tag_ids)) corpo.tag_ids = atual.tag_ids
  if (atual.observacao !== inicial.observacao) corpo.observacao = atual.observacao
  return corpo
}

export function FormCompraCartao(props: Props) {
  const sessao = useSessao().data
  if (!sessao) return null
  return <FormularioAberto {...props} sessao={sessao} />
}

function FormularioAberto({
  valoresIniciais,
  alcance,
  aoFechar,
  aoSalvar,
  sessao,
}: Props & { sessao: Sessao }) {
  const item = valoresIniciais?.item
  const editando = item !== undefined
  // Com alcance múltiplo a situação some e só o que mudou vai no corpo (fatia-3.md §5.1).
  const alcanceMultiplo = alcance === 'este_e_pendentes' || alcance === 'todos'
  // Série parcelada com alcance múltiplo: o Valor não muda (D7).
  const parceladaMultipla = editando && alcanceMultiplo && item?.serie?.tipo === 'parcelada'
  // Série (parcelada ou recorrente) com alcance múltiplo: a fatura não muda (fatia-4 §3.3, regras b e d).
  const faturaTravada = editando && alcanceMultiplo && item?.serie != null

  const queryClient = useQueryClient()
  const cartoes = useQuery({
    queryKey: ['cartoes', 'ativos'],
    queryFn: () => listarCartoes(),
    retry: repetirSem4xx,
  })
  const listaCartoes = cartoes.data?.cartoes ?? []
  const semCartao = cartoes.isSuccess && listaCartoes.length === 0

  const salvar = useMutation({
    mutationFn: (envio: Envio) =>
      'itemId' in envio
        ? editarItem(envio.itemId, envio.corpo, alcance)
        : lancarCompra(envio.cartaoId, envio.corpo),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const [inicial] = useState<ValoresCampos>(() =>
    item ? valoresDoItem(item, sessao) : valoresAbertura(sessao),
  )
  const [valores, setValores] = useState<ValoresCampos>(inicial)
  const faturaInicial = item ? item.fatura_mes : (valoresIniciais?.fatura_mes ?? null)
  const [fatura, setFatura] = useState<string | null>(faturaInicial)
  const [cartaoId, setCartaoId] = useState<number | null>(valoresIniciais?.cartao_id ?? null)
  // `null` = não recorrente / não parcelada. Só existem na criação (D9).
  const [recorrencia, setRecorrencia] = useState<ValorRecorrencia | null>(null)
  const [parcelas, setParcelas] = useState<string | null>(null)
  // Muda a cada "Salvar e criar nova": remonta o seletor de fatura para sugerir de novo.
  const [rodada, setRodada] = useState(0)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  const corpoRef = useRef<HTMLDivElement>(null)

  // Foco no primeiro controle marcado como inválido, na ordem da tela.
  useEffect(() => {
    corpoRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  const mudar = useCallback(
    (parcial: Partial<ValoresCampos>) => setValores((atuais) => ({ ...atuais, ...parcial })),
    [],
  )

  // Recorrente e parcelada são excludentes: ligar uma desliga a outra.
  function mudarRecorrencia(valor: ValorRecorrencia | null) {
    setRecorrencia(valor)
    if (valor !== null) setParcelas(null)
  }

  function mudarParcelas(valor: string | null) {
    setParcelas(valor)
    if (valor !== null) setRecorrencia(null)
  }

  // Trocar o cartão zera a fatura: a de outro cartão não serve.
  function escolherCartao(valor: string) {
    setCartaoId(valor === '' ? null : Number(valor))
    setFatura(null)
  }

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

  function reiniciar() {
    setValores(valoresAbertura(sessao))
    setRecorrencia(null)
    setParcelas(null)
    setFatura(null)
    setRodada((r) => r + 1)
    setErros({})
  }

  function enviar(fecharDepois: boolean) {
    const falhas: Record<string, string> = {}
    if (!valores.valor) falhas.valor = OBRIGATORIO
    if (!valores.data) falhas.data = OBRIGATORIO
    if (!valores.descricao.trim()) falhas.descricao = OBRIGATORIO
    if (valores.categoria_id === null) falhas.categoria_id = OBRIGATORIO
    if (cartaoId === null) falhas.cartao_id = OBRIGATORIO
    if (editando && fatura === null) falhas.fatura_mes = OBRIGATORIO
    setErros(falhas)
    setErroGeral(undefined)
    // Categoria e cartão nulos já estão em `falhas`; este teste só estreita o tipo para o corpo.
    const { categoria_id: categoria } = valores
    if (Object.keys(falhas).length > 0 || categoria === null || cartaoId === null) return

    // Sem `fatura_mes` a API sugere a fatura pela data (RF-4.03). `undefined` some do JSON.
    const campos = {
      valor: paraApi(valores.valor),
      data: valores.data,
      descricao: valores.descricao,
      categoria_id: categoria,
      fatura_mes: fatura ?? undefined,
      tag_ids: valores.tag_ids,
      observacao: valores.observacao,
    }

    let envio: Envio
    if (!item) {
      envio = {
        cartaoId,
        corpo: {
          ...campos,
          parcelas: parcelas === null ? undefined : Number(parcelas),
          recorrencia: recorrencia ? corpoRecorrencia(recorrencia) : undefined,
        },
      }
    } else if (!alcanceMultiplo) {
      envio = { itemId: item.id, corpo: campos }
    } else {
      const corpo = corpoMudanca(inicial, faturaInicial, valores, fatura, parceladaMultipla)
      // Nada mudou: não há o que enviar.
      if (Object.keys(corpo).length === 0) {
        aoFechar()
        return
      }
      envio = { itemId: item.id, corpo }
    }

    salvar.mutate(envio, {
      onSuccess: () => {
        aoSalvar?.()
        if (fecharDepois) aoFechar()
        else reiniciar()
      },
      onError: aoFalhar,
    })
  }

  return (
    <BottomSheet
      titulo={`${editando ? 'Editar' : 'Nova'} despesa no cartão`}
      aoFechar={aoFechar}
      rodape={
        <>
          {!editando && (
            <Button
              type="button"
              variant="secondary"
              disabled={salvar.isPending || semCartao}
              onClick={() => enviar(false)}
            >
              Salvar e criar nova
            </Button>
          )}
          <Button type="button" disabled={salvar.isPending || semCartao} onClick={() => enviar(true)}>
            Salvar
          </Button>
        </>
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
          valorDesabilitado={parceladaMultipla}
          dataDesabilitada={parceladaMultipla}
          forcarDetalhes={!editando && (recorrencia !== null || parcelas !== null)}
          camposEssenciais={
            <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              {cartoes.isError && (
                <p role="alert" className="text-14 text-saida-texto">
                  Não foi possível carregar os cartões. Tente novamente.
                </p>
              )}
              {semCartao ? (
                <p>
                  Cadastre um cartão antes de lançar uma compra.{' '}
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/cartoes/novo">Cadastrar cartão</Link>
                  </Button>
                </p>
              ) : (
                // Na edição o cartão não muda: o PATCH não aceita `cartao_id` (fatia-4 §3.3).
                <Campo rotulo="Cartão" erro={erros.cartao_id}>
                  <Select
                    value={cartaoId ?? ''}
                    disabled={editando}
                    onChange={(e) => escolherCartao(e.target.value)}
                  >
                    <option value="">Escolha o cartão</option>
                    {listaCartoes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </Campo>
              )}
              <fieldset disabled={faturaTravada} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
                <SeletorFatura
                  key={`${cartaoId}-${rodada}`}
                  cartaoId={cartaoId}
                  data={valores.data}
                  valor={fatura}
                  aoMudar={setFatura}
                  erro={erros.fatura_mes}
                />
              </fieldset>
            </fieldset>
          }
          detalhesExtras={
            editando ? undefined : (
              <>
                <CampoRecorrencia
                  valor={recorrencia}
                  aoMudar={mudarRecorrencia}
                  erro={erros.recorrencia}
                />
                <CampoParcelas valor={parcelas} aoMudar={mudarParcelas} erro={erros.parcelas} />
              </>
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
