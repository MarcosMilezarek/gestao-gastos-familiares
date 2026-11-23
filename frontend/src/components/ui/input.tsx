import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export const campoClasses =
  'min-h-12 w-full rounded-lg border border-input bg-card px-4 text-16 text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-foco aria-invalid:border-saida aria-invalid:shadow-foco-erro disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground'

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(campoClasses, 'tabular-nums', className)}
      {...props}
    />
  )
}

export { Input }
