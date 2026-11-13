import { cloneElement, useId, type ReactElement } from 'react'
import css from './formato.module.css'

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
    <div className={css.campo}>
      <label className={css.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': descritores,
        'aria-invalid': erro ? true : children.props['aria-invalid'],
      })}
      {mensagem && (
        <p id={mensagemId} className={erro ? css.erro : css.ajuda}>
          {mensagem}
        </p>
      )}
    </div>
  )
}
