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
          created_at: string
          description: string | null
          expense_date: string
          id: string
          platform: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          platform: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          platform?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          average_cost_price: number
          average_selling_price: number
          created_at: string
          delivery_fee: number
          id: string
          product_name: string
          sku: string
          stock_added_date: string | null
          total_bulk_stock_in: number
          updated_at: string
        }
        Insert: {
          average_cost_price?: number
          average_selling_price?: number
          created_at?: string
          delivery_fee?: number
          id?: string
          product_name: string
          sku: string
          stock_added_date?: string | null
          total_bulk_stock_in?: number
          updated_at?: string
        }
        Update: {
          average_cost_price?: number
          average_selling_price?: number
          created_at?: string
          delivery_fee?: number
          id?: string
          product_name?: string
          sku?: string
          stock_added_date?: string | null
          total_bulk_stock_in?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
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
          penalty_amount: number
          quantity_returned: number
          return_date: string
          return_type: Database["public"]["Enums"]["return_type"]
          sales_id: string
        }
        Insert: {
          created_at?: string
          delivered_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status_type"]
          id?: string
          penalty_amount?: number
          quantity_returned: number
          return_date?: string
          return_type: Database["public"]["Enums"]["return_type"]
          sales_id: string
        }
        Update: {
          created_at?: string
          delivered_date?: string | null
          delivery_status?: Database["public"]["Enums"]["delivery_status_type"]
          id?: string
          penalty_amount?: number
          quantity_returned?: number
          return_date?: string
          return_type?: Database["public"]["Enums"]["return_type"]
          sales_id?: string
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
          courier_partner: string | null
          created_at: string
          dispatch_date: string
          id: string
          inventory_id: string
          payment_status: Database["public"]["Enums"]["payment_status_type"]
          platform: Database["public"]["Enums"]["platform_type"]
          quantity_sold: number
          settlement_date: string | null
        }
        Insert: {
          average_selling_price: number
          courier_partner?: string | null
          created_at?: string
          dispatch_date: string
          id?: string
          inventory_id: string
          payment_status?: Database["public"]["Enums"]["payment_status_type"]
          platform: Database["public"]["Enums"]["platform_type"]
          quantity_sold: number
          settlement_date?: string | null
        }
        Update: {
          average_selling_price?: number
          courier_partner?: string | null
          created_at?: string
          dispatch_date?: string
          id?: string
          inventory_id?: string
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
      get_current_stock: { Args: { inv_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
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
      payment_status_type: "Pending" | "Settled"
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
      payment_status_type: ["Pending", "Settled"],
      platform_type: ["Meesho", "Flipkart", "Amazon", "Offline"],
      return_type: ["Customer Return", "RTO"],
    },
  },
} as const
