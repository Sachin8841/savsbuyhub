export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ad_expenses: {
        Row: {
          id: string
          category: string | null
          platform: string | null
          amount: number
          expense_date: string
          description: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          category?: string | null
          platform?: string | null
          amount: number
          expense_date: string
          description?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          category?: string | null
          platform?: string | null
          amount?: number
          expense_date?: string
          description?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      disclosed_periods: {
        Row: {
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
        Insert: {
          id?: string
          period_name: string
          sales_data?: Json
          returns_data?: Json
          ad_expenses_data?: Json
          inventory_snapshot?: Json
          notes?: string | null
          dividend_declared?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_name?: string
          sales_data?: Json
          returns_data?: Json
          ad_expenses_data?: Json
          inventory_snapshot?: Json
          notes?: string | null
          dividend_declared?: number
          created_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          sku: string
          product_name: string
          aliases: string[] | null
          category: string | null
          total_bulk_stock_in: number
          average_cost_price: number
          average_selling_price: number
          delivery_fee: number | null
          stock_added_date: string
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          sku: string
          product_name: string
          aliases?: string[] | null
          category?: string | null
          total_bulk_stock_in: number
          average_cost_price: number
          average_selling_price: number
          delivery_fee?: number | null
          stock_added_date: string
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          sku?: string
          product_name?: string
          aliases?: string[] | null
          category?: string | null
          total_bulk_stock_in?: number
          average_cost_price?: number
          average_selling_price?: number
          delivery_fee?: number | null
          stock_added_date?: string
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      investment_requests: {
        Row: {
          id: string
          user_id: string
          amount: number
          stock_price_at_request: number
          requested_shares: number
          payment_method: string
          transaction_id: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          stock_price_at_request: number
          requested_shares: number
          payment_method: string
          transaction_id: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          stock_price_at_request?: number
          requested_shares?: number
          payment_method?: string
          transaction_id?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      investments: {
        Row: {
          id: string
          user_id: string
          amount: number
          purchase_date: string
          utr_number: string | null
          status: string
          shares: number | null
          share_price_at_buy: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          purchase_date?: string
          utr_number?: string | null
          status?: string
          shares?: number | null
          share_price_at_buy?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          purchase_date?: string
          utr_number?: string | null
          status?: string
          shares?: number | null
          share_price_at_buy?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          full_name?: string | null
          email?: string | null
          aadhar_number?: string | null
          pan_number?: string | null
          bank_name?: string | null
          account_number?: string | null
          ifsc_code?: string | null
          phone?: string | null
          initial?: string | null
          dob?: string | null
          address?: string | null
          gender?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string | null
          email?: string | null
          aadhar_number?: string | null
          pan_number?: string | null
          bank_name?: string | null
          account_number?: string | null
          ifsc_code?: string | null
          phone?: string | null
          initial?: string | null
          dob?: string | null
          address?: string | null
          gender?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      returns: {
        Row: {
          id: string
          sales_id: string
          inventory_id: string | null
          return_date: string
          quantity_returned: number
          delivery_status: string
          penalty_amount: number
          reason: string | null
          notes: string | null
          return_type: string | null
          delivered_date: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          sales_id: string
          inventory_id?: string | null
          return_date: string
          quantity_returned: number
          delivery_status?: string
          penalty_amount?: number
          reason?: string | null
          notes?: string | null
          return_type?: string | null
          delivered_date?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          sales_id?: string
          inventory_id?: string | null
          return_date?: string
          quantity_returned?: number
          delivery_status?: string
          penalty_amount?: number
          reason?: string | null
          notes?: string | null
          return_type?: string | null
          delivered_date?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          }
        ]
      }
      sales: {
        Row: {
          id: string
          inventory_id: string
          dispatch_date: string
          platform: string
          quantity_sold: number
          average_selling_price: number
          courier_partner: string | null
          payment_status: string
          payment_method: string | null
          order_number: string | null
          settlement_date: string | null
          cost_price: number | null
          bill_url: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          inventory_id: string
          dispatch_date: string
          platform: string
          quantity_sold: number
          average_selling_price: number
          courier_partner?: string | null
          payment_status?: string
          payment_method?: string | null
          order_number?: string | null
          settlement_date?: string | null
          cost_price?: number | null
          bill_url?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          inventory_id?: string
          dispatch_date?: string
          platform?: string
          quantity_sold?: number
          average_selling_price?: number
          courier_partner?: string | null
          payment_status?: string
          payment_method?: string | null
          order_number?: string | null
          settlement_date?: string | null
          cost_price?: number | null
          bill_url?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          }
        ]
      }
      sips: {
        Row: {
          id: string
          user_id: string
          amount: number
          frequency: string
          autopay_enabled: boolean
          start_date: string
          next_date: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          frequency?: string
          autopay_enabled?: boolean
          start_date?: string
          next_date: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          frequency?: string
          autopay_enabled?: boolean
          start_date?: string
          next_date?: string
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_disclosed_period_profit: {
        Args: { dp_id: string }
        Returns: number
      }
      calculate_share_price_as_of: {
        Args: { as_of_date: string }
        Returns: number
      }
      calculate_share_price_sql: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      delete_user_account: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      execute_monthly_disclosure: {
        Args: {
          _period_name: string
          _notes: string
          _dividend_declared: number
        }
        Returns: boolean
      }
      get_current_stock: {
        Args: { inv_id: string }
        Returns: number
      }
      get_public_forecast_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_public_price_history: {
        Args: Record<PropertyKey, never>
        Returns: {
          time: string
          price: number
        }[]
      }
      get_public_share_price: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "investor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
