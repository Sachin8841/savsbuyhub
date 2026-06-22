export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          platform: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          platform: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          platform?: string
        }
        Relationships: []
      }
      capital_accounts: {
        Row: {
          account_holding_value: number
          created_at: string
          hot_cash: number
          id: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_holding_value?: number
          created_at?: string
          hot_cash?: number
          id?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_holding_value?: number
          created_at?: string
          hot_cash?: number
          id?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          account_delta: number
          amount: number
          created_at: string
          created_by: string | null
          hot_cash_delta: number
          id: string
          movement_type: string
          notes: string | null
          reference_id: string | null
          reference_table: string | null
        }
        Insert: {
          account_delta?: number
          amount?: number
          created_at?: string
          created_by?: string | null
          hot_cash_delta?: number
          id?: string
          movement_type: string
          notes?: string | null
          reference_id?: string | null
          reference_table?: string | null
        }
        Update: {
          account_delta?: number
          amount?: number
          created_at?: string
          created_by?: string | null
          hot_cash_delta?: number
          id?: string
          movement_type?: string
          notes?: string | null
          reference_id?: string | null
          reference_table?: string | null
        }
        Relationships: []
      }
      disclosed_periods: {
        Row: {
          ad_expenses_data: Json
          created_at: string
          dividend_declared: number | null
          id: string
          inventory_snapshot: Json
          notes: string | null
          period_name: string
          returns_data: Json
          sales_data: Json
        }
        Insert: {
          ad_expenses_data?: Json
          created_at?: string
          dividend_declared?: number | null
          id?: string
          inventory_snapshot?: Json
          notes?: string | null
          period_name: string
          returns_data?: Json
          sales_data?: Json
        }
        Update: {
          ad_expenses_data?: Json
          created_at?: string
          dividend_declared?: number | null
          id?: string
          inventory_snapshot?: Json
          notes?: string | null
          period_name?: string
          returns_data?: Json
          sales_data?: Json
        }
        Relationships: []
      }
      inventory: {
        Row: {
          aliases: string[]
          average_cost_price: number
          average_selling_price: number
          created_at: string
          delivery_fee: number
          id: string
          parent_inventory_id: string | null
          product_name: string
          sku: string
          stock_added_date: string | null
          total_bulk_stock_in: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          average_cost_price?: number
          average_selling_price?: number
          created_at?: string
          delivery_fee?: number
          id?: string
          parent_inventory_id?: string | null
          product_name: string
          sku: string
          stock_added_date?: string | null
          total_bulk_stock_in?: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          average_cost_price?: number
          average_selling_price?: number
          created_at?: string
          delivery_fee?: number
          id?: string
          parent_inventory_id?: string | null
          product_name?: string
          sku?: string
          stock_added_date?: string | null
          total_bulk_stock_in?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_parent_inventory_id_fkey"
            columns: ["parent_inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount: number
          created_at: string
          id: string
          purchase_date: string
          share_price_at_buy: number | null
          shares: number | null
          status: string
          user_id: string
          utr_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          purchase_date?: string
          share_price_at_buy?: number | null
          shares?: number | null
          status?: string
          user_id: string
          utr_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          purchase_date?: string
          share_price_at_buy?: number | null
          shares?: number | null
          status?: string
          user_id?: string
          utr_number?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aadhar_number: string | null
          account_number: string | null
          address: string | null
          avatar_url: string | null
          bank_name: string | null
          created_at: string
          dob: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          ifsc_code: string | null
          initial: string | null
          pan_number: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aadhar_number?: string | null
          account_number?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_name?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          initial?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aadhar_number?: string | null
          account_number?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_name?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          initial?: string | null
          pan_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          created_at: string
          delivered_date: string | null
          delivery_status: Database["public"]["Enums"]["delivery_status_type"]
          id: string
          inventory_id: string | null
          penalty_amount: number
          quantity_returned: number
          return_date: string
          return_type: Database["public"]["Enums"]["return_type"]
          sales_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status_type"]
          id?: string
          inventory_id?: string | null
          penalty_amount?: number
          quantity_returned: number
          return_date?: string
          return_type: Database["public"]["Enums"]["return_type"]
          sales_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status_type"]
          id?: string
          inventory_id?: string | null
          penalty_amount?: number
          quantity_returned?: number
          return_date?: string
          return_type?: Database["public"]["Enums"]["return_type"]
          sales_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_sales_id_fkey"
            columns: ["sales_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          average_selling_price: number
          cost_price: number | null
          courier_partner: string | null
          created_at: string
          dispatch_date: string
          id: string
          inventory_id: string
          order_number: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status_type"]
          platform: Database["public"]["Enums"]["platform_type"]
          quantity_sold: number
          settlement_date: string | null
        }
        Insert: {
          average_selling_price: number
          cost_price?: number | null
          courier_partner?: string | null
          created_at?: string
          dispatch_date: string
          id?: string
          inventory_id: string
          order_number?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status_type"]
          platform: Database["public"]["Enums"]["platform_type"]
          quantity_sold: number
          settlement_date?: string | null
        }
        Update: {
          average_selling_price?: number
          cost_price?: number | null
          courier_partner?: string | null
          created_at?: string
          dispatch_date?: string
          id?: string
          inventory_id?: string
          order_number?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status_type"]
          platform?: Database["public"]["Enums"]["platform_type"]
          quantity_sold?: number
          settlement_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      sips: {
        Row: {
          amount: number
          autopay_enabled: boolean | null
          created_at: string
          frequency: string
          id: string
          next_date: string
          start_date: string
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          autopay_enabled?: boolean | null
          created_at?: string
          frequency?: string
          id?: string
          next_date?: string
          start_date?: string
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          autopay_enabled?: boolean | null
          created_at?: string
          frequency?: string
          id?: string
          next_date?: string
          start_date?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_capital_delta: {
        Args: { _account_delta: number; _hot_cash_delta: number }
        Returns: undefined
      }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      ensure_capital_account: { Args: never; Returns: undefined }
      execute_monthly_disclosure: {
        Args: {
          _dividend_declared?: number
          _notes?: string
          _period_name: string
        }
        Returns: boolean
      }
      get_current_stock: { Args: { inv_id: string }; Returns: number }
      get_public_forecast_data: { Args: never; Returns: Json }
      get_public_price_history: {
        Args: never
        Returns: {
          price: number
          time: string
        }[]
      }
      get_public_share_price: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_cash_movement: {
        Args: {
          _account_delta: number
          _amount: number
          _hot_cash_delta: number
          _movement_type: string
          _notes?: string
          _reference_id?: string
          _reference_table?: string
        }
        Returns: boolean
      }
      revoke_user_access: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
      set_capital_accounts: {
        Args: {
          _account_holding_value: number
          _hot_cash: number
          _notes?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      courier_type:
        | "Valmo"
        | "Delhivery"
        | "Shadowfax"
        | "XpressBees"
        | "SAVS Trans X"
        | "Other"
      delivery_status_type: "In Transit" | "Received"
      payment_status_type:
        | "Pending"
        | "Settled"
        | "Cancelled"
        | "Packed"
        | "Dispatched"
        | "In Transit"
        | "Order RTO"
        | "Return"
      platform_type: "Meesho" | "Flipkart" | "Amazon" | "Offline"
      return_type: "Customer Return" | "RTO"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      courier_type: [
        "Valmo",
        "Delhivery",
        "Shadowfax",
        "XpressBees",
        "SAVS Trans X",
        "Other",
      ],
      delivery_status_type: ["In Transit", "Received"],
      payment_status_type: [
        "Pending",
        "Settled",
        "Cancelled",
        "Packed",
        "Dispatched",
        "In Transit",
        "Order RTO",
        "Return",
      ],
      platform_type: ["Meesho", "Flipkart", "Amazon", "Offline"],
      return_type: ["Customer Return", "RTO"],
    },
  },
} as const
