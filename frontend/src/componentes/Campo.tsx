import { cloneElement, useId, type ReactElement } from 'react'
import { Label } from '@/components/ui/label'

type ControleAcessivel = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

type CampoProps = {
  rotulo: string
  erro?: string
  ajuda?: string
  children: ReactElement<ControleAcessivel>
}

// Liga o rótulo e a mensagem ao controle (filho): usa o id do filho ou o gerado aqui.
export function Campo({ rotulo, erro, ajuda, children }: CampoProps) {
  const gerado = useId()
  const id = children.props.id ?? gerado
  const mensagemId = `${id}-mensagem`
  const mensagem = erro || ajuda
  const descritores =
    [children.props['aria-describedby'], mensagem ? mensagemId : undefined]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {cloneElement(children, {
        id,
        'aria-describedby': descritores,
        'aria-invalid': erro ? true : children.props['aria-invalid'],
      })}
      {mensagem && (
        <p
          id={mensagemId}
          className={erro ? 'text-14 text-saida-texto' : 'text-14 text-muted-foreground'}
        >
          {mensagem}
        </p>
      )}
    </div>
  )
}
