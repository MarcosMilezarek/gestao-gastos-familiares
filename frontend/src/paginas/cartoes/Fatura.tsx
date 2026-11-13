import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleDashed, CircleMinus, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { obterFatura, type FaturaStatus, type ItemFaturaSaida } from '../../api/cartoes'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { excluirItem } from '../../api/itensFatura'
import type { Alcance } from '../../componentes/DialogoAlcance'
import { DialogoAlcance } from '../../componentes/DialogoAlcance'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { ItemFaturaLinha } from '../../componentes/ItemFaturaLinha'
import { SeletorMes } from '../../componentes/SeletorMes'
import { formatarData } from '../../formatacao/data'
import { eZero } from '../../formatacao/dinheiro'
import { FormEstorno } from '../../formularios/FormEstorno'
import { useFormularios } from '../../formularios/FormulariosProvider'
import { AcoesPagamento } from './AcoesPagamento'
import { AjustarFatura } from './AjustarFatura'
import { PagarFatura } from './PagarFatura'
import styles from './fatura.module.css'

// Só a forma "AAAA-MM" pode ir ao SeletorMes (ele formata o mês e quebra com outro valor).
const PADRAO_MES = /^\d{4}-(0[1-9]|1[0-2])$/

const STATUS: Record<FaturaStatus, { rotulo: string; Icone: LucideIcon }> = {
  aberta: { rotulo: 'Aberta', Icone: CircleDashed },
  fechada: { rotulo: 'Fechada', Icone: Lock },
  vencida: { rotulo: 'Vencida', Icone: TriangleAlert },
  zerada: { rotulo: 'Zerada', Icone: CircleMinus },
  paga: { rotulo: 'Paga', Icone: CircleCheck },
}

const ROTULOS_COMPRA: Record<Alcance, string> = {
  somente_este: 'Somente esta',
  este_e_pendentes: 'Esta e as pendentes',
  todos: 'Todas (incluindo efetivadas)',
}

// Ícone e texto (RNF-08): o status não depende só de cor.
function StatusFatura({ status }: { status: FaturaStatus }) {
  const { rotulo, Icone } = STATUS[status]
  return (
    <p className={status === 'vencida' ? `${styles.status} ${styles.alerta}` : styles.status}>
      <Icone aria-hidden="true" size={16} />
      {rotulo}
    </p>
  )
}

type Acao =
  | { tipo: 'editar'; item: ItemFaturaSaida }
  | { tipo: 'excluir'; item: ItemFaturaSaida }
  | { tipo: 'editar-estorno'; item: ItemFaturaSaida }

export function Fatura() {
  const { cartaoId = '', mes = '' } = useParams()
  const id = Number(cartaoId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { abrir } = useFormularios()
  const [acao, setAcao] = useState<Acao | null>(null)
  const [pagarAberto, setPagarAberto] = useState(false)
  const [ajustarAberto, setAjustarAberto] = useState(false)
  const [estornoAberto, setEstornoAberto] = useState(false)
  const [parametros, setParametros] = useSearchParams()
  const pedidoPagar = parametros.get('pagar') === '1'

  const consulta = useQuery({
    queryKey: ['fatura', { cartao_id: id, mes }],
    queryFn: () => obterFatura(id, mes),
    retry: repetirSem4xx,
  })
  const fatura = consulta.data

  // "Pagar fatura" do cartão leva ?pagar=1: abre o sheet uma vez (ajuste de estado na renderização) e tira o parâmetro da URL.
  if (pedidoPagar && fatura?.pode_pagar && !pagarAberto) setPagarAberto(true)

  useEffect(() => {
    if (!pedidoPagar || !fatura) return
    setParametros(
      (anterior) => {
        anterior.delete('pagar')
        return anterior
      },
      { replace: true },
    )
  }, [pedidoPagar, fatura, setParametros])

  const excluir = useMutation({
    mutationFn: ({ item, alcance }: { item: ItemFaturaSaida; alcance?: Alcance }) =>
      excluirItem(item.id, alcance),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
    onSettled: () => setAcao(null),
  })

  // Compra em série pede o alcance antes de abrir o formulário (RF-4.11, CA-4.11).
  function editar(item: ItemFaturaSaida) {
    if (item.tipo === 'estorno') setAcao({ tipo: 'editar-estorno', item })
    else if (item.serie !== null) setAcao({ tipo: 'editar', item })
    else abrir('cartao', { cartao_id: id, item })
  }

  // Excluir com série pede o alcance (DialogoAlcance); sem série, confirmação simples.
  function pedirExclusao(item: ItemFaturaSaida) {
    setAcao({ tipo: 'excluir', item })
  }

  const erroConsulta =
    consulta.error instanceof ApiError ? consulta.error.mensagem : 'Erro inesperado. Tente novamente.'
  const erroExcluir =
    excluir.error instanceof ApiError ? excluir.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <div className={styles.pagina}>
      {PADRAO_MES.test(mes) && (
        <SeletorMes
          mes={mes}
          onMudar={(novo) => navigate(`/cartoes/${cartaoId}/faturas/${novo}`)}
        />
      )}

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {erroConsulta}
        </p>
      )}
      {!fatura && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {fatura && (
        <>
          <section className={styles.cabecalho}>
            <h1 className={styles.titulo}>{fatura.cartao_nome}</h1>
            <StatusFatura status={fatura.status} />
            <dl className={styles.dados}>
              <div className={styles.campo}>
                <dt className={styles.rotulo}>Fechamento</dt>
                <dd className={styles.valor}>{formatarData(fatura.fechamento)}</dd>
              </div>
              <div className={styles.campo}>
                <dt className={styles.rotulo}>Vencimento</dt>
                <dd className={styles.valor}>{formatarData(fatura.vencimento)}</dd>
              </div>
              <div className={styles.campo}>
                <dt className={styles.rotulo}>Valor</dt>
                <dd className={styles.valor}>
                  <Dinheiro valor={fatura.valor} />
                </dd>
              </div>
              {!eZero(fatura.credito_recebido) && (
                <div className={styles.campo}>
                  <dt className={styles.rotulo}>Crédito de estorno</dt>
                  <dd className={styles.valor}>
                    <Dinheiro valor={fatura.credito_recebido} tipo="entrada" />
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {fatura.editavel && (
            <button
              type="button"
              className={styles.acao}
              onClick={() => abrir('cartao', { cartao_id: id, fatura_mes: mes })}
            >
              Nova compra
            </button>
          )}

          {fatura.editavel && (
            <>
              <button type="button" className={styles.acao} onClick={() => setEstornoAberto(true)}>
                Lançar estorno
              </button>
              <button type="button" className={styles.acao} onClick={() => setAjustarAberto(true)}>
                Ajustar fatura
              </button>
            </>
          )}

          <AcoesPagamento fatura={fatura} aoPagar={() => setPagarAberto(true)} />

          {fatura.itens.length === 0 ? (
            <EstadoVazio frase="Nenhum item nesta fatura." />
          ) : (
            <ul className={styles.lista}>
              {fatura.itens.map((item) => (
                <ItemFaturaLinha
                  key={item.id}
                  item={item}
                  aoEditar={fatura.editavel ? () => editar(item) : undefined}
                  aoExcluir={fatura.editavel ? () => pedirExclusao(item) : undefined}
                />
              ))}
            </ul>
          )}

          {pagarAberto && (
            <PagarFatura fatura={fatura} aoFechar={() => setPagarAberto(false)} />
          )}
          {ajustarAberto && (
            <AjustarFatura fatura={fatura} aoFechar={() => setAjustarAberto(false)} />
          )}
          {estornoAberto && (
            <FormEstorno
              cartaoId={id}
              mes={mes}
              compras={fatura.itens.filter((item) => item.tipo === 'compra')}
              aoFechar={() => setEstornoAberto(false)}
            />
          )}
          {acao?.tipo === 'editar-estorno' && (
            <FormEstorno
              cartaoId={id}
              mes={mes}
              compras={fatura.itens.filter((item) => item.tipo === 'compra')}
              item={acao.item}
              aoFechar={() => setAcao(null)}
            />
          )}
        </>
      )}

      {excluir.isError && (
        <p role="alert" className={styles.erro}>
          {erroExcluir}
        </p>
      )}

      {acao?.tipo === 'editar' && (
        <DialogoAlcance
          aberto
          acao="editar"
          titulo="Editar compra"
          rotulos={ROTULOS_COMPRA}
          onEscolher={(alcance) => {
            setAcao(null)
            abrir('cartao', { cartao_id: id, item: acao.item }, undefined, alcance)
          }}
          onCancelar={() => setAcao(null)}
        />
      )}
      {acao?.tipo === 'excluir' && acao.item.serie !== null && (
        <DialogoAlcance
          aberto
          acao="excluir"
          titulo="Excluir compra"
          rotulos={ROTULOS_COMPRA}
          onEscolher={(alcance) => excluir.mutate({ item: acao.item, alcance })}
          onCancelar={() => setAcao(null)}
        />
      )}
      {acao?.tipo === 'excluir' && acao.item.serie === null && (
        <DialogoConfirmacao
          titulo="Excluir item"
          texto="Excluir este item da fatura?"
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate({ item: acao.item })}
          onCancelar={() => setAcao(null)}
        />
      )}
    </div>
  )
}
