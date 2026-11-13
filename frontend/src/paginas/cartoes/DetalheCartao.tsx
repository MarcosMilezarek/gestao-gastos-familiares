import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { editarCartao, excluirCartao, obterCartao, type CartaoSaida } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterConta } from '../../api/contas'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import estado from '../../componentes/estado.module.css'
import { formatarBRL, paraApi } from '../../formatacao/dinheiro'
import configuracoes from '../configuracoes/configuracoes.module.css'
import { CamposCartao, validarValores, type ErrosCartao, type ValoresCartao } from './CadastroCartao'
import styles from './formCartao.module.css'

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
      <div className={styles.pagina}>
        <p role="alert" className={styles.erro}>
          Cartão não encontrado.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.pagina}>
      <Link to="/cartoes" className={estado.voltar}>
        Cartões
      </Link>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!cartao && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

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
      <h1 className={styles.titulo}>{cartao.nome}</h1>

      {arquivada && (
        <p className={styles.aviso}>
          A conta dona está arquivada: o cartão está só para consulta.
        </p>
      )}

      <div className={configuracoes.secao}>
        <span className={styles.rotulo}>Conta dona</span>
        <p className={styles.texto}>{conta.data?.nome ?? 'Carregando…'}</p>
      </div>

      {aviso && (
        <p role="alert" className={configuracoes.aviso}>
          {aviso}
        </p>
      )}
      {status && (
        <p role="status" className={configuracoes.status}>
          {status}
        </p>
      )}

      <form onSubmit={enviar}>
        <fieldset className={styles.formulario} disabled={arquivada}>
          <CamposCartao
            valores={valores}
            erros={erros}
            aoMudar={(parcial) => setValores({ ...valores, ...parcial })}
            ajusteDias={AJUSTE_DIAS}
          />
          {!arquivada && (
            <button type="submit" className={configuracoes.botao} disabled={salvar.isPending}>
              Salvar
            </button>
          )}
        </fieldset>
      </form>

      <div className={styles.acoes}>
        <Link to={`/cartoes/${cartao.id}/faturas/${cartao.fatura_corrente.mes}`} className={estado.voltar}>
          Ver fatura atual
        </Link>
        {!arquivada && (
          <button type="button" className={estado.acao} onClick={() => setConfirmandoExcluir(true)}>
            Excluir cartão
          </button>
        )}
      </div>

      {confirmandoExcluir && (
        <DialogoConfirmacao
          titulo="Excluir cartão"
          texto="O cartão só pode ser excluído sem compras, séries nem pagamento de fatura."
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate()}
          onCancelar={() => setConfirmandoExcluir(false)}
        />
      )}
    </>
  )
}
