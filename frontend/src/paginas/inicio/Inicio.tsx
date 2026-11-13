import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Settings } from 'lucide-react'
import { ApiError, repetirSem4xx } from '../../api/cliente'
import { obterInicio } from '../../api/inicio'
import { BlocosAnalise } from './BlocosAnalise'
import { BlocosResumo } from './BlocosResumo'
import styles from './inicio.module.css'

// Início (RF-5.14): sem seletor de mês; os blocos aparecem sempre na mesma ordem.
export function Inicio() {
  const consulta = useQuery({
    queryKey: ['inicio'],
    queryFn: obterInicio,
    retry: repetirSem4xx,
  })
  const erroConsulta =
    consulta.error instanceof ApiError ? consulta.error.mensagem : 'Erro inesperado. Tente novamente.'

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalho}>
        <h1 className={styles.titulo}>Início</h1>
        <Link to="/configuracoes" className={styles.engrenagem} aria-label="Configurações">
          <Settings aria-hidden="true" />
        </Link>
      </header>

      {consulta.isError && (
        <p role="alert" className={styles.erro}>
          {erroConsulta}
        </p>
      )}
      {!consulta.data && !consulta.isError && <p className={styles.aviso}>Carregando…</p>}
      {consulta.data && <BlocosResumo inicio={consulta.data} />}
      {consulta.data && <BlocosAnalise inicio={consulta.data} />}
    </div>
  )
}
