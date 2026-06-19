// ─── Vendors & Bills ──────────────────────────────────────────────────────
export interface Vendor {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  tax_id?: string
  payment_terms: number
  notes?: string
  is_active: boolean
  branch_id?: string
  created_at: string
  updated_at: string
}

export type BillStatus = 'unpaid' | 'partial' | 'paid' | 'void'

export interface Bill {
  id: string
  bill_number: string
  vendor_id?: string
  vendor?: Vendor
  bill_date: string
  due_date?: string
  expense_account_id?: string
  expense_account?: ChartOfAccount
  description: string
  subtotal: number
  tax_amount: number
  total: number
  amount_paid: number
  status: BillStatus
  notes?: string
  journal_entry_id?: string
  branch_id?: string
  created_at: string
  updated_at: string
}

export interface BillPayment {
  id: string
  bill_id: string
  payment_date: string
  amount: number
  payment_method: string
  reference?: string
  notes?: string
  journal_entry_id?: string
  branch_id?: string
  created_at: string
}

// ─── Fixed Assets ─────────────────────────────────────────────────────────
export type AssetCategory = 'land' | 'building' | 'computer_office' | 'furniture' | 'machinery' | 'vehicle'
export type AssetStatus = 'active' | 'disposed' | 'maintenance'

export interface FixedAsset {
  id: string
  description: string
  category: AssetCategory
  type_brand?: string
  asset_code?: string
  series_code?: string
  purchased_date?: string
  date_acquired?: string
  date_disposed?: string
  location?: string
  incharge?: string
  quantity: number
  unit_cost: number
  total_cost: number
  depreciation_rate: number
  is_depreciable: boolean
  invoice_doc_ref?: string
  notes?: string
  status: AssetStatus
  branch_id?: string
  created_at: string
  updated_at: string
}

export interface DepreciationRun {
  id: string
  run_year: number
  run_month: number
  journal_entry_id?: string
  total_amount: number
  asset_count: number
  branch_id?: string
  created_at: string
}

// ─── Accounting ───────────────────────────────────────────────────────────
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface ChartOfAccount {
  id: string
  code: string
  name: string
  type: AccountType
  category: string
  is_active: boolean
  branch_id?: string
  created_at: string
  updated_at: string
}

export interface JournalEntryLine {
  id: string
  entry_id: string
  account_id: string
  account?: ChartOfAccount
  description?: string
  debit: number
  credit: number
  is_reconciled: boolean
  reconciliation_id?: string
  created_at: string
}

export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  reference?: string
  reference_type?: string
  description: string
  is_void: boolean
  voided_at?: string
  void_entry_id?: string
  branch_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  lines?: JournalEntryLine[]
}

export interface AccountingPeriod {
  id: string
  year: number
  month: number
  status: 'open' | 'closed'
  closed_at?: string
  notes?: string
  branch_id?: string
  created_at: string
}

export interface RecurringJELine {
  account_id: string
  description?: string
  debit: number
  credit: number
}

export interface RecurringJournalEntry {
  id: string
  name: string
  description: string
  frequency: 'monthly' | 'quarterly' | 'annual'
  next_due_date: string
  is_active: boolean
  lines: RecurringJELine[]
  branch_id?: string
  created_at: string
  updated_at: string
}

export interface PettyCashTransaction {
  id: string
  transaction_date: string
  description: string
  category: string
  amount: number
  transaction_type: 'in' | 'out'
  reference?: string
  journal_entry_id?: string
  branch_id?: string
  created_at: string
}

export interface PaymentTransaction {
  id: string
  invoice_id: string
  amount: number
  payment_method: string
  payment_date: string
  notes?: string
  journal_entry_id?: string
  branch_id?: string
  created_at: string
  invoice?: Invoice
}

// ─── House ────────────────────────────────────────────────────────────────
export type HouseType = 'villa' | 'bungalow' | 'homestay' | 'cottage' | 'cabin' | 'chalet'
export type HouseStatus = 'available' | 'occupied' | 'maintenance' | 'closed'

export interface House {
  id: string
  name: string
  house_type: HouseType
  branch_id?: string
  branch?: Branch
  capacity: number
  base_rate_per_night: number
  status: HouseStatus
  amenities: string[]
  description?: string
  rooms?: Room[]
  created_at: string
  updated_at: string
}

// ─── Reservation Line Item ────────────────────────────────────────────────
export interface ReservationLineItem {
  id?: string
  reservation_id?: string
  label: string
  amount: number
  sort_order?: number
  created_at?: string
}

// ─── Branch ───────────────────────────────────────────────────────────────
export interface Branch {
  id: string
  name: string
  location: string
  address?: string
  phone?: string
  email?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Room ──────────────────────────────────────────────────────────────────
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
  house_id?: string
  house?: House
  branch_id?: string
  branch?: Branch
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
  deposit?: number
  deposit_method?: string
  discount_amount?: number
  discount_label?: string
  pax_count?: number
  arrival_time?: string
  created_by?: string
  house_id?: string
  house?: House
  branch_id?: string
  branch?: Branch
  created_at: string
  updated_at: string
  guest?: Guest
  room?: Room
  line_items?: ReservationLineItem[]
  deposit_receipts?: DepositReceipt[]
}

export type DepositReceiptStatus = 'held' | 'applied' | 'refunded'

export interface DepositReceipt {
  id: string
  receipt_number: string
  reservation_id: string
  branch_id?: string
  amount: number
  payment_method: string
  receipt_date: string
  status: DepositReceiptStatus
  notes?: string
  created_at: string
  updated_at: string
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
  invoice_date: string
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
  branch_id?: string
  branch?: Branch
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
  branch_id?: string
  branch?: Branch
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
  branch_id?: string
  branch?: Branch
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
  branch_id?: string
  branch?: Branch
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
