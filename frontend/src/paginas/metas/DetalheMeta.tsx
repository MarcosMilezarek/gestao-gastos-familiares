import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { excluirMeta, obterMeta, type MetaDetalhe } from '../../api/metas'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import estado from '../../componentes/estado.module.css'
import formato from '../../componentes/formato.module.css'
import { iconeDe } from '../../componentes/icones'
import { formatarData } from '../../formatacao/data'
import { formatarPercentual } from '../../formatacao/percentual'
import { FormAtualizarValor } from './FormAtualizarValor'
import { FormMeta } from './FormMeta'
import { FormMovimentoMeta } from './FormMovimentoMeta'
import { HistoricoMeta } from './HistoricoMeta'
import css from './detalheMeta.module.css'

// Formulários abertos pelos botões da tela.
type Formulario = 'editar' | 'aplicar' | 'resgatar' | 'atualizar'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

// Ícone da meta na cor dela (mesmo padrão de CardMeta).
function iconeColorido(meta: MetaDetalhe): ReactNode {
  const Icone = iconeDe(meta.icone)
  return <Icone aria-hidden="true" size={20} color={meta.cor} />
}

type IndicadorProps = { rotulo: string; valor: string }

function Indicador({ rotulo, valor }: IndicadorProps) {
  return (
    <div className={css.indicador}>
      <dt className={css.rotuloIndicador}>{rotulo}</dt>
      <dd className={css.valorIndicador}>
        <Dinheiro valor={valor} />
      </dd>
    </div>
  )
}

// Detalhe da meta (`/metas/:metaId`, fatia-6.md §5.1, 6.F5). Todos os valores vêm do servidor.
export function DetalheMeta() {
  const { metaId } = useParams()
  const id = Number(metaId)
  const idValido = Number.isInteger(id) && id > 0

  const consulta = useQuery({
    queryKey: ['metas', id],
    queryFn: () => obterMeta(id),
    enabled: idValido,
    retry: repetirSem4xx,
  })
  const meta = consulta.data
  const naoEncontrada =
    !idValido || (consulta.error instanceof ApiError && consulta.error.status === 404)

  return (
    <div className={css.pagina}>
      <Link to="/metas" className={estado.voltar}>
        Metas
      </Link>

      {naoEncontrada && (
        <p role="alert" className={formato.erro}>
          Meta não encontrada.
        </p>
      )}
      {!naoEncontrada && consulta.isError && (
        <p role="alert" className={formato.erro}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!meta && !consulta.isError && idValido && <p className={css.aviso}>Carregando…</p>}

      {meta && <DadosMeta meta={meta} />}
    </div>
  )
}

type DadosMetaProps = {
  meta: MetaDetalhe
}

function DadosMeta({ meta }: DadosMetaProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)
  // Casal desfeito: a meta só pode ser consultada, sem ações de escrita.
  const podeEscrever = !meta.casal_encerrado

  const excluir = useMutation({
    mutationFn: () => excluirMeta(meta.id),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate('/metas')
    },
    onError: () => setConfirmandoExcluir(false),
  })

  function fechar() {
    setFormulario(null)
  }

  return (
    <>
      <header className={css.cabecalho}>
        <h1 className={css.nome}>
          {iconeColorido(meta)}
          {meta.nome}
        </h1>
        {meta.descricao && <p className={css.secundario}>{meta.descricao}</p>}
        {meta.data_alvo !== null && (
          <p className={css.secundario}>
            Data-alvo: <time dateTime={meta.data_alvo}>{formatarData(meta.data_alvo)}</time>
          </p>
        )}
      </header>

      {meta.casal_encerrado && (
        <p className={css.aviso}>O casal foi desfeito: esta meta só pode ser consultada.</p>
      )}

      <dl className={css.indicadores}>
        <Indicador rotulo="Valor atual" valor={meta.valor_atual} />
        <Indicador rotulo="Alvo" valor={meta.valor_alvo} />
        <Indicador rotulo="Aplicado líquido" valor={meta.aplicado_liquido} />
        <Indicador rotulo="Rendeu" valor={meta.rendeu} />
        <Indicador rotulo="Falta" valor={meta.falta} />
      </dl>

      <div className={css.progresso}>
        <div className={css.barra} aria-hidden="true">
          <div
            className={css.preenchimento}
            style={{ width: `min(${meta.porcentagem}%, 100%)`, background: meta.cor }}
          />
        </div>
        <p className={css.porcentagem}>{formatarPercentual(meta.porcentagem)}</p>
      </div>

      {podeEscrever && (
        <div className={css.acoes}>
          <button type="button" className={estado.acao} onClick={() => setFormulario('aplicar')}>
            Aplicar
          </button>
          <button type="button" className={estado.acao} onClick={() => setFormulario('resgatar')}>
            Resgatar
          </button>
          <button
            type="button"
            className={estado.acao}
            onClick={() => setFormulario('atualizar')}
          >
            Atualizar valor atual
          </button>
          <button type="button" className={estado.acao} onClick={() => setFormulario('editar')}>
            Editar meta
          </button>
          <button
            type="button"
            className={estado.acao}
            onClick={() => setConfirmandoExcluir(true)}
          >
            Excluir meta
          </button>
        </div>
      )}

      {excluir.isError && (
        <p role="alert" className={formato.erro}>
          {mensagemErro(excluir.error)}
        </p>
      )}

      <HistoricoMeta meta={meta} />

      {formulario === 'editar' && <FormMeta meta={meta} aoFechar={fechar} />}
      {formulario === 'aplicar' && (
        <FormMovimentoMeta metaId={meta.id} tipo="aplicacao" aoFechar={fechar} />
      )}
      {formulario === 'resgatar' && (
        <FormMovimentoMeta metaId={meta.id} tipo="resgate" aoFechar={fechar} />
      )}
      {formulario === 'atualizar' && (
        <FormAtualizarValor metaId={meta.id} valorAtual={meta.valor_atual} aoFechar={fechar} />
      )}

      {confirmandoExcluir && (
        <DialogoConfirmacao
          titulo="Excluir meta"
          texto="A meta só pode ser excluída sem aplicações, resgates ou rendimentos."
          rotuloAcao="Excluir"
          onConfirmar={() => excluir.mutate()}
          onCancelar={() => setConfirmandoExcluir(false)}
        />
      )}
    </>
  )
}
