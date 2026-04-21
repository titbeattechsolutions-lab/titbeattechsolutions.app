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
      subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          plan: Database["public"]["Enums"]["tenant_plan"]
          received_at: string
          recorded_by: string | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          plan: Database["public"]["Enums"]["tenant_plan"]
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_data: {
        Row: {
          data: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_data_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sessions: {
        Row: {
          created_at: string
          expires_at: string
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          tenant_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          admin_pin_hash: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          plan: Database["public"]["Enums"]["tenant_plan"]
          school_name: string
          school_pin_hash: string
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at: string | null
          subscription_starts_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          admin_pin_hash?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"]
          school_name: string
          school_pin_hash: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_pin_hash?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          plan?: Database["public"]["Enums"]["tenant_plan"]
          school_name?: string
          school_pin_hash?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      _is_bcrypt: { Args: { _hash: string }; Returns: boolean }
      _verify_pin_any: {
        Args: { _pin: string; _stored_hash: string }
        Returns: boolean
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      create_tenant_v2: {
        Args: {
          _contact_email?: string
          _contact_phone?: string
          _notes?: string
          _school_name: string
          _school_pin: string
          _start_trial?: boolean
        }
        Returns: string
      }
      get_tenant_data: {
        Args: { _school_pin_hash: string; _tenant_id: string }
        Returns: Json
      }
      get_tenant_data_v2: { Args: { _session_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      save_tenant_data: {
        Args: { _data: Json; _school_pin_hash: string; _tenant_id: string }
        Returns: boolean
      }
      save_tenant_data_v2: {
        Args: { _data: Json; _session_token: string }
        Returns: boolean
      }
      set_admin_pin: {
        Args: { _pin_hash: string; _tenant_id: string }
        Returns: boolean
      }
      set_admin_pin_v2: {
        Args: { _pin: string; _session_token: string }
        Returns: boolean
      }
      verify_admin_pin: {
        Args: { _pin_hash: string; _tenant_id: string }
        Returns: boolean
      }
      verify_admin_pin_v2: {
        Args: { _pin: string; _session_token: string }
        Returns: boolean
      }
      verify_school_pin: {
        Args: { _pin_hash: string }
        Returns: {
          has_admin_pin: boolean
          plan: Database["public"]["Enums"]["tenant_plan"]
          school_name: string
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at: string
          tenant_id: string
          trial_started_at: string
        }[]
      }
      verify_school_pin_v2: {
        Args: { _pin: string }
        Returns: {
          has_admin_pin: boolean
          plan: Database["public"]["Enums"]["tenant_plan"]
          school_name: string
          session_token: string
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at: string
          tenant_id: string
          trial_started_at: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "school_admin"
      tenant_plan: "trial" | "termly" | "yearly"
      tenant_status: "trial" | "active" | "expired" | "suspended"
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
      app_role: ["super_admin", "school_admin"],
      tenant_plan: ["trial", "termly", "yearly"],
      tenant_status: ["trial", "active", "expired", "suspended"],
    },
  },
} as const
