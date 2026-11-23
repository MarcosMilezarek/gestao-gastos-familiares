import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import {
  obterRelatorioCategorias,
  obterRelatorioConta,
  obterRelatorioDono,
} from '../../api/relatorios'
import type { RelatorioCategorias } from '../../api/relatorios'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { Dinheiro } from '../../componentes/Dinheiro'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { GraficoRosca } from '../../componentes/GraficoRosca'
import { SeletorMes } from '../../componentes/SeletorMes'
import { TituloBloco } from '../../componentes/TituloBloco'
import { eZero } from '../../formatacao/dinheiro'
import { formatarPercentual } from '../../formatacao/percentual'
import { useMes } from '../../hooks/useMes'

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
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
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
    return (
      <Card>
        <EstadoVazio frase="Sem despesas neste mês." compacto />
      </Card>
    )
  }

  return (
    <Card>
      <p className="text-14 text-muted-foreground">
        Total <Dinheiro valor={total} />
      </p>
      <GraficoRosca itens={itens} rotulo={rotulo} />
    </Card>
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
        <Card>
          <TituloBloco titulo="Subcategorias" />
          {comSubcategorias.map((categoria) => (
            <div key={chaveCategoria(categoria.categoria_id)} className="flex flex-col gap-1">
              <h3 className="text-14 font-semibold">{categoria.nome}</h3>
              <ul className="flex flex-col">
                {categoria.subcategorias.map((subcategoria) => (
                  <li
                    key={subcategoria.categoria_id}
                    className="flex min-h-11 items-center justify-between gap-2 border-t text-14 first:border-t-0"
                  >
                    <span className="min-w-0 flex-1 truncate">{subcategoria.nome}</span>
                    <Dinheiro valor={subcategoria.valor} />
                    <span className="w-14 text-right tabular-nums text-muted-foreground">
                      {formatarPercentual(subcategoria.porcentagem)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
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
    <div className="flex flex-col gap-4">
      <SeletorMes mes={mes} onMudar={setMes} />
      <CabecalhoTela titulo={TITULOS[tipo]} voltarPara={`/controle/relatorios?mes=${mes}`} />

      {consulta.isError && (
        <p role="alert" className="text-14 text-saida-texto">
          {consulta.error instanceof ApiError
            ? consulta.error.mensagem
            : 'Erro inesperado. Tente novamente.'}
        </p>
      )}
      {!consulta.data && !consulta.isError && <p className="text-14 text-muted-foreground">Carregando…</p>}

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
