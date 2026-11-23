import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Avatar as AvatarPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden rounded-full',
  {
    variants: {
      tamanho: {
        sm: 'size-8 text-11',
        default: 'size-10 text-14',
        lg: 'size-14 text-18',
      },
    },
    defaultVariants: {
      tamanho: 'default',
    },
  },
)

const avatarFallbackVariants = cva(
  'flex size-full items-center justify-center rounded-full font-semibold',
  {
    variants: {
      tom: {
        primary: 'bg-primary-suave text-primary-texto',
        entrada: 'bg-entrada-suave text-entrada-texto',
        info: 'bg-info-suave text-info-texto',
        alerta: 'bg-alerta-suave text-alerta-texto',
      },
    },
    defaultVariants: {
      tom: 'primary',
    },
  },
)

function Avatar({
  className,
  tamanho,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> &
  VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(avatarVariants({ tamanho }), className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  tom,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> &
  VariantProps<typeof avatarFallbackVariants>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(avatarFallbackVariants({ tom }), className)}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback }
