import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import {
  obterRelatorioCategorias,
  obterRelatorioConta,
  obterRelatorioDono,
} from '../../api/relatorios'
import type { RelatorioCategorias } from '../../api/relatorios'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { GraficoRosca } from '../../componentes/GraficoRosca'
import estado from '../../componentes/estado.module.css'
import { SeletorMes } from '../../componentes/SeletorMes'
import { eZero } from '../../formatacao/dinheiro'
import { formatarPercentual } from '../../formatacao/percentual'
import { useMes } from '../../hooks/useMes'
import styles from './relatorios.module.css'

export type TipoDespesa = 'categorias' | 'donos' | 'contas'

const TITULOS: Record<TipoDespesa, string> = {
  categorias: 'Despesas por categoria',
  donos: 'Despesas por dono',
  contas: 'Despesas por conta',
}

type ItemRelatorio = {
  chave: string
  nome: string
  valor: string
  porcentagem: string
  cor: string | null
}

// Donos e contas não têm cor própria: recebem a paleta por posição, repetida com módulo.
const PALETA = [
  'var(--cor-primaria)',
  'var(--cor-alerta)',
  'var(--cor-entrada)',
  'var(--cor-saida)',
  'var(--cor-texto-suave)',
]

// Categoria de ajuste de fatura (categoria_id null) tem chave própria no gráfico.
function chaveCategoria(categoriaId: number | null): string {
  return categoriaId === null ? 'reajuste-fatura' : String(categoriaId)
}

function CorpoGrafico({
  total,
  itens,
  rotulo,
}: {
  total: string
  itens: ItemRelatorio[]
  rotulo: string
}) {
  if (itens.length === 0 || eZero(total)) {
    return <EstadoVazio frase="Sem despesas neste mês." />
  }

  return (
    <>
      <p className={styles.total}>
        Total <Dinheiro valor={total} />
      </p>
      <GraficoRosca itens={itens} rotulo={rotulo} />
    </>
  )
}

function CorpoCategorias({ dados }: { dados: RelatorioCategorias }) {
  const itens = dados.categorias.map((categoria) => ({
    chave: chaveCategoria(categoria.categoria_id),
    nome: categoria.nome,
    valor: categoria.valor,
    porcentagem: categoria.porcentagem,
    cor: categoria.cor,
  }))
  const comSubcategorias = dados.categorias.filter((categoria) => categoria.subcategorias.length > 0)

  return (
    <>
      <CorpoGrafico total={dados.total} itens={itens} rotulo="Distribuição por categoria" />
      {!eZero(dados.total) && comSubcategorias.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.nome}>Subcategorias</h2>
          {comSubcategorias.map((categoria) => (
            <div key={chaveCategoria(categoria.categoria_id)} className={styles.grupo}>
              <h3 className={styles.subtitulo}>{categoria.nome}</h3>
              <ul className={styles.lista}>
                {categoria.subcategorias.map((subcategoria) => (
                  <li key={subcategoria.categoria_id} className={styles.linha}>
                    <span>{subcategoria.nome}</span>
                    <Dinheiro valor={subcategoria.valor} />
                    <span className={styles.porcentagem}>
                      {formatarPercentual(subcategoria.porcentagem)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

export function RelatorioDespesas({ tipo }: { tipo: TipoDespesa }) {
  const { mes, setMes } = useMes()

  const categorias = useQuery({
    queryKey: ['relatorio-categorias', mes],
    queryFn: () => obterRelatorioCategorias(mes),
    enabled: tipo === 'categorias' && mes !== '',
    // Erro 4xx é determinístico: não repete.
    retry: repetirSem4xx,
  })
  const donos = useQuery({
    queryKey: ['relatorio-donos', mes],
    queryFn: () => obterRelatorioDono(mes),
    enabled: tipo === 'donos' && mes !== '',
    retry: repetirSem4xx,
  })
  const contas = useQuery({
    queryKey: ['relatorio-contas', mes],
    queryFn: () => obterRelatorioConta(mes),
    enabled: tipo === 'contas' && mes !== '',
    retry: repetirSem4xx,
  })

  const consulta = tipo === 'categorias' ? categorias : tipo === 'donos' ? donos : contas

  return (
    <div className={styles.pagina}>
      <SeletorMes mes={mes} onMudar={setMes} />
      <Link to={`/controle/relatorios?mes=${mes}`} className={estado.voltar}>
        Relatórios
      </Link>
      <h1 className={styles.titulo}>{TITULOS[tipo]}</h1>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!consulta.data && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}

      {tipo === 'categorias' && categorias.data && <CorpoCategorias dados={categorias.data} />}
      {tipo === 'donos' && donos.data && (
        <CorpoGrafico
          total={donos.data.total}
          rotulo="Distribuição por dono"
          itens={donos.data.itens.map((item, indice) => ({
            chave: item.dono_usuario_id === null ? 'casal' : String(item.dono_usuario_id),
            nome: item.nome,
            valor: item.valor,
            porcentagem: item.porcentagem,
            cor: PALETA[indice % PALETA.length] ?? null,
          }))}
        />
      )}
      {tipo === 'contas' && contas.data && (
        <CorpoGrafico
          total={contas.data.total}
          rotulo="Distribuição por conta"
          itens={contas.data.itens.map((item, indice) => ({
            chave: String(item.conta_id),
            nome: item.nome,
            valor: item.valor,
            porcentagem: item.porcentagem,
            cor: PALETA[indice % PALETA.length] ?? null,
          }))}
        />
      )}
    </div>
  )
}
