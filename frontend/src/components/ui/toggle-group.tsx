import { Check } from 'lucide-react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'group inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-input bg-card px-4 text-14 font-medium whitespace-nowrap text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <Check
        aria-hidden="true"
        className="hidden size-4 group-data-[state=on]:block"
      />
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
