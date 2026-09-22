import { NextRequest, NextResponse } from 'next/server'
import khData from '@/data/kh-holidays.json'

// Cambodian public holidays for one year. Cambodia sets the full list each
// year by sub-decree, so every year is listed in full in kh-holidays.json —
// there are no "same date every year" holidays to fill in. A year that isn't
// in the file returns {} (no holidays shown) rather than a guess.
const years = khData.years as Record<string, Record<string, string>>

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear())

  return NextResponse.json(years[year] ?? {}, {
    // A day, not a year: this data gets corrected and extended, and a
    // year-long cache kept the old wrong dates in browsers.
    headers: { 'Cache-Control': 'public, max-age=86400' },
  })
}
