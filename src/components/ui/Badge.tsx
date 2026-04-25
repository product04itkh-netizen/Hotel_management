import { cn, getStatusBadgeClass, capitalize } from '@/lib/utils'

interface BadgeProps {
  status: string
  label?: string
  className?: string
}

export function Badge({ status, label, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        getStatusBadgeClass(status),
        className
      )}
    >
      {label ?? capitalize(status)}
    </span>
  )
}
