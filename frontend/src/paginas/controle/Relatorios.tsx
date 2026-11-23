import { ChartColumn, ChartPie, ChevronRight, Percent, User, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { CabecalhoTela } from '../../componentes/CabecalhoTela'
import { EstadoVazio } from '../../componentes/EstadoVazio'
import { IconeQuadrado } from '../../componentes/IconeQuadrado'
import { SeletorMes } from '../../componentes/SeletorMes'
import { VisoesControle } from '../../componentes/VisoesControle'
import { useMes } from '../../hooks/useMes'
import { RelatorioBalanco } from './RelatorioBalanco'
import { RelatorioDespesas } from './RelatorioDespesas'
import { RelatorioProporcao } from './RelatorioProporcao'

const RELATORIOS: { tipo: string; rotulo: string; icone: LucideIcon }[] = [
  { tipo: 'categorias', rotulo: 'Despesas por categoria', icone: ChartPie },
  { tipo: 'donos', rotulo: 'Despesas por dono', icone: User },
  { tipo: 'contas', rotulo: 'Despesas por conta', icone: Wallet },
  { tipo: 'balanco', rotulo: 'Balanço mensal', icone: ChartColumn },
  { tipo: 'proporcao', rotulo: 'Proporção e aporte', icone: Percent },
]

export function Relatorios() {
  const { mes, setMes } = useMes()

  return (
    <div className="flex flex-col gap-4 p-4">
      <SeletorMes mes={mes} onMudar={setMes} />
      <CabecalhoTela titulo="Relatórios" />
      <VisoesControle mes={mes} />
      <Card className="gap-0 p-2">
        <nav aria-label="Relatórios" className="flex flex-col">
          {RELATORIOS.map(({ tipo, rotulo, icone }) => (
            <Link
              key={tipo}
              to={`/controle/relatorios/${tipo}?mes=${mes}`}
              className="flex min-h-16 items-center gap-3 rounded-lg px-2 text-16 font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <IconeQuadrado icone={icone} />
              <span className="min-w-0 flex-1">{rotulo}</span>
              <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
            </Link>
          ))}
        </nav>
      </Card>
    </div>
  )
}

export function RelatorioPorTipo() {
  const { tipo = '' } = useParams()
  const { mes } = useMes()

  if (tipo === 'categorias' || tipo === 'donos' || tipo === 'contas') {
    return <RelatorioDespesas tipo={tipo} />
  }

  if (tipo === 'balanco') {
    return <RelatorioBalanco />
  }

  if (tipo === 'proporcao') {
    return <RelatorioProporcao />
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <CabecalhoTela titulo="Relatórios" voltarPara={`/controle/relatorios?mes=${mes}`} />
      <Card>
        <EstadoVazio frase="Relatório não encontrado." compacto />
      </Card>
    </div>
  )
}
