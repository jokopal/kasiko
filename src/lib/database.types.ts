export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string
          created_at: string
          entity: string
          entity_id: string
          id: number
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id: string
          created_at?: string
          entity: string
          entity_id: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string
          created_at?: string
          entity?: string
          entity_id?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'audit_log_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_log_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      business_configs: {
        Row: {
          business_id: string
          created_at: string
          dashboard: NonNullable<Json>
          import_mapping: NonNullable<Json>
          template_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          dashboard?: NonNullable<Json>
          import_mapping?: NonNullable<Json>
          template_id?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          dashboard?: NonNullable<Json>
          import_mapping?: NonNullable<Json>
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_configs_business_id_fkey'
            columns: ['business_id']
            isOneToOne: true
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_configs_business_id_fkey'
            columns: ['business_id']
            isOneToOne: true
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          is_active: boolean
          role: Database['public']['Enums']['member_role']
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          is_active?: boolean
          role: Database['public']['Enums']['member_role']
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          is_active?: boolean
          role?: Database['public']['Enums']['member_role']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_members_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_members_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      businesses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          opening_cash: number
          owner_id: string
          phone: string
          primary_color: string
          receipt_footer: string
          receipt_prefix: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          opening_cash?: number
          owner_id: string
          phone?: string
          primary_color?: string
          receipt_footer?: string
          receipt_prefix: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          opening_cash?: number
          owner_id?: string
          phone?: string
          primary_color?: string
          receipt_footer?: string
          receipt_prefix?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'catalog_categories_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'catalog_categories_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      catalog_items: {
        Row: {
          business_id: string
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'catalog_items_business_id_category_id_fkey'
            columns: ['business_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'catalog_categories'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'catalog_items_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'catalog_items_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      devices: {
        Row: {
          business_id: string
          created_at: string
          device_code: string
          id: string
          registered_at: string
          registered_by: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          device_code: string
          id?: string
          registered_at?: string
          registered_by?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          device_code?: string
          id?: string
          registered_at?: string
          registered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'devices_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'devices_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      expense_categories: {
        Row: {
          allow_drawer: boolean
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database['public']['Enums']['expense_kind']
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_drawer?: boolean
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database['public']['Enums']['expense_kind']
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_drawer?: boolean
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database['public']['Enums']['expense_kind']
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expense_categories_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expense_categories_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category_id: string
          created_at: string
          created_by: string | null
          device_id: string | null
          id: string
          needs_review: boolean | null
          note: string
          occurred_at: string
          received_at: string
          source: Database['public']['Enums']['expense_source']
          status: Database['public']['Enums']['expense_status']
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          business_id: string
          category_id: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          id?: string
          needs_review?: never
          note?: string
          occurred_at: string
          received_at?: string
          source: Database['public']['Enums']['expense_source']
          status?: Database['public']['Enums']['expense_status']
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          id?: string
          needs_review?: never
          note?: string
          occurred_at?: string
          received_at?: string
          source?: Database['public']['Enums']['expense_source']
          status?: Database['public']['Enums']['expense_status']
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_business_id_category_id_fkey'
            columns: ['business_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'expenses_business_id_device_id_fkey'
            columns: ['business_id', 'device_id']
            isOneToOne: false
            referencedRelation: 'devices'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'expenses_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      historical_days: {
        Row: {
          business_id: string
          created_at: string
          day_key: string
          imported_at: string
          imported_by: string | null
          income: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          day_key: string
          imported_at?: string
          imported_by?: string | null
          income?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          day_key?: string
          imported_at?: string
          imported_by?: string | null
          income?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'historical_days_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'historical_days_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      historical_expenses: {
        Row: {
          amount: number
          business_id: string
          category_id: string
          day_key: string
        }
        Insert: {
          amount: number
          business_id: string
          category_id: string
          day_key: string
        }
        Update: {
          amount?: number
          business_id?: string
          category_id?: string
          day_key?: string
        }
        Relationships: [
          {
            foreignKeyName: 'historical_expenses_business_id_category_id_fkey'
            columns: ['business_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'historical_expenses_business_id_day_key_fkey'
            columns: ['business_id', 'day_key']
            isOneToOne: false
            referencedRelation: 'historical_days'
            referencedColumns: ['business_id', 'day_key']
          },
        ]
      }
      reserve_movements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          occurred_at: string
          reason: string | null
          source: Database['public']['Enums']['reserve_source'] | null
          type: Database['public']['Enums']['reserve_type']
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          source?: Database['public']['Enums']['reserve_source'] | null
          type: Database['public']['Enums']['reserve_type']
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          source?: Database['public']['Enums']['reserve_source'] | null
          type?: Database['public']['Enums']['reserve_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reserve_movements_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reserve_movements_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      transaction_items: {
        Row: {
          business_id: string
          catalog_item_id: string | null
          created_at: string
          id: string
          line_total: number
          name_snapshot: string
          position: number
          price_snapshot: number
          qty: number
          transaction_id: string
        }
        Insert: {
          business_id: string
          catalog_item_id?: string | null
          created_at?: string
          id: string
          line_total: number
          name_snapshot: string
          position: number
          price_snapshot: number
          qty: number
          transaction_id: string
        }
        Update: {
          business_id?: string
          catalog_item_id?: string | null
          created_at?: string
          id?: string
          line_total?: number
          name_snapshot?: string
          position?: number
          price_snapshot?: number
          qty?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transaction_items_business_id_catalog_item_id_fkey'
            columns: ['business_id', 'catalog_item_id']
            isOneToOne: false
            referencedRelation: 'catalog_items'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'transaction_items_business_id_transaction_id_fkey'
            columns: ['business_id', 'transaction_id']
            isOneToOne: false
            referencedRelation: 'transactions'
            referencedColumns: ['business_id', 'id']
          },
        ]
      }
      transactions: {
        Row: {
          business_id: string
          cash_received: number | null
          change_amount: number | null
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          needs_review: boolean | null
          occurred_at: string
          payment_method: Database['public']['Enums']['payment_method']
          plate_number: string | null
          receipt_no: string
          received_at: string
          status: Database['public']['Enums']['transaction_status']
          total: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          business_id: string
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          device_id: string
          id: string
          needs_review?: never
          occurred_at: string
          payment_method: Database['public']['Enums']['payment_method']
          plate_number?: string | null
          receipt_no: string
          received_at?: string
          status?: Database['public']['Enums']['transaction_status']
          total: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          business_id?: string
          cash_received?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          needs_review?: never
          occurred_at?: string
          payment_method?: Database['public']['Enums']['payment_method']
          plate_number?: string | null
          receipt_no?: string
          received_at?: string
          status?: Database['public']['Enums']['transaction_status']
          total?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'transactions_business_id_device_id_fkey'
            columns: ['business_id', 'device_id']
            isOneToOne: false
            referencedRelation: 'devices'
            referencedColumns: ['business_id', 'id']
          },
          {
            foreignKeyName: 'transactions_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'business_branding'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      business_branding: {
        Row: {
          address: string | null
          id: string | null
          is_active: boolean | null
          logo_path: string | null
          name: string | null
          phone: string | null
          primary_color: string | null
          receipt_footer: string | null
          receipt_prefix: string | null
          timezone: string | null
        }
        Insert: {
          address?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_path?: string | null
          name?: string | null
          phone?: string | null
          primary_color?: string | null
          receipt_footer?: string | null
          receipt_prefix?: string | null
          timezone?: string | null
        }
        Update: {
          address?: string | null
          id?: string | null
          is_active?: boolean | null
          logo_path?: string | null
          name?: string | null
          phone?: string | null
          primary_color?: string | null
          receipt_footer?: string | null
          receipt_prefix?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_template: { Args: { p_business_id: string; p_template: Json }; Returns: Json }
      apply_template_rows: { Args: { p_business_id: string; p_template: Json }; Returns: Json }
      assert_cashier_can_void: {
        Args: { p_business_id: string; p_occurred_at: string; p_requested_at: string }
        Returns: undefined
      }
      assert_plausible_device_time: { Args: { p_at: string }; Returns: undefined }
      business_day: { Args: { p_at: string; p_business_id: string }; Returns: string }
      business_day_start: { Args: { p_at?: string; p_business_id: string }; Returns: string }
      business_timezone: { Args: { p_business_id: string }; Returns: string }
      clear_history: { Args: { p_business_id: string }; Returns: number }
      create_business: { Args: { p_business: Json; p_template?: Json }; Returns: string }
      create_expense: { Args: { p: Json }; Returns: Json }
      create_transaction: { Args: { p: Json }; Returns: Json }
      drawer_expected: { Args: { p_business_id: string }; Returns: number }
      free_cash: { Args: { p_business_id: string; p_until?: string }; Returns: number }
      import_history: {
        Args: { p_business_id: string; p_days: Json; p_mapping?: Json }
        Returns: number
      }
      is_cashier: { Args: { p_business_id: string }; Returns: boolean }
      is_member: { Args: { p_business_id: string }; Returns: boolean }
      is_owner: { Args: { p_business_id: string }; Returns: boolean }
      normalize_label: { Args: { p_text: string }; Returns: string }
      period_totals: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: {
          drawer_expense: number
          drawings: number
          expense: number
          historical_days: number
          historical_income: number
          income: number
          income_cash: number
          income_qris: number
          income_transfer: number
          net_cash_flow: number
          non_operating_expense: number
          operating_expense: number
          operating_profit: number
          owner_expense: number
          profit: number
          transaction_count: number
        }[]
      }
      register_device: {
        Args: { p_business_id: string }
        Returns: {
          business_id: string
          created_at: string
          device_code: string
          id: string
          registered_at: string
          registered_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'devices'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_balance: { Args: { p_business_id: string; p_until?: string }; Returns: number }
      transaction_json: { Args: { p_id: string }; Returns: Json }
      void_expense: {
        Args: { p_id: string; p_reason: string; p_voided_at?: string }
        Returns: Json
      }
      void_transaction: {
        Args: { p_id: string; p_reason: string; p_voided_at?: string }
        Returns: Json
      }
    }
    Enums: {
      expense_kind: 'operating' | 'non_operating' | 'drawing'
      expense_source: 'drawer' | 'owner'
      expense_status: 'active' | 'void'
      member_role: 'owner' | 'cashier'
      payment_method: 'cash' | 'qris' | 'transfer'
      reserve_source: 'cash' | 'capital'
      reserve_type: 'deposit' | 'withdraw'
      transaction_status: 'paid' | 'void'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      expense_kind: ['operating', 'non_operating', 'drawing'],
      expense_source: ['drawer', 'owner'],
      expense_status: ['active', 'void'],
      member_role: ['owner', 'cashier'],
      payment_method: ['cash', 'qris', 'transfer'],
      reserve_source: ['cash', 'capital'],
      reserve_type: ['deposit', 'withdraw'],
      transaction_status: ['paid', 'void'],
    },
  },
} as const
