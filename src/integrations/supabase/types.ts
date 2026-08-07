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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cash_register_sessions: {
        Row: {
          actual_cash: number | null
          approved_at: string | null
          approved_by: string | null
          card_sales: number
          cash_difference: number | null
          cash_expenses: number
          cash_sales: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          credit_sales: number
          expected_cash: number
          id: string
          manager_notes: string | null
          moov_money_sales: number
          mpesa_sales: number
          mtn_money_sales: number
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          orange_money_sales: number
          organization_id: string
          products_sold: number
          rejection_reason: string | null
          status: string
          store_id: string | null
          total_expenses: number
          total_sales: number
          transaction_count: number
          updated_at: string
          wave_sales: number
        }
        Insert: {
          actual_cash?: number | null
          approved_at?: string | null
          approved_by?: string | null
          card_sales?: number
          cash_difference?: number | null
          cash_expenses?: number
          cash_sales?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          credit_sales?: number
          expected_cash?: number
          id?: string
          manager_notes?: string | null
          moov_money_sales?: number
          mpesa_sales?: number
          mtn_money_sales?: number
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          orange_money_sales?: number
          organization_id: string
          products_sold?: number
          rejection_reason?: string | null
          status?: string
          store_id?: string | null
          total_expenses?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
          wave_sales?: number
        }
        Update: {
          actual_cash?: number | null
          approved_at?: string | null
          approved_by?: string | null
          card_sales?: number
          cash_difference?: number | null
          cash_expenses?: number
          cash_sales?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          credit_sales?: number
          expected_cash?: number
          id?: string
          manager_notes?: string | null
          moov_money_sales?: number
          mpesa_sales?: number
          mtn_money_sales?: number
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          orange_money_sales?: number
          organization_id?: string
          products_sold?: number
          rejection_reason?: string | null
          status?: string
          store_id?: string | null
          total_expenses?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
          wave_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_register_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string | null
          sort_order: number | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id?: string | null
          sort_order?: number | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string | null
          sort_order?: number | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          organization_id: string | null
          sale_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          organization_id?: string | null
          sale_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          sale_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          phone: string | null
          store_id: string | null
          total_credit: number
          total_purchases: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          store_id?: string | null
          total_credit?: number
          total_purchases?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          store_id?: string | null
          total_credit?: number
          total_purchases?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          organization_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          organization_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          organization_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          allowed_plans: string[]
          created_at: string
          description: string | null
          feature_key: string
          id: string
          is_active: boolean
        }
        Insert: {
          allowed_plans?: string[]
          created_at?: string
          description?: string | null
          feature_key: string
          id?: string
          is_active?: boolean
        }
        Update: {
          allowed_plans?: string[]
          created_at?: string
          description?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      organizations: {
        Row: {
          accent_color: string | null
          app_name: string | null
          brand_color: string | null
          category: Database["public"]["Enums"]["store_category"] | null
          country: string | null
          created_at: string
          currency: string | null
          default_tax_rate: number
          font_family: string | null
          id: string
          language: string | null
          logo_url: string | null
          metadata: Json | null
          name: string
          owner_user_id: string
          receipt_template: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_expires_at: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_status: string | null
          theme_mode: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          app_name?: string | null
          brand_color?: string | null
          category?: Database["public"]["Enums"]["store_category"] | null
          country?: string | null
          created_at?: string
          currency?: string | null
          default_tax_rate?: number
          font_family?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name: string
          owner_user_id: string
          receipt_template?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_status?: string | null
          theme_mode?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          app_name?: string | null
          brand_color?: string | null
          category?: Database["public"]["Enums"]["store_category"] | null
          country?: string | null
          created_at?: string
          currency?: string | null
          default_tax_rate?: number
          font_family?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          owner_user_id?: string
          receipt_template?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_status?: string | null
          theme_mode?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          channel: string
          created_at: string
          created_by: string
          destination: string
          expires_at: string
          id: string
          organization_id: string | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by: string
          destination: string
          expires_at: string
          id?: string
          organization_id?: string | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string
          destination?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          has_admin_analytics: boolean
          has_advanced_reports: boolean
          has_ai_assistant: boolean
          has_api_access: boolean
          has_backup_restore: boolean
          has_custom_branding: boolean
          has_exports: boolean
          has_loyalty_program: boolean
          has_multi_currency: boolean
          has_offline_advanced: boolean
          has_priority_support: boolean
          has_supplier_management: boolean
          id: string
          is_active: boolean
          max_products: number | null
          max_sales_per_month: number | null
          max_stores: number | null
          max_users: number | null
          name: string
          price_monthly: number
          price_yearly: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          has_admin_analytics?: boolean
          has_advanced_reports?: boolean
          has_ai_assistant?: boolean
          has_api_access?: boolean
          has_backup_restore?: boolean
          has_custom_branding?: boolean
          has_exports?: boolean
          has_loyalty_program?: boolean
          has_multi_currency?: boolean
          has_offline_advanced?: boolean
          has_priority_support?: boolean
          has_supplier_management?: boolean
          id: string
          is_active?: boolean
          max_products?: number | null
          max_sales_per_month?: number | null
          max_stores?: number | null
          max_users?: number | null
          name: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          has_admin_analytics?: boolean
          has_advanced_reports?: boolean
          has_ai_assistant?: boolean
          has_api_access?: boolean
          has_backup_restore?: boolean
          has_custom_branding?: boolean
          has_exports?: boolean
          has_loyalty_program?: boolean
          has_multi_currency?: boolean
          has_offline_advanced?: boolean
          has_priority_support?: boolean
          has_supplier_management?: boolean
          id?: string
          is_active?: boolean
          max_products?: number | null
          max_sales_per_month?: number | null
          max_stores?: number | null
          max_users?: number | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          min_stock_alert: number | null
          name: string
          organization_id: string | null
          price: number
          stock_quantity: number
          store_id: string | null
          supplier_id: string | null
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          tax_rate: number | null
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_alert?: number | null
          name: string
          organization_id?: string | null
          price: number
          stock_quantity?: number
          store_id?: string | null
          supplier_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          tax_rate?: number | null
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_alert?: number | null
          name?: string
          organization_id?: string | null
          price?: number
          stock_quantity?: number
          store_id?: string | null
          supplier_id?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          tax_rate?: number | null
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          current_store_id: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          id: string
          is_active: boolean
          is_test_account: boolean
          language: string | null
          last_login_at: string | null
          last_logout_at: string | null
          last_seen_at: string | null
          nfc_enabled: boolean | null
          organization_id: string | null
          owner_name: string
          phone: string | null
          subscription_expires_at: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          test_expires_at: string | null
          theme_mode: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_name: string
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          current_store_id?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          is_test_account?: boolean
          language?: string | null
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          nfc_enabled?: boolean | null
          organization_id?: string | null
          owner_name: string
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          test_expires_at?: string | null
          theme_mode?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          current_store_id?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          is_test_account?: boolean
          language?: string | null
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          nfc_enabled?: boolean | null
          organization_id?: string | null
          owner_name?: string
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          test_expires_at?: string | null
          theme_mode?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_store_id_fkey"
            columns: ["current_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          notes: string | null
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          tax_rate: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity_ordered?: number
          quantity_received?: number
          tax_rate?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          notes?: string | null
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          tax_rate?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          received_date: string | null
          status: Database["public"]["Enums"]["po_status"]
          store_id: string | null
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          store_id?: string | null
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          store_id?: string | null
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number | null
          created_at: string
          id: string
          organization_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          store_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          id?: string
          organization_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          store_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          id?: string
          organization_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          store_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          change_amount: number | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number | null
          id: string
          notes: string | null
          organization_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          sale_number: string
          seller_name: string | null
          store_id: string | null
          subtotal: number
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          tax_amount: number | null
          total_amount: number
          user_id: string
        }
        Insert: {
          amount_paid: number
          change_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          sale_number: string
          seller_name?: string | null
          store_id?: string | null
          subtotal: number
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          tax_amount?: number | null
          total_amount: number
          user_id: string
        }
        Update: {
          amount_paid?: number
          change_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          sale_number?: string
          seller_name?: string | null
          store_id?: string | null
          subtotal?: number
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          tax_amount?: number | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          new_quantity: number
          organization_id: string | null
          previous_quantity: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          store_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_quantity: number
          organization_id?: string | null
          previous_quantity: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          store_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_quantity?: number
          organization_id?: string | null
          previous_quantity?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          store_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          accent_color: string | null
          card_style: string | null
          created_at: string
          extra_settings: Json | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          organization_id: string
          primary_color: string | null
          receipt_footer: string | null
          receipt_show_logo: boolean | null
          receipt_show_tax: boolean | null
          secondary_color: string | null
          sidebar_style: string | null
          store_name: string | null
          success_color: string | null
          template: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          card_style?: string | null
          created_at?: string
          extra_settings?: Json | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id: string
          primary_color?: string | null
          receipt_footer?: string | null
          receipt_show_logo?: boolean | null
          receipt_show_tax?: boolean | null
          secondary_color?: string | null
          sidebar_style?: string | null
          store_name?: string | null
          success_color?: string | null
          template?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          card_style?: string | null
          created_at?: string
          extra_settings?: Json | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id?: string
          primary_color?: string | null
          receipt_footer?: string | null
          receipt_show_logo?: boolean | null
          receipt_show_tax?: boolean | null
          secondary_color?: string | null
          sidebar_style?: string | null
          store_name?: string | null
          success_color?: string | null
          template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["store_category"] | null
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          is_headquarters: boolean
          metadata: Json | null
          name: string
          organization_id: string
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: Database["public"]["Enums"]["store_category"] | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          metadata?: Json | null
          name: string
          organization_id: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["store_category"] | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          metadata?: Json | null
          name?: string
          organization_id?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string | null
          payload: Json | null
          processed: boolean | null
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          processed?: boolean | null
          stripe_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          from_plan: string | null
          id: string
          metadata: Json | null
          organization_id: string
          performed_by: string | null
          to_plan: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          from_plan?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          performed_by?: string | null
          to_plan?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          from_plan?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          performed_by?: string | null
          to_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_period: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          grace_period_ends_at: string | null
          id: string
          organization_id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          grace_period_ends_at?: string | null
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          grace_period_ends_at?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          min_quantity: number
          notes: string | null
          organization_id: string
          product_id: string
          supplier_id: string
          supply_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          notes?: string | null
          organization_id: string
          product_id: string
          supplier_id: string
          supply_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          notes?: string | null
          organization_id?: string
          product_id?: string
          supplier_id?: string
          supply_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          created_at: string
          device_id: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          error_message: string | null
          id: string
          local_data: Json | null
          organization_id: string | null
          remote_data: Json | null
          resolution_strategy: string
          resolved_data: Json | null
          status: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          error_message?: string | null
          id?: string
          local_data?: Json | null
          organization_id?: string | null
          remote_data?: Json | null
          resolution_strategy: string
          resolved_data?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          device_id?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          error_message?: string | null
          id?: string
          local_data?: Json | null
          organization_id?: string | null
          remote_data?: Json | null
          resolution_strategy?: string
          resolved_data?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          counter_type: string
          current_count: number
          id: string
          limit_value: number | null
          organization_id: string
          period_start: string | null
          updated_at: string
        }
        Insert: {
          counter_type: string
          current_count?: number
          id?: string
          limit_value?: number | null
          organization_id: string
          period_start?: string | null
          updated_at?: string
        }
        Update: {
          counter_type?: string
          current_count?: number
          id?: string
          limit_value?: number | null
          organization_id?: string
          period_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action: Database["public"]["Enums"]["app_activity_action"]
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["app_activity_action"]
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["app_activity_action"]
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_user_id: string | null
          target_user_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_user_id?: string | null
          target_user_name?: string | null
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
      adjust_product_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_type: string
        }
        Returns: {
          new_quantity: number
          previous_quantity: number
        }[]
      }
      admin_exists: { Args: never; Returns: boolean }
      admin_get_all_subscriptions: { Args: never; Returns: Json }
      admin_update_organization_subscription: {
        Args: {
          p_duration?: string
          p_organization_id: string
          p_payment_reference?: string
          p_plan_id: string
          p_reason?: string
          p_status?: string
        }
        Returns: Json
      }
      approve_cash_register_session: {
        Args: { p_manager_notes?: string; p_session_id: string }
        Returns: undefined
      }
      batch_update_stock: {
        Args: { p_items: Json; p_sale_id: string }
        Returns: undefined
      }
      check_account_status: {
        Args: never
        Returns: {
          deactivation_reason: string
          is_active: boolean
          is_test_account: boolean
          test_expires_at: string
        }[]
      }
      check_feature_access: { Args: { p_feature_key: string }; Returns: Json }
      check_plan_limit: { Args: { p_limit_type: string }; Returns: Json }
      close_cash_register_session: {
        Args: { p_actual_cash: number; p_notes?: string; p_session_id: string }
        Returns: Json
      }
      create_first_organization: {
        Args: {
          p_country: string
          p_currency: string
          p_org_name: string
          p_store_category: string
          p_store_name: string
          p_store_slug: string
        }
        Returns: string
      }
      create_full_sale: {
        Args: {
          p_amount_paid?: number
          p_change_amount?: number
          p_customer_name?: string
          p_customer_phone?: string
          p_discount_amount?: number
          p_items: Json
          p_organization_id: string
          p_payment_method?: string
          p_payment_reference?: string
          p_sale_number: string
          p_seller_name?: string
          p_store_id?: string
          p_subtotal: number
          p_tax_amount?: number
          p_total_amount: number
          p_user_id: string
        }
        Returns: string
      }
      create_product: {
        Args: {
          p_barcode?: string
          p_category_id?: string
          p_cost_price?: number
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_min_stock_alert?: number
          p_name: string
          p_price: number
          p_stock_quantity?: number
          p_store_id?: string
          p_supplier_id?: string
          p_unit?: string
        }
        Returns: string
      }
      create_sale_with_limit: {
        Args: {
          p_amount_paid?: number
          p_change_amount?: number
          p_customer_name?: string
          p_customer_phone?: string
          p_discount_amount?: number
          p_items: Json
          p_payment_method?: string
          p_payment_reference?: string
          p_sale_number: string
          p_seller_name?: string
          p_store_id?: string
          p_subtotal: number
          p_tax_amount?: number
          p_total_amount: number
        }
        Returns: string
      }
      create_store:
        | {
            Args: {
              p_address?: string
              p_category?: Database["public"]["Enums"]["store_category"]
              p_city?: string
              p_country?: string
              p_currency?: string
              p_metadata?: Json
              p_name: string
              p_phone?: string
              p_slug: string
            }
            Returns: string
          }
        | {
            Args: {
              p_category?: Database["public"]["Enums"]["store_category"]
              p_city?: string
              p_country?: string
              p_currency?: string
              p_name: string
              p_organization_id: string
              p_slug: string
            }
            Returns: string
          }
      decrement_credits: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: Json
      }
      decrement_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      delete_organization: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      delete_store: { Args: { p_store_id: string }; Returns: Json }
      ensure_user_has_organization: {
        Args: { p_org_name?: string }
        Returns: string
      }
      generate_order_number: { Args: { p_prefix?: string }; Returns: string }
      generate_sale_number: { Args: never; Returns: string }
      get_admin_article_ranking: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_organization_id?: string
          p_period?: string
          p_start_date?: string
        }
        Returns: {
          category_name: string
          cost_price: number
          current_stock: number
          margin: number
          organization_id: string
          product_id: string
          product_name: string
          quantity_sold: number
          ranking_category: string
          store_name: string
          total_revenue: number
          unit_price: number
        }[]
      }
      get_admin_global_kpis: {
        Args: { p_period?: string }
        Returns: {
          avg_basket: number
          gross_margin: number
          gross_margin_pct: number
          low_stock_count: number
          net_revenue: number
          previous_period_sales: number
          sales_growth_pct: number
          total_active_products: number
          total_active_users: number
          total_cost: number
          total_customers: number
          total_expenses: number
          total_orgs: number
          total_products: number
          total_sales: number
          total_stores: number
          total_transactions: number
          total_users: number
        }[]
      }
      get_admin_org_kpis: {
        Args: { p_period?: string }
        Returns: {
          active_products: number
          avg_basket: number
          customer_count: number
          gross_margin: number
          low_stock_count: number
          net_revenue: number
          org_name: string
          organization_id: string
          store_count: number
          store_names: string[]
          total_cost: number
          total_expenses: number
          total_sales: number
          transaction_count: number
        }[]
      }
      get_admin_payment_distribution: {
        Args: {
          p_end_date?: string
          p_organization_id?: string
          p_period?: string
          p_start_date?: string
        }
        Returns: {
          payment_method: string
          percentage: number
          total_amount: number
          transaction_count: number
        }[]
      }
      get_admin_product_ranking_detailed: {
        Args: {
          p_limit?: number
          p_organization_id?: string
          p_period?: string
        }
        Returns: {
          category_name: string
          cost: number
          margin: number
          margin_pct: number
          org_name: string
          product_id: string
          product_name: string
          quantity_sold: number
          rank_type: string
          revenue: number
          revenue_pct_of_total: number
          stock_quantity: number
        }[]
      }
      get_admin_sales_trend: {
        Args: {
          p_end_date?: string
          p_organization_id?: string
          p_period?: string
          p_start_date?: string
        }
        Returns: {
          avg_basket: number
          date: string
          organization_id: string
          store_name: string
          total_sales: number
          transaction_count: number
        }[]
      }
      get_admin_seller_performance: {
        Args: { p_organization_id?: string; p_period?: string }
        Returns: {
          avg_sale_amount: number
          last_login_at: string
          last_sale_at: string
          org_name: string
          organization_id: string
          seller_id: string
          seller_name: string
          seller_role: string
          store_name: string
          total_revenue: number
          total_sales: number
        }[]
      }
      get_admin_stock_movements: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_organization_id?: string
          p_period?: string
          p_start_date?: string
        }
        Returns: {
          created_at: string
          movement_id: string
          movement_type: string
          new_quantity: number
          organization_id: string
          previous_quantity: number
          product_id: string
          product_name: string
          quantity: number
          reason: string
          store_name: string
        }[]
      }
      get_admin_stores_summary: { Args: never; Returns: Json }
      get_admin_users_per_org: {
        Args: never
        Returns: {
          active_users: number
          admin_count: number
          comptable_count: number
          manager_count: number
          org_name: string
          organization_id: string
          total_users: number
          vendeur_count: number
        }[]
      }
      get_cash_closing_operators: {
        Args: { p_organization_id: string }
        Returns: {
          owner_name: string
          user_id: string
        }[]
      }
      get_cash_closing_summary: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_cash_register_sessions: {
        Args: {
          p_from_date?: string
          p_status?: string
          p_store_id?: string
          p_to_date?: string
          p_user_id?: string
        }
        Returns: {
          actual_cash: number | null
          approved_at: string | null
          approved_by: string | null
          card_sales: number
          cash_difference: number | null
          cash_expenses: number
          cash_sales: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          credit_sales: number
          expected_cash: number
          id: string
          manager_notes: string | null
          moov_money_sales: number
          mpesa_sales: number
          mtn_money_sales: number
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          orange_money_sales: number
          organization_id: string
          products_sold: number
          rejection_reason: string | null
          status: string
          store_id: string | null
          total_expenses: number
          total_sales: number
          transaction_count: number
          updated_at: string
          wave_sales: number
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_register_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_categories: {
        Args: never
        Returns: {
          description: string
          id: string
          name: string
          product_count: number
          sort_order: number
        }[]
      }
      get_category_kpis: {
        Args: { p_organization_id?: string; p_period?: string }
        Returns: {
          category_color: string
          category_icon: string
          category_id: string
          category_name: string
          cost: number
          margin: number
          margin_pct: number
          products_in_category: number
          quantity_sold: number
          revenue: number
          revenue_pct: number
          sales_count: number
          top_product_name: string
        }[]
      }
      get_customer_stats: { Args: never; Returns: Json }
      get_dashboard_stats: {
        Args: {
          p_day_end?: string
          p_day_start?: string
          p_month_end?: string
          p_month_start?: string
        }
        Returns: Json
      }
      get_enhanced_dashboard_stats: {
        Args: { p_organization_id?: string; p_period?: string }
        Returns: {
          avg_basket: number
          avg_products_per_sale: number
          cash_amount: number
          cash_count: number
          credit_amount: number
          credit_count: number
          customers_served: number
          gross_margin: number
          low_stock_count: number
          mobile_money_amount: number
          mobile_money_count: number
          out_of_stock_count: number
          total_cost: number
          total_discounts: number
          total_products_sold: number
          total_sales_amount: number
          total_tax: number
          total_transactions: number
        }[]
      }
      get_expense_stats: { Args: never; Returns: Json }
      get_low_stock_products: {
        Args: { p_limit?: number }
        Returns: {
          category_icon: string
          category_name: string
          id: string
          min_stock_alert: number
          name: string
          stock_quantity: number
        }[]
      }
      get_next_category_sort_order: { Args: never; Returns: number }
      get_onboarding_checklist: { Args: never; Returns: Json }
      get_organization_id_of_user: {
        Args: { _user_id: string }
        Returns: string
      }
      get_organization_stores: {
        Args: never
        Returns: {
          category: string
          country: string
          created_at: string
          currency: string
          id: string
          name: string
          slug: string
        }[]
      }
      get_organization_subscription: { Args: never; Returns: Json }
      get_payment_history: { Args: { p_limit?: number }; Returns: Json }
      get_plans: {
        Args: never
        Returns: {
          created_at: string
          currency: string
          description: string | null
          has_admin_analytics: boolean
          has_advanced_reports: boolean
          has_ai_assistant: boolean
          has_api_access: boolean
          has_backup_restore: boolean
          has_custom_branding: boolean
          has_exports: boolean
          has_loyalty_program: boolean
          has_multi_currency: boolean
          has_offline_advanced: boolean
          has_priority_support: boolean
          has_supplier_management: boolean
          id: string
          is_active: boolean
          max_products: number | null
          max_sales_per_month: number | null
          max_stores: number | null
          max_users: number | null
          name: string
          price_monthly: number
          price_yearly: number | null
          sort_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_product_kpis_by_period: {
        Args: { p_organization_id?: string; p_period?: string }
        Returns: {
          category_name: string
          cost: number
          margin: number
          margin_pct: number
          org_name: string
          product_id: string
          product_name: string
          quantity_sold: number
          rank_type: string
          revenue: number
          revenue_pct_of_total: number
          stock_quantity: number
        }[]
      }
      get_product_stats: { Args: never; Returns: Json }
      get_reports_stats:
        | {
            Args: { p_end: string; p_organization_id: string; p_start: string }
            Returns: Json
          }
        | { Args: { p_end: string; p_start: string }; Returns: Json }
      get_seller_activities: {
        Args: { p_limit?: number; p_user_id?: string }
        Returns: {
          action: string
          created_at: string
          description: string
          id: string
          metadata: Json
          seller_name: string
          user_id: string
        }[]
      }
      get_seller_kpis_detailed: {
        Args: { p_organization_id?: string; p_period?: string }
        Returns: {
          avg_basket: number
          avg_products_per_sale: number
          is_active: boolean
          last_sale_at: string
          org_name: string
          seller_id: string
          seller_name: string
          seller_role: string
          top_category_name: string
          top_product_name: string
          total_amount: number
          total_products_sold: number
          total_sales: number
        }[]
      }
      get_seller_performance: {
        Args: { p_period_end?: string; p_period_start?: string }
        Returns: {
          avg_sale_amount: number
          is_active: boolean
          last_login_at: string
          last_logout_at: string
          last_seen_at: string
          role: string
          seller_name: string
          total_revenue: number
          total_sales: number
          user_id: string
        }[]
      }
      get_store_stats: {
        Args: { p_store_id: string }
        Returns: {
          active_product_count: number
          customer_count: number
          expenses_this_month: number
          low_stock_count: number
          product_count: number
          sales_this_month: number
          sales_today: number
        }[]
      }
      get_stripe_customer: { Args: never; Returns: Json }
      get_supplier_stats: { Args: never; Returns: Json }
      get_supplier_with_products: {
        Args: { p_supplier_id: string }
        Returns: Json
      }
      get_top_products: { Args: { p_limit?: number }; Returns: Json }
      get_user_organization_id: { Args: never; Returns: string }
      get_whatsapp_config: { Args: never; Returns: Json }
      get_whatsapp_stats: { Args: never; Returns: Json }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { _role: string; _user_id: string }; Returns: boolean }
      increment_customer_credit: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: undefined
      }
      increment_customer_credit_by_phone: {
        Args: {
          p_amount: number
          p_customer_name: string
          p_customer_phone: string
          p_organization_id: string
          p_sale_number?: string
        }
        Returns: string
      }
      insert_default_categories: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: undefined
      }
      invite_user: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      is_member_of_organization: { Args: { _org_id: string }; Returns: boolean }
      is_org_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      log_user_activity: {
        Args: { p_action: string; p_description?: string; p_metadata?: Json }
        Returns: string
      }
      open_cash_register_session: {
        Args: { p_notes?: string; p_opening_cash?: number; p_store_id?: string }
        Returns: string
      }
      process_credit_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_description?: string
        }
        Returns: undefined
      }
      process_pos_sale: {
        Args: { p_account_id: string; p_product_id: string; p_quantity: number }
        Returns: Json
      }
      receive_purchase_order: {
        Args: { p_notes?: string; p_order_id: string; p_received_items: Json }
        Returns: undefined
      }
      record_user_logout: { Args: never; Returns: undefined }
      register_user: {
        Args: {
          p_business_name: string
          p_organization_id?: string
          p_owner_name: string
          p_phone?: string
          p_role?: string
        }
        Returns: undefined
      }
      reject_cash_register_session: {
        Args: { p_rejection_reason: string; p_session_id: string }
        Returns: undefined
      }
      resolve_stock_conflict: {
        Args: {
          local_new_qty: number
          previous_qty: number
          remote_new_qty: number
        }
        Returns: number
      }
      save_whatsapp_config: {
        Args: {
          p_access_token?: string
          p_auto_send_message?: string
          p_auto_send_receipt?: boolean
          p_business_account_id?: string
          p_phone_number_id?: string
          p_template_language?: string
          p_template_name?: string
          p_whatsapp_phone?: string
        }
        Returns: boolean
      }
      select_plan: { Args: { p_plan_id: string }; Returns: string }
      set_current_store: { Args: { p_store_id: string }; Returns: undefined }
      setup_onboarding_store: {
        Args: {
          p_address?: string
          p_category?: Database["public"]["Enums"]["store_category"]
          p_city?: string
          p_phone?: string
          p_store_name: string
        }
        Returns: string
      }
      super_admin_create_organization: {
        Args: {
          p_address?: string
          p_city?: string
          p_country: string
          p_currency: string
          p_org_name: string
          p_store_category: string
          p_store_name: string
          p_store_slug: string
        }
        Returns: {
          error: string
          org_id: string
          store_id: string
          success: boolean
        }[]
      }
      touch_last_login: { Args: never; Returns: undefined }
      update_business_type: {
        Args: { p_category: string; p_country?: string; p_currency?: string }
        Returns: Json
      }
      update_onboarding_progress: {
        Args: {
          p_completed_steps?: string[]
          p_current_step?: string
          p_onboarding_complete?: boolean
        }
        Returns: Json
      }
      update_organization_subscription: {
        Args: { p_duration?: string; p_plan_id: string; p_status?: string }
        Returns: Json
      }
    }
    Enums: {
      app_activity_action:
        | "login"
        | "logout"
        | "session_timeout"
        | "sale_created"
        | "sale_refunded"
        | "sale_cancelled"
        | "product_created"
        | "product_updated"
        | "product_deleted"
        | "stock_adjusted"
        | "stock_transfer"
        | "customer_created"
        | "customer_updated"
        | "credit_payment"
        | "supplier_created"
        | "supplier_updated"
        | "purchase_order_created"
        | "purchase_order_received"
        | "user_created"
        | "user_deactivated"
        | "user_reactivated"
        | "password_reset"
        | "settings_updated"
        | "backup_created"
        | "backup_restored"
        | "store_created"
        | "store_updated"
      app_role: "admin" | "super_admin" | "manager" | "vendeur" | "comptable"
      payment_method:
        | "cash"
        | "wave"
        | "orange_money"
        | "mtn_money"
        | "moov_money"
        | "mpesa"
        | "card"
        | "credit"
      po_status:
        | "draft"
        | "sent"
        | "confirmed"
        | "partial"
        | "received"
        | "cancelled"
      store_category:
        | "epicerie"
        | "boutique_vetements"
        | "boutique_chaussures"
        | "supermarche"
        | "restaurant"
        | "boulangerie_patisserie"
        | "pharmacie"
        | "cosmetiques_beaute"
        | "electronique"
        | "quincaillerie"
        | "materiel_construction"
        | "alimentation_generale"
        | "station_service"
        | "point_vente_telecom"
        | "salon_coiffure"
        | "autre"
      subscription_plan: "starter" | "croissance" | "enterprise"
      sync_status: "synced" | "pending" | "conflict"
      user_role: "super_admin" | "admin" | "manager" | "vendeur" | "comptable"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_activity_action: [
        "login",
        "logout",
        "session_timeout",
        "sale_created",
        "sale_refunded",
        "sale_cancelled",
        "product_created",
        "product_updated",
        "product_deleted",
        "stock_adjusted",
        "stock_transfer",
        "customer_created",
        "customer_updated",
        "credit_payment",
        "supplier_created",
        "supplier_updated",
        "purchase_order_created",
        "purchase_order_received",
        "user_created",
        "user_deactivated",
        "user_reactivated",
        "password_reset",
        "settings_updated",
        "backup_created",
        "backup_restored",
        "store_created",
        "store_updated",
      ],
      app_role: ["admin", "super_admin", "manager", "vendeur", "comptable"],
      payment_method: [
        "cash",
        "wave",
        "orange_money",
        "mtn_money",
        "moov_money",
        "mpesa",
        "card",
        "credit",
      ],
      po_status: [
        "draft",
        "sent",
        "confirmed",
        "partial",
        "received",
        "cancelled",
      ],
      store_category: [
        "epicerie",
        "boutique_vetements",
        "boutique_chaussures",
        "supermarche",
        "restaurant",
        "boulangerie_patisserie",
        "pharmacie",
        "cosmetiques_beaute",
        "electronique",
        "quincaillerie",
        "materiel_construction",
        "alimentation_generale",
        "station_service",
        "point_vente_telecom",
        "salon_coiffure",
        "autre",
      ],
      subscription_plan: ["starter", "croissance", "enterprise"],
      sync_status: ["synced", "pending", "conflict"],
      user_role: ["super_admin", "admin", "manager", "vendeur", "comptable"],
    },
  },
} as const
