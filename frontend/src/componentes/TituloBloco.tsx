import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

type Props = {
  titulo: string
  acaoRotulo?: string
  acaoPara?: string
  onAcao?: () => void
}

const classesAcao =
  'inline-flex h-11 items-center gap-1 rounded-full text-14 font-semibold text-primary-texto outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function TituloBloco({ titulo, acaoRotulo, acaoPara, onAcao }: Props) {
  const conteudo = (
    <>
      {acaoRotulo}
      <ArrowRight aria-hidden="true" className="size-4" />
    </>
  )

  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <h2 className="text-16 font-semibold">{titulo}</h2>
      {acaoPara !== undefined ? (
        <Link to={acaoPara} className={classesAcao}>
          {conteudo}
        </Link>
      ) : onAcao !== undefined ? (
        <button type="button" onClick={onAcao} className={classesAcao}>
          {conteudo}
        </button>
      ) : null}
    </div>
  )
}
