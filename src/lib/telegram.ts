export type TelegramEvent =
  | 'new_reservation'
  | 'checkin'
  | 'checkout'
  | 'payment'
  | 'housekeeping_complete'
  | 'room_maintenance'
  | 'cancellation'

interface TelegramPayload {
  event: TelegramEvent
  data: Record<string, string | number | undefined>
}

function esc(v: string | number | undefined): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function b(v: string | number | undefined): string {
  return `<b>${esc(v)}</b>`
}

function code(v: string | number | undefined): string {
  return `<code>${esc(v)}</code>`
}

function buildMessage(event: TelegramEvent, data: Record<string, string | number | undefined>): string {
  const hotel = esc(data.hotel_name ?? 'Hotel')
  switch (event) {
    case 'new_reservation': {
      const addOns = data.add_ons ? esc(String(data.add_ons)) : 'None'
      return (
        `📋 ${b(`New Reservation — ${hotel}`)}\n\n` +
        `👤 <b>Guest:</b> ${esc(data.guest_name)}\n` +
        `🏠 <b>House:</b> ${esc(data.house_name ?? data.room_number)}\n` +
        `📅 <b>Check-in:</b> ${esc(data.check_in)}  →  <b>Check-out:</b> ${esc(data.check_out)}\n` +
        `👥 <b>Pax:</b> ${esc(data.pax ?? '—')}\n\n` +
        `💰 <b>Total:</b> ${esc(data.total_amount ?? '—')}\n` +
        `💵 <b>Deposit:</b> ${esc(data.deposit ?? '—')}\n` +
        `🔴 <b>Remaining:</b> ${esc(data.remaining ?? '—')}\n\n` +
        `📦 <b>Add-ons:</b>\n${addOns}\n\n` +
        `📌 <b>Status:</b> ${esc(data.status ?? '—')}\n` +
        `🔖 <b>Ref:</b> ${code(data.reservation_number)}`
      )
    }

    case 'checkin':
      return `✅ ${b(`Guest Checked In — ${hotel}`)}\n\nGuest: ${esc(data.guest_name)}\nHouse: ${esc(data.house_name ?? data.room_number)}\nTime: ${esc(data.time)}\nRef: ${code(data.reservation_number)}`

    case 'checkout':
      return `🔑 ${b(`Guest Checked Out — ${hotel}`)}\n\nGuest: ${esc(data.guest_name)}\nHouse: ${esc(data.house_name ?? data.room_number)}\nTime: ${esc(data.time)}\nRef: ${code(data.reservation_number)}`

    case 'payment':
      return `💳 ${b(`Payment Received — ${hotel}`)}\n\nGuest: ${esc(data.guest_name)}\nAmount: ${esc(data.amount)}\nMethod: ${esc(data.method)}\nInvoice: ${code(data.invoice_number)}`

    case 'housekeeping_complete':
      return `🧹 ${b(`Room Ready — ${hotel}`)}\n\nRoom ${esc(data.room_number)} has been cleaned and is now available.\nStaff: ${esc(data.staff_name)}`

    case 'room_maintenance':
      return `🔧 ${b(`Maintenance Alert — ${hotel}`)}\n\n${esc(data.house_name ?? data.room_number)} has been flagged for maintenance.\nNotes: ${esc(data.notes ?? 'None')}`

    case 'cancellation':
      return `❌ ${b(`Reservation Cancelled — ${hotel}`)}\n\nGuest: ${esc(data.guest_name)}\nHouse: ${esc(data.house_name ?? data.room_number)}\nRef: ${code(data.reservation_number)}\nReason: ${esc(data.reason ?? 'Not specified')}`

    default:
      return `ℹ️ ${b(`Hotel Notification — ${hotel}`)}\n\n${esc(JSON.stringify(data, null, 2))}`
  }
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: TelegramPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const message = buildMessage(payload.event, payload.data)
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    })
    const json = await res.json()
    if (json.ok) return { ok: true }
    return { ok: false, error: json.description ?? 'Telegram API error' }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
