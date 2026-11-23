import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Progress as ProgressPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const progressVariants = cva(
  'relative h-2 w-full overflow-hidden rounded-full',
  {
    variants: {
      tom: {
        primary: 'bg-primary-suave',
        entrada: 'bg-entrada-suave',
        alerta: 'bg-alerta-suave',
        info: 'bg-info-suave',
        saida: 'bg-saida-suave',
      },
    },
    defaultVariants: {
      tom: 'primary',
    },
  },
)

const indicatorVariants = cva('h-full w-full flex-1 transition-transform', {
  variants: {
    tom: {
      primary: 'bg-primary',
      entrada: 'bg-entrada',
      alerta: 'bg-alerta',
      info: 'bg-info',
      saida: 'bg-saida',
    },
  },
  defaultVariants: {
    tom: 'primary',
  },
})

function Progress({
  className,
  tom,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressVariants>) {
  const limitado = Math.min(100, Math.max(0, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={limitado}
      className={cn(progressVariants({ tom }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={indicatorVariants({ tom })}
        style={{ transform: `translateX(-${100 - limitado}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
