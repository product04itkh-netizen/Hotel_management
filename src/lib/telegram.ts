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

function buildMessage(event: TelegramEvent, data: Record<string, string | number | undefined>): string {
  const hotel = data.hotel_name ?? 'Hotel'
  switch (event) {
    case 'new_reservation':
      return `📋 *New Reservation — ${hotel}*\n\nGuest: ${data.guest_name}\nRoom: ${data.room_number} (${data.room_type})\nCheck-in: ${data.check_in}\nCheck-out: ${data.check_out}\nRef: \`${data.reservation_number}\``

    case 'checkin':
      return `✅ *Guest Checked In — ${hotel}*\n\nGuest: ${data.guest_name}\nRoom: ${data.room_number}\nTime: ${data.time}\nRef: \`${data.reservation_number}\``

    case 'checkout':
      return `🔑 *Guest Checked Out — ${hotel}*\n\nGuest: ${data.guest_name}\nRoom: ${data.room_number}\nTime: ${data.time}\nRef: \`${data.reservation_number}\``

    case 'payment':
      return `💳 *Payment Received — ${hotel}*\n\nGuest: ${data.guest_name}\nAmount: ${data.amount}\nMethod: ${data.method}\nInvoice: \`${data.invoice_number}\``

    case 'housekeeping_complete':
      return `🧹 *Room Ready — ${hotel}*\n\nRoom ${data.room_number} has been cleaned and is now available.\nStaff: ${data.staff_name}`

    case 'room_maintenance':
      return `🔧 *Maintenance Alert — ${hotel}*\n\nRoom ${data.room_number} has been flagged for maintenance.\nPriority: ${data.priority}\nNotes: ${data.notes ?? 'None'}`

    case 'cancellation':
      return `❌ *Reservation Cancelled — ${hotel}*\n\nGuest: ${data.guest_name}\nRoom: ${data.room_number}\nRef: \`${data.reservation_number}\`\nReason: ${data.reason ?? 'Not specified'}`

    default:
      return `ℹ️ *Hotel Notification — ${hotel}*\n\n${JSON.stringify(data, null, 2)}`
  }
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: TelegramPayload
): Promise<boolean> {
  try {
    const message = buildMessage(payload.event, payload.data)
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
    const json = await res.json()
    return json.ok === true
  } catch {
    return false
  }
}
