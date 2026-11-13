import { Link, useParams } from 'react-router'
import estado from '../../componentes/estado.module.css'
import { useMes } from '../../hooks/useMes'
import { RelatorioBalanco } from './RelatorioBalanco'
import { RelatorioDespesas } from './RelatorioDespesas'
import { RelatorioProporcao } from './RelatorioProporcao'
import styles from './relatorios.module.css'

const RELATORIOS = [
  { tipo: 'categorias', rotulo: 'Despesas por categoria' },
  { tipo: 'donos', rotulo: 'Despesas por dono' },
  { tipo: 'contas', rotulo: 'Despesas por conta' },
  { tipo: 'balanco', rotulo: 'Balanço mensal' },
  { tipo: 'proporcao', rotulo: 'Proporção e aporte' },
]

export function Relatorios() {
  const { mes } = useMes()

  return (
    <div className={styles.pagina}>
      <Link to={`/controle?mes=${mes}`} className={estado.voltar}>
        Controle
      </Link>
      <h1 className={styles.titulo}>Relatórios</h1>
      <nav className={styles.menu}>
        {RELATORIOS.map((relatorio) => (
          <Link
            key={relatorio.tipo}
            to={`/controle/relatorios/${relatorio.tipo}?mes=${mes}`}
            className={styles.opcao}
          >
            {relatorio.rotulo}
          </Link>
        ))}
      </nav>
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
    <div className={styles.pagina}>
      <Link to={`/controle/relatorios?mes=${mes}`} className={estado.voltar}>
        Relatórios
      </Link>
      <div className={estado.vazio}>
        <p className={estado.frase}>Relatório não encontrado.</p>
      </div>
    </div>
  )
}
