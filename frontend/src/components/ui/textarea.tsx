import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { campoClasses } from './input'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(campoClasses, 'min-h-24 py-3', className)}
      {...props}
    />
  )
}

export { Textarea }
