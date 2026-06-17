import { NextRequest, NextResponse } from 'next/server'
import khData from '@/data/kh-holidays.json'

export async function GET(req: NextRequest) {
  const year = parseInt(
    req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear()),
    10,
  )

  const result: Record<string, string> = {}

  // Fixed holidays — same date every year
  for (const [mmdd, name] of Object.entries(khData.fixed)) {
    result[`${year}-${mmdd}`] = name
  }

  // Lunar/variable holidays — year-specific
  for (const [date, name] of Object.entries(khData.lunar)) {
    if (date.startsWith(String(year))) result[date] = name
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=31536000' },
  })
}
