import type { ReactNode } from 'react'
import { BackButton } from './BackButton'

interface PageHeaderProps {
  title: string
  onBack?: () => void
  rightSlot?: ReactNode
  titleSlot?: ReactNode
  className?: string
}

export function PageHeader({ title, onBack, rightSlot, titleSlot, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && <BackButton onClick={onBack} />}
        <h2 className="text-lg font-bold text-white truncate">{title}</h2>
        {titleSlot}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  )
}
