import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { editarCartao, excluirCartao, obterCartao, type CartaoSaida } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterConta } from '../../api/contas'
import { Button } from '@/components/ui/button'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { formatarBRL, paraApi } from '../../formatacao/dinheiro'
import { CamposCartao, validarValores, type ErrosCartao, type ValoresCartao } from './CadastroCartao'

const AJUSTE_DIAS =
  'Mudar os dias muda as datas das faturas; os itens já lançados não são movidos de fatura.'

// Edição do cartão (`/cartoes/:cartaoId`). A conta dona é só leitura (D3).
export function DetalheCartao() {
  const { cartaoId } = useParams()
  const id = Number(cartaoId)

  const consulta = useQuery({
    queryKey: ['cartoes', id],
    queryFn: () => obterCartao(id),
    enabled: Number.isInteger(id),
    retry: repetirSem4xx,
  })
  const cartao = consulta.data

  if (!Number.isInteger(id)) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <p role="alert" className="text-14 text-saida-texto">
          Cartão não encontrado.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo={cartao?.nome ?? 'Cartão'} voltarPara="/cartoes" />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!cartao && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

      {cartao && <DadosCartao key={cartao.id} cartao={cartao} />}
    </div>
  )
}

function paraTexto(valor: string): string {
  return formatarBRL(valor).replace('R$ ', '')
}

type DadosCartaoProps = {
  cartao: CartaoSaida
}

function DadosCartao({ cartao }: DadosCartaoProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const arquivada = cartao.conta_arquivada
  const [valores, setValores] = useState<ValoresCartao>({
    nome: cartao.nome,
    limite: paraTexto(cartao.limite),
    diaFechamento: String(cartao.dia_fechamento),
    diaVencimento: String(cartao.dia_vencimento),
    bandeira: cartao.bandeira ?? '',
  })
  const [erros, setErros] = useState<ErrosCartao>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)

  const conta = useQuery({
    queryKey: ['contas', cartao.conta_id],
    queryFn: () => obterConta(cartao.conta_id),
    retry: repetirSem4xx,
  })

  function tratarErro(erro: unknown) {
    setErros(erro instanceof ApiError ? (erro.campos ?? {}) : {})
    setAviso(erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.')
    setStatus(null)
  }

  const salvar = useMutation({
    mutationFn: () =>
      editarCartao(cartao.id, {
        nome: valores.nome.trim(),
        limite: paraApi(valores.limite),
        dia_fechamento: Number(valores.diaFechamento),
        dia_vencimento: Number(valores.diaVencimento),
        bandeira: valores.bandeira.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setAviso(null)
      setErros({})
      setStatus('Cartão salvo.')
    },
    onError: tratarErro,
  })

  const excluir = useMutation({
    mutationFn: () => excluirCartao(cartao.id),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate('/cartoes')
    },
    onError: (erro) => {
      setConfirmandoExcluir(false)
      tratarErro(erro)
    },
  })

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const novosErros = validarValores(valores)
    setAviso(null)
    setStatus(null)
    setErros(novosErros)
    if (Object.keys(novosErros).length > 0) return
    salvar.mutate()
  }

  return (
    <>
      {arquivada && (
        <p className="text-14 text-alerta-texto">
          A conta dona está arquivada: o cartão está só para consulta.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-14 font-semibold">Conta dona</span>
        <p className="text-16">{conta.data?.nome ?? 'Carregando…'}</p>
      </div>

      {aviso && (
        <p role="alert" className="text-14 text-saida-texto">
          {aviso}
        </p>
      )}
      {status && (
        <p role="status" className="text-14 text-entrada-texto">
          {status}
        </p>
      )}

      <form onSubmit={enviar}>
        <fieldset className="flex min-w-0 flex-col gap-4" disabled={arquivada}>
          <CamposCartao
            valores={valores}
            erros={erros}
            aoMudar={(parcial) => setValores({ ...valores, ...parcial })}
            ajusteDias={AJUSTE_DIAS}
          />
          {!arquivada && (
            <Button type="submit" className="w-full" disabled={salvar.isPending}>
              Salvar
            </Button>
          )}
        </fieldset>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link to={`/cartoes/${cartao.id}/faturas/${cartao.fatura_corrente.mes}`}>Ver fatura atual</Link>
        </Button>
        {!arquivada && (
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmandoExcluir(true)}>
            Excluir cartão
          </Button>
        )}
      </div>

      {confirmandoExcluir && (
        <DialogoConfirmacao
          titulo="Excluir cartão"
          texto="O cartão só pode ser excluído sem compras, séries nem pagamento de fatura."
          rotuloAcao="Excluir"
          destrutivo
          onConfirmar={() => excluir.mutate()}
          onCancelar={() => setConfirmandoExcluir(false)}
        />
      )}
    </>
  )
}
