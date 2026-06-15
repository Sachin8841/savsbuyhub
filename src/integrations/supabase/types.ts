export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enum helpers ────────────────────────────────────────────────────────────

export type AppRole = 'admin' | 'investor'

export type PaymentStatus =
  | 'Pending'
  | 'Settled'
  | 'Packed'
  | 'Cancelled'
  | 'Dispatched'
  | 'In Transit'
  | 'Order RTO'
  | 'Return'

export type Platform = 'Meesho' | 'Flipkart' | 'Amazon' | 'Offline'

export type PaymentMethod = 'Prepaid' | 'COD'

export type DeliveryStatus = 'Pending' | 'Received' | 'Rejected'

export type InvestmentStatus = 'Pending' | 'Verified' | 'Rejected' | 'Sold'

export type SipFrequency = 'Weekly' | 'Monthly' | 'Quarterly'

export type SipStatus = 'Active' | 'Paused' | 'Cancelled'

export type InvestmentRequestStatus = 'pending' | 'approved' | 'rejected'

export type AdCategory = 'Ads' | 'Delivery' | 'Penalties' | 'Other'

// ─── Table row types ──────────────────────────────────────────────────────────

export interface Profile {
  id: string
  user_id: string
  full_name: string | null
  email: string | null
  aadhar_number: string | null
  pan_number: string | null
  bank_name: string | null
  account_number: string | null
  ifsc_code: string | null
  phone: string | null
  initial: string | null
  dob: string | null
  address: string | null
  gender: string | null
  created_at: string
  updated_at: string | null
}

export interface UserRole {
  id: string
  user_id: string
  role: AppRole
  created_at: string
}

export interface InventoryRow {
  id: string
  sku: string
  product_name: string
  category: string | null
  total_bulk_stock_in: number
  average_cost_price: number
  average_selling_price: number
  delivery_fee: number | null
  stock_added_date: string
  created_at: string
  updated_at: string | null
  /** Computed – not stored, available via select join */
  current_stock?: number
}

export interface SaleRow {
  id: string
  inventory_id: string
  dispatch_date: string
  platform: Platform
  quantity_sold: number
  average_selling_price: number
  courier_partner: string | null
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  order_number: string | null
  settlement_date: string | null
  cost_price: number | null
  bill_url: string | null
  created_at: string
  updated_at: string | null
  /** Joined relation – present when `.select('*, inventory(...)')` is used */
  inventory?: Pick<
    InventoryRow,
    'sku' | 'product_name' | 'average_cost_price' | 'average_selling_price' | 'delivery_fee'
  > | null
}

export interface ReturnRow {
  id: string
  sales_id: string
  inventory_id: string | null
  return_date: string
  quantity_returned: number
  delivery_status: DeliveryStatus
  penalty_amount: number
  reason: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
  /** Joined relation */
  sales?: Pick<
    SaleRow,
    'id' | 'platform' | 'inventory_id' | 'quantity_sold' | 'average_selling_price' | 'dispatch_date'
  > & {
    inventory?: Pick<InventoryRow, 'sku' | 'product_name' | 'average_cost_price' | 'delivery_fee'> | null
  } | null
}

export interface AdExpenseRow {
  id: string
  category: AdCategory
  platform: string | null
  amount: number
  expense_date: string
  description: string | null
  created_at: string
  updated_at: string | null
}

export interface InvestmentRow {
  id: string
  user_id: string
  amount: number
  purchase_date: string
  utr_number: string | null
  status: InvestmentStatus
  shares: number | null
  share_price_at_buy: number | null
  created_at: string
  /** Joined relation */
  profiles?: Pick<
    Profile,
    'full_name' | 'email' | 'pan_number' | 'aadhar_number' | 'bank_name' | 'account_number' | 'ifsc_code'
  > | null
}

export interface SipRow {
  id: string
  user_id: string
  amount: number
  frequency: SipFrequency
  autopay_enabled: boolean
  start_date: string
  next_date: string
  status: SipStatus
  created_at: string
}

export interface InvestmentRequestRow {
  id: string
  user_id: string
  amount: number
  stock_price_at_request: number
  requested_shares: number
  payment_method: string
  transaction_id: string
  status: InvestmentRequestStatus
  created_at: string
}

export interface DisclosedPeriodRow {
  id: string
  period_name: string
  sales_data: Json
  returns_data: Json
  ad_expenses_data: Json
  inventory_snapshot: Json
  notes: string | null
  dividend_declared: number
  created_at: string
}

// ─── RPC function return types ────────────────────────────────────────────────

export interface PriceHistoryPoint {
  time: string
  price: number
}

export interface ForecastDataPoint {
  label: string
  revenue: number
  investment: number
  profit: number
  units: number
  orders: number
  profit_per_unit: number
}

// ─── Database schema ──────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Omit<Profile, 'id'>>
      }
      user_roles: {
        Row: UserRole
        Insert: Omit<UserRole, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<UserRole, 'id'>>
      }
      inventory: {
        Row: InventoryRow
        Insert: Omit<InventoryRow, 'id' | 'created_at' | 'updated_at' | 'current_stock'> & {
          id?: string
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Omit<InventoryRow, 'id' | 'current_stock'>>
      }
      sales: {
        Row: SaleRow
        Insert: Omit<SaleRow, 'id' | 'created_at' | 'updated_at' | 'inventory'> & {
          id?: string
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Omit<SaleRow, 'id' | 'inventory'>>
      }
      returns: {
        Row: ReturnRow
        Insert: Omit<ReturnRow, 'id' | 'created_at' | 'updated_at' | 'sales'> & {
          id?: string
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Omit<ReturnRow, 'id' | 'sales'>>
      }
      ad_expenses: {
        Row: AdExpenseRow
        Insert: Omit<AdExpenseRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string | null
        }
        Update: Partial<Omit<AdExpenseRow, 'id'>>
      }
      investments: {
        Row: InvestmentRow
        Insert: Omit<InvestmentRow, 'id' | 'created_at' | 'profiles'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<InvestmentRow, 'id' | 'profiles'>>
      }
      sips: {
        Row: SipRow
        Insert: Omit<SipRow, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<SipRow, 'id'>>
      }
      investment_requests: {
        Row: InvestmentRequestRow
        Insert: Omit<InvestmentRequestRow, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<InvestmentRequestRow, 'id'>>
      }
      disclosed_periods: {
        Row: DisclosedPeriodRow
        Insert: Omit<DisclosedPeriodRow, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<DisclosedPeriodRow, 'id'>>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_stock: {
        Args: { inv_id: string }
        Returns: number
      }
      get_public_share_price: {
        Args: Record<never, never>
        Returns: number
      }
      get_public_price_history: {
        Args: Record<never, never>
        Returns: PriceHistoryPoint[]
      }
      get_public_forecast_data: {
        Args: Record<never, never>
        Returns: Json
      }
      calculate_share_price_sql: {
        Args: Record<never, never>
        Returns: number
      }
      calculate_share_price_as_of: {
        Args: { as_of_date: string }
        Returns: number
      }
      calculate_disclosed_period_profit: {
        Args: { dp_id: string }
        Returns: number
      }
      execute_monthly_disclosure: {
        Args: {
          _period_name: string
          _notes: string
          _dividend_declared: number
        }
        Returns: boolean
      }
      delete_user_account: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: { _user_id: string; _role: AppRole }
        Returns: boolean
      }
    }
    Enums: {
      app_role: AppRole
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
