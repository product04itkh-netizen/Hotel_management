export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'out_of_order'
export type RoomType = 'standard' | 'deluxe' | 'suite' | 'presidential'

export interface Room {
  id: string
  room_number: string
  room_type: RoomType
  floor: number
  status: RoomStatus
  price_per_night: number
  max_adults: number
  max_children: number
  amenities: string[]
  description?: string
  created_at: string
  updated_at: string
}

export interface Guest {
  id: string
  full_name: string
  email?: string
  phone?: string
  nationality?: string
  id_type?: string
  id_number?: string
  date_of_birth?: string
  address?: string
  notes?: string
  visit_count: number
  created_at: string
  updated_at: string
}

export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type BookingSource = 'walk_in' | 'phone' | 'online' | 'ota' | 'referral'

export interface Reservation {
  id: string
  reservation_number: string
  guest_id?: string
  room_id?: string
  check_in_date: string
  check_out_date: string
  actual_check_in?: string
  actual_check_out?: string
  status: ReservationStatus
  adults: number
  children: number
  total_amount?: number
  special_requests?: string
  source: BookingSource
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
  guest?: Guest
  room?: Room
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'refunded' | 'void'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'qr' | 'online'

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  invoice_number: string
  reservation_id?: string
  guest_id?: string
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  status: InvoiceStatus
  payment_method?: PaymentMethod
  paid_at?: string
  items: InvoiceItem[]
  notes?: string
  created_at: string
  updated_at: string
  reservation?: Reservation
  guest?: Guest
}

export type HousekeepingTaskType = 'cleaning' | 'turndown' | 'inspection' | 'maintenance' | 'special'
export type HousekeepingStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface HousekeepingTask {
  id: string
  room_id: string
  task_type: HousekeepingTaskType
  status: HousekeepingStatus
  priority: Priority
  assigned_to?: string
  notes?: string
  due_date?: string
  completed_at?: string
  created_at: string
  updated_at: string
  room?: Room
  staff?: Staff
}

export type StaffRole = 'admin' | 'manager' | 'receptionist' | 'housekeeping' | 'maintenance' | 'accounting'
export type StaffStatus = 'active' | 'inactive' | 'on_leave'

export interface Staff {
  id: string
  full_name: string
  role: StaffRole
  email?: string
  phone?: string
  status: StaffStatus
  department?: string
  hire_date?: string
  auth_user_id?: string
  created_at: string
  updated_at: string
}

export interface HotelSettings {
  id: string
  hotel_name: string
  hotel_address?: string
  hotel_phone?: string
  hotel_email?: string
  telegram_bot_token?: string
  telegram_chat_id?: string
  telegram_enabled: boolean
  notification_events: string[]
  tax_rate: number
  currency: string
  check_in_time: string
  check_out_time: string
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  totalRooms: number
  occupiedRooms: number
  occupancyRate: number
  todayRevenue: number
  todayCheckIns: number
  todayCheckOuts: number
  pendingHousekeeping: number
  revenueChange: number
}
