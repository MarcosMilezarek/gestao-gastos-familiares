import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { listarCategorias, listarTags, type CategoriaSaida } from '../api/categorias'
import { listarContas, type ContaSaida } from '../api/contas'
import { Campo } from '../componentes/Campo'
import { mascararEntrada } from '../formatacao/dinheiro'
import { useSessao } from '../hooks/useSessao'
import css from './formularios.module.css'

// Valores controlados dos campos. `valor` fica mascarado ("1.234,56"); `paraApi` converte na hora de salvar.
// `dono_usuario_id: null` significa "Casal", como na API.
export type ValoresCampos = {
  valor: string
  data: string
  descricao: string
  categoria_id: number | null
  dono_usuario_id: number | null
  conta_id: number | null
  conta_destino_id: number | null
  tag_ids: number[]
  observacao: string
  situacao: 'prevista' | 'confirmada'
}

type Props = {
  tipo: 'despesa' | 'receita' | 'transferencia'
  valores: ValoresCampos
  aoMudar(parcial: Partial<ValoresCampos>): void
  erros?: Record<string, string>
  // Conteúdo extra do bloco "Mais detalhes" (ex.: recorrência, t132 e t133).
  detalhesExtras?: ReactNode
  // Esconde "Foi paga/recebida" (a ocorrência nasce prevista ao ser recorrente).
  ocultarSituacao?: boolean
  // Mantém "Mais detalhes" aberto e sem recolher (recorrência ligada, t136 I1).
  forcarDetalhes?: boolean
  // Não mostra "Dono" nem "Conta" e não preenche a conta pelo dono (compra no cartão, CA-4.02).
  ocultarDonoConta?: boolean
  // Campos próprios do formulário, renderizados no lugar de "Dono" e "Conta".
  camposEssenciais?: ReactNode
  // Desabilita o Valor (série parcelada com alcance múltiplo, D7).
  valorDesabilitado?: boolean
  // Desabilita a Data e os atalhos de data (série parcelada com alcance múltiplo, fatia-4 §3.3 regra c).
  dataDesabilitada?: boolean
}

// Conta do dono, sem arquivadas. Vale para "Casal" (dono nulo) e para cada pessoa.
function contaDoDono(contas: ContaSaida[] | undefined, dono: number | null): number | null {
  return contas?.find((c) => !c.arquivado && c.dono_usuario_id === dono)?.id ?? null
}

// Arquivada só aparece se for a categoria que o lançamento já tem (fatia-2.md §4.6 passo 3).
function opcoesCategoria(lista: CategoriaSaida[], atual: number | null) {
  const ativa = (c: { id: number; arquivado: boolean }) => !c.arquivado || c.id === atual
  const opcoes: { id: number; rotulo: string }[] = []
  for (const raiz of lista) {
    if (ativa(raiz)) opcoes.push({ id: raiz.id, rotulo: raiz.nome })
    for (const sub of raiz.subcategorias) {
      if (ativa(sub)) opcoes.push({ id: sub.id, rotulo: `${raiz.nome} > ${sub.nome}` })
    }
  }
  return opcoes
}

const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Dia anterior em "AAAA-MM-DD" por aritmética inteira, sem Date (`front.md` §7).
export function diaAnterior(data: string): string {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number)
  const dois = (n: number) => String(n).padStart(2, '0')
  if (dia > 1) return `${ano}-${dois(mes)}-${dois(dia - 1)}`
  if (mes > 1) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
    const diasAnterior = mes - 1 === 2 && bissexto ? 29 : (DIAS_NO_MES[mes - 2] ?? 31)
    return `${ano}-${dois(mes - 1)}-${dois(diasAnterior)}`
  }
  return `${ano - 1}-12-31`
}

export function CamposLancamento({
  tipo,
  valores,
  aoMudar,
  erros = {},
  detalhesExtras,
  ocultarSituacao = false,
  forcarDetalhes = false,
  ocultarDonoConta = false,
  camposEssenciais,
  valorDesabilitado = false,
  dataDesabilitada = false,
}: Props) {
  const idTags = useId()
  const sessao = useSessao().data
  const hoje = sessao?.hoje
  const inputData = useRef<HTMLInputElement>(null)
  const ehTransferencia = tipo === 'transferencia'
  // "Mais detalhes" abre sozinho se já há tags ou observação (edição) ou se elas têm erro.
  const [detalhesAbertos, setDetalhesAbertos] = useState(
    () => valores.tag_ids.length > 0 || valores.observacao !== '',
  )
  const erroDetalhes = Boolean(erros.tag_ids || erros.observacao || erros.recorrencia)
  const mostrarDetalhes = detalhesAbertos || erroDetalhes || forcarDetalhes

  const contas = useQuery({
    queryKey: ['contas'],
    queryFn: async () => (await listarContas()).contas,
  })
  const categorias = useQuery({
    queryKey: ['categorias', tipo, 'com-arquivadas'],
    queryFn: ehTransferencia
      ? skipToken
      : () => listarCategorias({ tipo, incluir_arquivadas: true }),
  })
  const tags = useQuery({ queryKey: ['tags'], queryFn: listarTags })

  const listaContas = contas.data

  // Conta preenchida pelo dono quando ainda não há conta (abertura do formulário). Não se aplica à transferência.
  useEffect(() => {
    if (ehTransferencia || ocultarDonoConta) return
    const id = contaDoDono(listaContas, valores.dono_usuario_id)
    if (valores.conta_id === null && id !== null) aoMudar({ conta_id: id })
  }, [ehTransferencia, ocultarDonoConta, listaContas, valores.conta_id, valores.dono_usuario_id, aoMudar])

  function mudarDono(valor: string) {
    const dono = valor === 'casal' ? null : Number(valor)
    aoMudar({ dono_usuario_id: dono, conta_id: contaDoDono(listaContas, dono) })
  }

  function escolherData(data: string | undefined) {
    if (data) aoMudar({ data })
  }

  const contasDoDono = (listaContas ?? []).filter(
    (c) => !c.arquivado && c.dono_usuario_id === valores.dono_usuario_id,
  )
  // Transferência: contas ativas, sem vínculo com o dono.
  const contasAtivas = (listaContas ?? []).filter((c) => !c.arquivado)
  const rotuloSituacao = {
    despesa: 'Foi paga',
    receita: 'Foi recebida',
    transferencia: 'Foi realizada',
  }[tipo]

  return (
    <div className={css.campos}>
      <Campo rotulo="Valor" erro={erros.valor}>
        <input
          className={css.controle}
          type="text"
          inputMode="numeric"
          placeholder="0,00"
          disabled={valorDesabilitado}
          value={valores.valor}
          onChange={(e) => aoMudar({ valor: mascararEntrada(e.target.value) })}
        />
      </Campo>

      <div className={css.atalhos} role="group" aria-label="Atalhos de data">
        <button
          type="button"
          className={css.atalho}
          disabled={dataDesabilitada || !hoje}
          aria-pressed={hoje !== undefined && valores.data === hoje}
          onClick={() => escolherData(hoje)}
        >
          Hoje
        </button>
        <button
          type="button"
          className={css.atalho}
          disabled={dataDesabilitada || !hoje}
          aria-pressed={hoje !== undefined && valores.data === diaAnterior(hoje)}
          onClick={() => escolherData(hoje && diaAnterior(hoje))}
        >
          Ontem
        </button>
        <button
          type="button"
          className={css.atalho}
          disabled={dataDesabilitada}
          onClick={() => inputData.current?.focus()}
        >
          Outra data
        </button>
      </div>
      <Campo
        rotulo="Data"
        erro={erros.data}
        ajuda={dataDesabilitada ? "A data só muda em 'Somente esta'" : undefined}
      >
        <input
          ref={inputData}
          className={css.controle}
          type="date"
          disabled={dataDesabilitada}
          value={valores.data}
          onChange={(e) => aoMudar({ data: e.target.value })}
        />
      </Campo>

      {!ehTransferencia && (
        <Campo rotulo="Descrição" erro={erros.descricao}>
          <input
            className={css.controle}
            type="text"
            value={valores.descricao}
            onChange={(e) => aoMudar({ descricao: e.target.value })}
          />
        </Campo>
      )}

      {!ehTransferencia && (
        <Campo rotulo="Categoria" erro={erros.categoria_id}>
          <select
            className={css.controle}
            value={valores.categoria_id ?? ''}
            onChange={(e) =>
              aoMudar({ categoria_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Escolha uma categoria</option>
            {opcoesCategoria(categorias.data ?? [], valores.categoria_id).map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {!ehTransferencia && !ocultarDonoConta && (
        <Campo rotulo="Dono" erro={erros.dono_usuario_id}>
          <select
            className={css.controle}
            value={valores.dono_usuario_id === null ? 'casal' : String(valores.dono_usuario_id)}
            onChange={(e) => mudarDono(e.target.value)}
          >
            {sessao && <option value={String(sessao.usuario.id)}>{sessao.usuario.nome}</option>}
            {sessao?.casal && <option value="casal">Casal</option>}
            {sessao?.casal && (
              <option value={String(sessao.casal.parceiro.id)}>
                {sessao.casal.parceiro.nome}
              </option>
            )}
          </select>
        </Campo>
      )}

      {ehTransferencia ? (
        <>
          <Campo rotulo="Conta de origem" erro={erros.conta_id}>
            <select
              className={css.controle}
              value={valores.conta_id ?? ''}
              onChange={(e) =>
                aoMudar({ conta_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">Escolha uma conta</option>
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Conta de destino" erro={erros.conta_destino_id}>
            <select
              className={css.controle}
              value={valores.conta_destino_id ?? ''}
              onChange={(e) =>
                aoMudar({ conta_destino_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">Escolha uma conta</option>
              {contasAtivas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </>
      ) : (
        !ocultarDonoConta && (
          <Campo rotulo="Conta" erro={erros.conta_id} ajuda="A conta segue o dono">
            <select
              className={css.controle}
              value={valores.conta_id ?? ''}
              disabled
            >
              {contasDoDono.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        )
      )}

      {camposEssenciais}

      <button
        type="button"
        className={css.atalho}
        aria-expanded={mostrarDetalhes}
        // Com erro (tags, observação, recorrência) ou com recorrência ligada, o bloco fica aberto.
        disabled={erroDetalhes || forcarDetalhes}
        onClick={() => setDetalhesAbertos(!mostrarDetalhes)}
      >
        Mais detalhes
      </button>

      {mostrarDetalhes && (
        <div className={css.campos}>
          <fieldset
            className={css.grupo}
            aria-describedby={erros.tag_ids ? `${idTags}-erro` : undefined}
          >
            <legend className={css.rotulo}>Tags</legend>
            <div className={css.tags}>
              {(tags.data ?? []).map((t, indice) => {
                const marcada = valores.tag_ids.includes(t.id)
                return (
                  <label key={t.id} className={css.opcao}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      // Erro de tags leva o foco ao primeiro checkbox.
                      aria-invalid={erros.tag_ids && indice === 0 ? true : undefined}
                      onChange={() =>
                        aoMudar({
                          tag_ids: marcada
                            ? valores.tag_ids.filter((id) => id !== t.id)
                            : [...valores.tag_ids, t.id],
                        })
                      }
                    />
                    {t.nome}
                  </label>
                )
              })}
            </div>
            {erros.tag_ids && (
              <p id={`${idTags}-erro`} className={css.erro}>
                {erros.tag_ids}
              </p>
            )}
          </fieldset>

          <Campo rotulo="Observação" erro={erros.observacao}>
            <textarea
              className={css.controle}
              value={valores.observacao}
              onChange={(e) => aoMudar({ observacao: e.target.value })}
            />
          </Campo>

          {detalhesExtras}
        </div>
      )}

      {!ocultarSituacao && (
        <label className={css.opcao}>
          <input
            type="checkbox"
            checked={valores.situacao === 'confirmada'}
            onChange={(e) =>
              aoMudar({ situacao: e.target.checked ? 'confirmada' : 'prevista' })
            }
          />
          {rotuloSituacao}
        </label>
      )}
    </div>
  )
}
