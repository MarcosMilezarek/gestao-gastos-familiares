import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { excluirMeta, obterMeta, type MetaDetalhe } from '../../api/metas'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { CartaoDestaque } from '../../componentes/CartaoDestaque'
import { Dinheiro } from '../../componentes/Dinheiro'
import { DialogoConfirmacao } from '../../componentes/DialogoConfirmacao'
import { iconeDe } from '../../componentes/icones'
import { IconeQuadrado } from '../../componentes/IconeQuadrado'
import { formatarData } from '../../formatacao/data'
import { formatarPercentual } from '../../formatacao/percentual'
import { FormAtualizarValor } from './FormAtualizarValor'
import { FormMeta } from './FormMeta'
import { FormMovimentoMeta } from './FormMovimentoMeta'
import { HistoricoMeta } from './HistoricoMeta'

const CLASSE_ERRO = 'text-14 font-medium text-saida-texto'
const CLASSE_AVISO = 'text-14 text-muted-foreground'

// Formulários abertos pelos botões da tela.
type Formulario = 'editar' | 'aplicar' | 'resgatar' | 'atualizar'

function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.mensagem : 'Erro inesperado. Tente novamente.'
}

type IndicadorProps = { rotulo: string; valor: string }

function Indicador({ rotulo, valor }: IndicadorProps) {
  return (
    <div className="min-w-0">
      <dt className="text-13 text-muted-foreground">{rotulo}</dt>
      <dd>
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
    <div className="flex flex-col gap-4">
      <CabecalhoTela titulo={meta?.nome ?? 'Meta'} voltarPara="/metas" />

      {naoEncontrada && (
        <p role="alert" className={CLASSE_ERRO}>
          Meta não encontrada.
        </p>
      )}
      {!naoEncontrada && consulta.isError && (
        <p role="alert" className={CLASSE_ERRO}>
          {mensagemErro(consulta.error)}
        </p>
      )}
      {!meta && !consulta.isError && idValido && <p className={CLASSE_AVISO}>Carregando…</p>}

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
      {meta.casal_encerrado && (
        <p className={CLASSE_AVISO}>O casal foi desfeito: esta meta só pode ser consultada.</p>
      )}

      <CartaoDestaque
        rotulo="Valor atual"
        valor={meta.valor_atual}
        chips={[
          { rotulo: 'Alvo', valor: meta.valor_alvo },
          { rotulo: 'Falta', valor: meta.falta },
        ]}
      />

      <Card>
        <div className="flex items-center gap-3">
          <span style={meta.cor ? { color: meta.cor } : undefined} className="inline-flex">
            <IconeQuadrado
              icone={iconeDe(meta.icone)}
              className={meta.cor ? 'bg-current/15 text-inherit' : undefined}
            />
          </span>
          <div className="flex min-w-0 flex-col">
            {meta.descricao && <p className="text-14 text-muted-foreground">{meta.descricao}</p>}
            {meta.data_alvo !== null && (
              <p className="text-14 text-muted-foreground tabular-nums">
                Data-alvo: <time dateTime={meta.data_alvo}>{formatarData(meta.data_alvo)}</time>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={Math.min(100, Number(meta.porcentagem))} />
          <p className="text-14 font-semibold tabular-nums">
            {formatarPercentual(meta.porcentagem)}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <Indicador rotulo="Aplicado líquido" valor={meta.aplicado_liquido} />
          <Indicador rotulo="Rendeu" valor={meta.rendeu} />
        </dl>
      </Card>

      {podeEscrever && (
        <div className="grid grid-cols-2 gap-2">
          <Button className="col-span-2" onClick={() => setFormulario('aplicar')}>
            Aplicar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFormulario('resgatar')}>
            Resgatar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFormulario('atualizar')}>
            Atualizar valor atual
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFormulario('editar')}>
            Editar meta
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmandoExcluir(true)}>
            Excluir meta
          </Button>
        </div>
      )}

      {excluir.isError && (
        <p role="alert" className={CLASSE_ERRO}>
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
