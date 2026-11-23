import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { ApiError } from '../../api/cliente'
import { listarCategorias, type CategoriaSaida } from '../../api/categorias'
import { type CategoriaEntrada, type OrcamentoSaida } from '../../api/orcamentos'
import { Campo } from '../../componentes/Campo'
import { TituloBloco } from '../../componentes/TituloBloco'
import { eZero, formatarBRL, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// Estado do passo 2, guardado pelo assistente. `texto` é o campo mascarado ("1.234,56"); "" = vazio.
// Entrada só existe para categoria listada: marcada (entra no orçamento) ou não.
export type SubLimite = { categoria_id: number; texto: string }
export type LinhaLimite = {
  categoria_id: number
  marcada: boolean
  texto: string
  subcategorias: SubLimite[]
}
export type LimitesValor = LinhaLimite[]

type LimitesCategoriasProps = {
  valor: LimitesValor
  previa: OrcamentoSaida | null
  onMudar: (valor: LimitesValor) => void
}

type Subcategoria = CategoriaSaida['subcategorias'][number]

function linhaDe(valor: LimitesValor, categoria_id: number): LinhaLimite {
  return (
    valor.find((linha) => linha.categoria_id === categoria_id) ?? {
      categoria_id,
      marcada: false,
      texto: '',
      subcategorias: [],
    }
  )
}

function gravarLinha(valor: LimitesValor, linha: LinhaLimite): LimitesValor {
  return valor.some((atual) => atual.categoria_id === linha.categoria_id)
    ? valor.map((atual) => (atual.categoria_id === linha.categoria_id ? linha : atual))
    : [...valor, linha]
}

function gravarSub(subs: SubLimite[], categoria_id: number, texto: string): SubLimite[] {
  return subs.some((sub) => sub.categoria_id === categoria_id)
    ? subs.map((sub) => (sub.categoria_id === categoria_id ? { ...sub, texto } : sub))
    : [...subs, { categoria_id, texto }]
}

// Dígitos entram da direita; apagar tudo deixa o campo vazio. Zero digitado fica "0,00", não vazio.
// Apagar a partir de "0,00" (menos de 3 dígitos restantes) também esvazia, para a categoria voltar a ter limite.
function textoDigitado(bruto: string, anterior: string): string {
  const digitos = bruto.replace(/\D/g, '')
  if (digitos === '') return ''
  if (anterior === '0,00' && digitos.length < 3) return ''
  return mascararEntrada(digitos)
}

// Corpo `categorias` de OrcamentoEntrada (`fatia-7.md` §5.1): só as marcadas. Com subcategoria
// preenchida vai com `subcategorias` (as vazias não vão); senão vai com `limite`, "0.00" se vazio.
export function montarCategoriasCorpo(valor: LimitesValor): CategoriaEntrada[] {
  return valor
    .filter((linha) => linha.marcada)
    .map((linha): CategoriaEntrada => {
      const preenchidas = linha.subcategorias.filter((sub) => sub.texto !== '')
      if (preenchidas.length > 0) {
        return {
          categoria_id: linha.categoria_id,
          subcategorias: preenchidas.map((sub) => ({
            categoria_id: sub.categoria_id,
            limite: paraApi(sub.texto),
          })),
        }
      }
      return {
        categoria_id: linha.categoria_id,
        limite: linha.texto === '' ? '0.00' : paraApi(linha.texto),
      }
    })
}

type BlocoProps = {
  mae: CategoriaSaida
  linha: LinhaLimite
  previa: OrcamentoSaida | null
  aoMudar: (linha: LinhaLimite) => void
}

// Uma categoria marcada: campo próprio, ou o total da prévia quando alguma subcategoria tem limite.
function BlocoCategoria({ mae, linha, previa, aoMudar }: BlocoProps) {
  const subs = mae.subcategorias.filter(
    (sub) => !sub.arquivado || linha.subcategorias.some((s) => s.categoria_id === sub.id),
  )
  const comSubcategorias = linha.subcategorias.some((sub) => sub.texto !== '')
  const totalPrevia = previa?.categorias.find((c) => c.categoria_id === mae.id)?.limite
  const textoDe = (sub: Subcategoria) =>
    linha.subcategorias.find((s) => s.categoria_id === sub.id)?.texto ?? ''

  return (
    <Card className="gap-3 p-4">
      <h3 className="text-16 font-semibold">
        {mae.nome}
        {mae.arquivado && <span className="text-14 font-normal text-muted-foreground"> (arquivada)</span>}
      </h3>

      {comSubcategorias ? (
        <p className="text-14 tabular-nums">
          Total das subcategorias: {totalPrevia !== undefined ? formatarBRL(totalPrevia) : '—'}
        </p>
      ) : (
        <Campo rotulo={`Limite de ${mae.nome}`}>
          <Input
            inputMode="numeric"
            placeholder="0,00"
            value={linha.texto}
            onChange={(e) =>
              aoMudar({ ...linha, texto: textoDigitado(e.target.value, linha.texto) })
            }
          />
        </Campo>
      )}

      {subs.map((sub) => (
        <Campo
          key={sub.id}
          rotulo={`Limite de ${sub.nome}${sub.arquivado ? ' (arquivada)' : ''}`}
        >
          <Input
            inputMode="numeric"
            placeholder="0,00"
            value={textoDe(sub)}
            onChange={(e) =>
              aoMudar({
                ...linha,
                subcategorias: gravarSub(
                  linha.subcategorias,
                  sub.id,
                  textoDigitado(e.target.value, textoDe(sub)),
                ),
              })
            }
          />
        </Campo>
      ))}
    </Card>
  )
}

// Passo 2 do assistente: limites por categoria de despesa e por subcategoria. Não grava nada no
// servidor; o estado sobe por `onMudar` e os totais vêm da prévia (`previa`), sem soma no cliente.
export function LimitesCategorias({ valor, previa, onMudar }: LimitesCategoriasProps) {
  const [gerenciando, setGerenciando] = useState(false)

  // Traz as arquivadas para listar só as que já estão no orçamento (têm entrada em `valor`).
  const consulta = useQuery({
    queryKey: ['categorias', { tipo: 'despesa', incluir_arquivadas: true }],
    queryFn: () => listarCategorias({ tipo: 'despesa', incluir_arquivadas: true }),
  })
  const maes = (consulta.data ?? []).filter(
    (mae) => !mae.arquivado || valor.some((linha) => linha.categoria_id === mae.id),
  )
  const marcadas = maes.filter((mae) => linhaDe(valor, mae.id).marcada)

  return (
    <section className="flex flex-col gap-3">
      <TituloBloco titulo="Limites por categoria" />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={gerenciando}
        onClick={() => setGerenciando((aberto) => !aberto)}
      >
        Gerenciar categorias
      </Button>

      {gerenciando && (
        <fieldset className="flex flex-col gap-1 rounded-xl border bg-card p-3">
          <legend className="text-14 font-medium">Categorias que entram no orçamento</legend>
          {maes.map((mae) => {
            const linha = linhaDe(valor, mae.id)
            return (
              <label key={mae.id} className="flex min-h-11 items-center gap-3 text-16">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 accent-primary"
                  checked={linha.marcada}
                  onChange={() => onMudar(gravarLinha(valor, { ...linha, marcada: !linha.marcada }))}
                />
                <span>
                  {mae.nome}
                  {mae.arquivado && ' (arquivada)'}
                </span>
              </label>
            )
          })}
        </fieldset>
      )}

      {consulta.isPending && <p className="text-14 text-muted-foreground">Carregando categorias…</p>}
      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Não foi possível carregar as categorias.'}
        </p>
      )}
      {consulta.isSuccess && marcadas.length === 0 && (
        <p className="text-14 text-muted-foreground">
          Nenhuma categoria marcada. Use “Gerenciar categorias” para escolher quais entram.
        </p>
      )}

      {marcadas.map((mae) => (
        <BlocoCategoria
          key={mae.id}
          mae={mae}
          linha={linhaDe(valor, mae.id)}
          previa={previa}
          aoMudar={(nova) => onMudar(gravarLinha(valor, nova))}
        />
      ))}

      {previa && (
        <Card className="gap-1 p-4 tabular-nums" aria-live="polite">
          <p className="text-14">
            Total categorizado: {formatarBRL(previa.total_categorizado)}
          </p>
          <p className="text-14">
            Falta distribuir: {formatarBRL(previa.falta_distribuir)}
          </p>
          {eZero(previa.excedente) ? (
            <p className="text-14">Excedente: {formatarBRL(previa.excedente)}</p>
          ) : (
            <p className="flex items-center gap-1 text-14 font-semibold text-alerta-texto">
              <TriangleAlert aria-hidden="true" className="size-4" />
              Excedente: {formatarBRL(previa.excedente)}
            </p>
          )}
        </Card>
      )}
    </section>
  )
}
