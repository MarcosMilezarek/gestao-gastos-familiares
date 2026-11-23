import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-16 font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:bg-disabled disabled:bg-none disabled:text-disabled-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-gradiente-botao text-primary-foreground shadow-roxa',
        secondary: 'border bg-card text-primary-texto',
        outline: 'border-2 border-primary bg-transparent text-primary-texto',
        ghost: 'bg-transparent text-primary-texto hover:bg-primary-suave',
        destructive: 'bg-destructive text-destructive-foreground',
        link: 'rounded-none text-primary-texto underline underline-offset-4',
      },
      size: {
        sm: 'h-11 px-5 text-14',
        default: 'h-13 px-6',
        lg: 'h-14 px-8',
        icon: "size-11 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
