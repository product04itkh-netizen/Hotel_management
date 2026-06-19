import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramNotification, type TelegramEvent } from '@/lib/telegram'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, data, branch_id, override_token, override_chat_id } = body as {
      event: TelegramEvent
      data: Record<string, string | number | undefined>
      branch_id?: string
      override_token?: string
      override_chat_id?: string
    }

    let botToken = override_token
    let chatId = override_chat_id

    if (!botToken || !chatId) {
      const supabase = createClient()
      let settingsQuery = supabase.from('hotel_settings').select('telegram_bot_token, telegram_chat_id, telegram_enabled, notification_events, hotel_name')
      if (branch_id) settingsQuery = settingsQuery.eq('branch_id', branch_id)
      const { data: settings } = await settingsQuery.limit(1).single()

      if (!settings?.telegram_enabled && !override_token) {
        return NextResponse.json({ ok: false, error: 'Telegram notifications are disabled' })
      }

      const events: string[] = settings?.notification_events ?? []
      if (!events.includes(event) && !override_token) {
        return NextResponse.json({ ok: false, error: 'This event type is not enabled' })
      }

      botToken = settings?.telegram_bot_token ?? undefined
      chatId = settings?.telegram_chat_id ?? undefined

      if (settings?.hotel_name) {
        data.hotel_name = settings.hotel_name
      }
    }

    if (!botToken || !chatId) {
      return NextResponse.json({ ok: false, error: 'Telegram not configured' })
    }

    const result = await sendTelegramNotification(botToken, chatId, { event, data })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
