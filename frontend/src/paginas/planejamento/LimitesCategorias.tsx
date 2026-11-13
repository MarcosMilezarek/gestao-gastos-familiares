import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/cliente'
import { listarCategorias, type CategoriaSaida } from '../../api/categorias'
import { type CategoriaEntrada, type OrcamentoSaida } from '../../api/orcamentos'
import { Campo } from '../../componentes/Campo'
import { eZero, formatarBRL, mascararEntrada, paraApi } from '../../formatacao/dinheiro'
import styles from './assistente.module.css'

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
    <section className={styles.cartao}>
      <h3 className={styles.nome}>
        {mae.nome}
        {mae.arquivado && <span className={styles.tag}> (arquivada)</span>}
      </h3>

      {comSubcategorias ? (
        <p className={styles.total}>
          Total das subcategorias: {totalPrevia !== undefined ? formatarBRL(totalPrevia) : '—'}
        </p>
      ) : (
        <Campo rotulo={`Limite de ${mae.nome}`}>
          <input
            className={styles.campo}
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
          <input
            className={styles.campo}
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
    </section>
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
    <section className={styles.bloco}>
      <h2 className={styles.subtitulo}>Limites por categoria</h2>

      <button
        type="button"
        className={styles.botao}
        aria-expanded={gerenciando}
        onClick={() => setGerenciando((aberto) => !aberto)}
      >
        Gerenciar categorias
      </button>

      {gerenciando && (
        <fieldset className={styles.gerenciar}>
          <legend className={styles.rotulo}>Categorias que entram no orçamento</legend>
          {maes.map((mae) => {
            const linha = linhaDe(valor, mae.id)
            return (
              <label key={mae.id} className={styles.opcao}>
                <input
                  type="checkbox"
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

      {consulta.isPending && <p className={styles.aviso}>Carregando categorias…</p>}
      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Não foi possível carregar as categorias.'}
        </p>
      )}
      {consulta.isSuccess && marcadas.length === 0 && (
        <p className={styles.aviso}>
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
        <div className={styles.resumo} aria-live="polite">
          <p className={styles.linhaResumo}>
            Total categorizado: {formatarBRL(previa.total_categorizado)}
          </p>
          <p className={styles.linhaResumo}>
            Falta distribuir: {formatarBRL(previa.falta_distribuir)}
          </p>
          <p className={eZero(previa.excedente) ? styles.linhaResumo : styles.alerta}>
            Excedente: {formatarBRL(previa.excedente)}
          </p>
        </div>
      )}
    </section>
  )
}
