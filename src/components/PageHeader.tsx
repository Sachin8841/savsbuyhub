import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Consistent page header used across all admin pages.
 * Provides a gradient title, optional subtitle, icon badge, and action slot.
 */
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 pb-1', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 dark:from-indigo-500/30 dark:to-emerald-500/30 flex items-center justify-center flex-shrink-0 border border-indigo-200/50 dark:border-indigo-800/50">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight gradient-text truncate">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'primary' | 'emerald' | 'amber' | 'red' | 'slate';
  className?: string;
}

const colorMap = {
  primary: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', icon: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-100 dark:bg-indigo-900/50', value: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-100 dark:border-indigo-900/50' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', icon: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', value: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-100 dark:border-emerald-900/50' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/40',   icon: 'text-amber-600 dark:text-amber-400',   iconBg: 'bg-amber-100 dark:bg-amber-900/50',   value: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-100 dark:border-amber-900/50' },
  red:     { bg: 'bg-red-50 dark:bg-red-950/40',       icon: 'text-red-600 dark:text-red-400',       iconBg: 'bg-red-100 dark:bg-red-900/50',       value: 'text-red-700 dark:text-red-300',       border: 'border-red-100 dark:border-red-900/50' },
  slate:   { bg: 'bg-slate-50 dark:bg-slate-900/40',   icon: 'text-slate-600 dark:text-slate-300',   iconBg: 'bg-slate-100 dark:bg-slate-800/50',   value: 'text-slate-700 dark:text-slate-200',   border: 'border-slate-200 dark:border-slate-800' },
};

/**
 * Premium stat card with color-coded icon, value, and subtitle.
 */
export function StatCard({ title, value, subtitle, icon, color = 'slate', className }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className={cn('rounded-xl border p-4 flex items-center gap-3.5 glass-card micro-animate animate-in', c.bg, c.border, className)}>
      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm', c.iconBg)}>
        <span className={cn('h-5 w-5', c.icon)}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{title}</p>
        <p className={cn('text-2xl font-bold tabular-nums leading-tight mt-0.5', c.value)}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Consistent empty-state display with optional action button.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in">
      {icon && (
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface SectionCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

/**
 * Consistent card wrapper for page sections.
 */
export function SectionCard({ title, description, children, action, className, contentClassName, noPadding }: SectionCardProps) {
  return (
    <div className={cn('rounded-xl border glass-card overflow-hidden animate-in', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border/50">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn(noPadding ? '' : 'p-5', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
