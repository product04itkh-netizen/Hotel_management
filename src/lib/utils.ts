import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Display-only currency code, kept in sync with the active branch's hotel_settings.currency
// by BranchContext. Does NOT convert stored amounts — every amount in the database is a raw
// USD-denominated number, so switching this only relabels/reformats the display symbol.
let _appCurrency = 'USD'

export function setAppCurrency(code: string | null | undefined) {
  _appCurrency = code || 'USD'
}

export function formatCurrency(amount: number, currency?: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || _appCurrency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatDateInput(date: string | Date): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const diff = end.getTime() - start.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function generateReservationNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `RES-${dateStr}-${rand}`
}


export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    occupied: 'bg-blue-100 text-blue-700',
    cleaning: 'bg-yellow-100 text-yellow-700',
    maintenance: 'bg-red-100 text-red-700',
    out_of_order: 'bg-gray-100 text-gray-600',
    confirmed: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    checked_in: 'bg-green-100 text-green-700',
    checked_out: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    no_show: 'bg-red-100 text-red-700',
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-yellow-100 text-yellow-700',
    refunded: 'bg-purple-100 text-purple-700',
    void: 'bg-gray-100 text-gray-600',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    skipped: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-600',
    on_leave: 'bg-yellow-100 text-yellow-700',
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    normal: 'bg-blue-100 text-blue-700',
    low: 'bg-gray-100 text-gray-600',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ')
}

/** Per-branch logo, resolved from the branch location. Falls back to the
 *  generic logo for unknown branches or pre-branch contexts (e.g. login). */
export function branchLogo(location?: string | null): string {
  const loc = (location ?? '').toLowerCase()
  if (loc.includes('kampot')) return '/logo-kampot.jpg'
  if (loc.includes('srae'))   return '/logo-srae-ambel.jpg'
  return '/logo.jpg'
}

/** Per-branch brand name (differs from the generic hotel name):
 *  Kampot = OnlyOne Private Villa, Srae Ambel = OnlyOne Homestay. */
export function branchBrand(location?: string | null): string {
  const loc = (location ?? '').toLowerCase()
  if (loc.includes('kampot')) return 'OnlyOne Private Villa'
  if (loc.includes('srae'))   return 'OnlyOne Homestay'
  return 'OnlyOne Homestay'
}

/** Full branded label for receipts/headers, e.g. "OnlyOne Private Villa (Kampot)". */
export function branchBrandLabel(location?: string | null): string {
  return location ? `${branchBrand(location)} (${location})` : branchBrand(location)
}

/** Formats a 24h "HH:MM" string (as stored in hotel_settings) as 12h e.g. "2:00 PM" */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return '—'
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export interface NightlyBreakdownGroup {
  nights: number
  rate: number
  promoName?: string
}

export interface NightlyResult {
  total: number
  nights: number
  hasPromo: boolean
  groups: NightlyBreakdownGroup[]
}

export function calculateNightlyTotal(
  checkIn: string,
  checkOut: string,
  baseRate: number,
  promotions: Array<{ name: string; promo_rate: number; start_date: string; end_date: string; is_active: boolean }>
): NightlyResult {
  const start = new Date(checkIn + 'T00:00:00')
  const end = new Date(checkOut + 'T00:00:00')
  const activePromos = promotions.filter(p => p.is_active)

  const groups: NightlyBreakdownGroup[] = []
  let total = 0
  let nightCount = 0
  let hasPromo = false

  const d = new Date(start)
  while (d < end) {
    const dateStr = d.toISOString().split('T')[0]
    const matching = activePromos.filter(p => dateStr >= p.start_date && dateStr <= p.end_date)
    let rate = baseRate
    let promoName: string | undefined
    if (matching.length > 0) {
      const best = matching.reduce((a, b) => a.promo_rate < b.promo_rate ? a : b)
      rate = best.promo_rate
      promoName = best.name
      hasPromo = true
    }
    const last = groups[groups.length - 1]
    if (last && last.rate === rate && last.promoName === promoName) {
      last.nights++
    } else {
      groups.push({ nights: 1, rate, promoName })
    }
    total += rate
    nightCount++
    d.setDate(d.getDate() + 1)
  }

  return { total, nights: nightCount, hasPromo, groups }
}

export function generateJournalEntryNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `JE-${dateStr}-${rand}`
}
