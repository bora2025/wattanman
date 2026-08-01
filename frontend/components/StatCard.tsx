"use client"

/** Shared "Finance Dashboard" stat-card primitive — a small metric with an icon
 * chip, used across dashboard-style pages. `decimals` defaults to 2 (matching
 * the original admin/budget-report usage, which always shows currency-style
 * amounts); pass `decimals={0}` for plain integer counts (e.g. "24 exams").
 * Pass `onClick` to make it act as a toggleable filter tile (e.g. "click to
 * filter the list by this status") — `active` highlights it when selected. */
export default function StatCard({
  label, value, sub, icon, color, prefix = '$', decimals = 2, onClick, active,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: string
  prefix?: string
  decimals?: number
  onClick?: () => void
  active?: boolean
}) {
  const display = typeof value === 'number'
    ? `${prefix}${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)}`
    : value
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-5 flex items-start gap-4 text-left w-full ${
        onClick ? 'transition-all hover:shadow-md' : ''
      } ${active ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900/40' : 'border-gray-100 dark:border-slate-700'}`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-none ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-extrabold text-gray-900 dark:text-slate-100 mt-0.5 truncate">{display}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Tag>
  )
}
