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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          store_id: string | null
          sort_order: number | null
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
          store_id?: string | null
          sort_order?: number | null
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
          store_id?: string | null
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
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
          store_id: string | null
          phone: string | null
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
          store_id?: string | null
          phone?: string | null
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
          store_id?: string | null
          phone?: string | null
          total_credit?: number
          total_purchases?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          store_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
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
          store_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
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
          store_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          user_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          id: string
          organization_id: string
          name: string
          slug: string
          address: string | null
          city: string | null
          country: string | null
          currency: string | null
          phone: string | null
          is_active: boolean
          is_headquarters: boolean
          category: Database["public"]["Enums"]["store_category"] | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          slug: string
          address?: string | null
          city?: string | null
          country?: string | null
          currency?: string | null
          phone?: string | null
          is_active?: boolean
          is_headquarters?: boolean
          category?: Database["public"]["Enums"]["store_category"] | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          slug?: string
          address?: string | null
          city?: string | null
          country?: string | null
          currency?: string | null
          phone?: string | null
          is_active?: boolean
          is_headquarters?: boolean
          category?: Database["public"]["Enums"]["store_category"] | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          purchase_order_id: string
          product_id: string | null
          product_name: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number
          tax_rate: number
          line_total: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          purchase_order_id: string
          product_id?: string | null
          product_name: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number
          tax_rate?: number
          line_total?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          purchase_order_id?: string
          product_id?: string | null
          product_name?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number
          tax_rate?: number
          line_total?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          }
        ]
      }
      purchase_orders: {
        Row: {
          id: string
          organization_id: string
          store_id: string | null
          supplier_id: string
          order_number: string
          status: string
          order_date: string
          expected_delivery: string | null
          received_date: string | null
          notes: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          currency: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          store_id?: string | null
          supplier_id: string
          order_number: string
          status?: string
          order_date?: string
          expected_delivery?: string | null
          received_date?: string | null
          notes?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          currency?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          store_id?: string | null
          supplier_id?: string
          order_number?: string
          status?: string
          order_date?: string
          expected_delivery?: string | null
          received_date?: string | null
          notes?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          currency?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          }
        ]
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
          name: string
          owner_user_id: string
          receipt_template: string | null
          subscription_expires_at: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
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
          name: string
          owner_user_id: string
          receipt_template?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
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
          name?: string
          owner_user_id?: string
          receipt_template?: string | null
          subscription_expires_at?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
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
          store_id: string | null
          price: number
          stock_quantity: number
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
          store_id?: string | null
          price?: number
          stock_quantity?: number
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
          store_id?: string | null
          price?: number
          stock_quantity?: number
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
          current_store_id: string | null
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
          current_store_id?: string | null
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
          current_store_id?: string | null
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
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          id: string
          user_id: string
          organization_id: string | null
          action: string
          description: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string | null
          action: string
          description?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string | null
          action?: string
          description?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          store_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          store_id?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          store_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
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
          store_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          sale_number: string
          seller_name: string | null
          subtotal: number
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          tax_amount: number | null
          total_amount: number
          user_id: string
        }
        Insert: {
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
          store_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sale_number: string
          seller_name?: string | null
          subtotal?: number
          sync_status?: Database["public"]["Enums"]["sync_status"] | null
          tax_amount?: number | null
          total_amount?: number
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
          store_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sale_number?: string
          seller_name?: string | null
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
          organization_id: string | null
          store_id: string | null
          phone: string | null
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
          organization_id?: string | null
          store_id?: string | null
          phone?: string | null
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
          organization_id?: string | null
          store_id?: string | null
          phone?: string | null
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
            foreignKeyName: "suppliers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          store_id: string | null
          previous_quantity: number
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_quantity: number
          organization_id?: string | null
          store_id?: string | null
          previous_quantity: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_quantity?: number
          organization_id?: string | null
          store_id?: string | null
          previous_quantity?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          remote_data?: Json | null
          resolution_strategy?: string
          resolved_data?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
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
            foreignKeyName: "suppliers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
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
          {
            foreignKeyName: "supplier_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
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
      store_settings: {
        Row: {
          id: string
          organization_id: string
          store_name: string | null
          logo_url: string | null
          favicon_url: string | null
          primary_color: string | null
          secondary_color: string | null
          accent_color: string | null
          success_color: string | null
          template: string | null
          sidebar_style: string | null
          card_style: string | null
          receipt_footer: string | null
          receipt_show_logo: boolean | null
          receipt_show_tax: boolean | null
          extra_settings: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          store_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          accent_color?: string | null
          success_color?: string | null
          template?: string | null
          sidebar_style?: string | null
          card_style?: string | null
          receipt_footer?: string | null
          receipt_show_logo?: boolean | null
          receipt_show_tax?: boolean | null
          extra_settings?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          store_name?: string | null
          logo_url?: string | null
          favicon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          accent_color?: string | null
          success_color?: string | null
          template?: string | null
          sidebar_style?: string | null
          card_style?: string | null
          receipt_footer?: string | null
          receipt_show_logo?: boolean | null
          receipt_show_tax?: boolean | null
          extra_settings?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      plans: {
        Row: {
          id: string
          name: string
          description: string | null
          price_monthly: number
          price_yearly: number | null
          currency: string
          max_stores: number | null
          max_users: number | null
          max_products: number | null
          max_sales_per_month: number | null
          has_advanced_reports: boolean
          has_exports: boolean
          has_supplier_management: boolean
          has_offline_advanced: boolean
          has_api_access: boolean
          has_priority_support: boolean
          has_custom_branding: boolean
          has_multi_currency: boolean
          has_ai_assistant: boolean
          has_loyalty_program: boolean
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          price_monthly?: number
          price_yearly?: number | null
          currency?: string
          max_stores?: number | null
          max_users?: number | null
          max_products?: number | null
          max_sales_per_month?: number | null
          has_advanced_reports?: boolean
          has_exports?: boolean
          has_supplier_management?: boolean
          has_offline_advanced?: boolean
          has_api_access?: boolean
          has_priority_support?: boolean
          has_custom_branding?: boolean
          has_multi_currency?: boolean
          has_ai_assistant?: boolean
          has_loyalty_program?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          price_monthly?: number
          price_yearly?: number | null
          currency?: string
          max_stores?: number | null
          max_users?: number | null
          max_products?: number | null
          max_sales_per_month?: number | null
          has_advanced_reports?: boolean
          has_exports?: boolean
          has_supplier_management?: boolean
          has_offline_advanced?: boolean
          has_api_access?: boolean
          has_priority_support?: boolean
          has_custom_branding?: boolean
          has_multi_currency?: boolean
          has_ai_assistant?: boolean
          has_loyalty_program?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string
          status: string
          current_period_start: string
          current_period_end: string
          trial_ends_at: string | null
          grace_period_ends_at: string | null
          cancelled_at: string | null
          billing_period: string | null
          stripe_subscription_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          grace_period_ends_at?: string | null
          cancelled_at?: string | null
          billing_period?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          current_period_start?: string
          current_period_end?: string
          trial_ends_at?: string | null
          grace_period_ends_at?: string | null
          cancelled_at?: string | null
          billing_period?: string | null
          stripe_subscription_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "subscriptions_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "subscriptions_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["id"] }
        ]
      }
      subscription_events: {
        Row: {
          id: string
          organization_id: string
          event_type: string
          from_plan: string | null
          to_plan: string | null
          performed_by: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          event_type: string
          from_plan?: string | null
          to_plan?: string | null
          performed_by?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          event_type?: string
          from_plan?: string | null
          to_plan?: string | null
          performed_by?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "subscription_events_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "subscription_events_performed_by_fkey"; columns: ["performed_by"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
          payload: Json | null
          organization_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
          payload?: Json | null
          organization_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
          payload?: Json | null
          organization_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "stripe_events_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      usage_counters: {
        Row: {
          id: string
          organization_id: string
          stores: number
          users: number
          products: number
          sales_this_month: number
          exports_this_month: number
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          stores?: number
          users?: number
          products?: number
          sales_this_month?: number
          exports_this_month?: number
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          stores?: number
          users?: number
          products?: number
          sales_this_month?: number
          exports_this_month?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "usage_counters_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      feature_flags: {
        Row: {
          id: string
          feature_key: string
          description: string | null
          allowed_plans: string[]
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          feature_key: string
          description?: string | null
          allowed_plans?: string[]
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          feature_key?: string
          description?: string | null
          allowed_plans?: string[]
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      admin_get_all_subscriptions: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
          owner_email: string | null
          country: string | null
          subscription_id: string | null
          plan_id: string | null
          plan_name: string | null
          status: string | null
          current_period_start: string | null
          current_period_end: string | null
          trial_ends_at: string | null
          billing_period: string | null
          stripe_customer_id: string | null
          created_at: string | null
        }[]
      }
      admin_update_organization_subscription: {
        Args: {
          p_organization_id: string
          p_plan_id: string
          p_duration?: string
          p_payment_reference?: string | null
          p_reason?: string | null
        }
        Returns: Json
      }
      check_account_status: {
        Args: never
        Returns: {
          is_active: boolean
          role: string | null
          organization_id: string | null
          deactivation_reason: string | null
        }[]
      }
      check_account_status_with_id: {
        Args: { check_user_id: string }
        Returns: {
          is_active: boolean
          role: string | null
          organization_id: string | null
        }[]
      }
      create_first_organization: {
        Args: {
          p_org_name: string
          p_store_name: string
          p_store_slug: string
          p_store_category?: string
          p_country?: string
          p_currency?: string
        }
        Returns: {
          success: boolean
          organization_id: string | null
          store_id: string | null
          mode: string
        }
      }
      generate_sale_number: { Args: never; Returns: string }
      get_user_organization_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member_of_organization: { Args: { _org_id: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      insert_default_categories: { Args: { p_org_id: string; p_user_id: string }; Returns: undefined }
      resolve_stock_conflict: {
        Args: {
          local_new_qty: number
          previous_qty: number
          remote_new_qty: number
        }
        Returns: number
      }
      touch_last_login: { Args: never; Returns: undefined }
      create_full_sale: {
        Args: {
          p_sale_number: string
          p_subtotal: number
          p_total_amount: number
          p_items: {
            product_id: string
            product_name: string
            quantity: number
            unit_price: number
            total_price: number
          }[]
          p_tax_amount?: number
          p_payment_method?: string
          p_amount_paid?: number
          p_change_amount?: number
          p_customer_name?: string | null
          p_customer_phone?: string | null
          p_seller_name?: string | null
        }
        Returns: string
      }
      adjust_product_stock: {
        Args: {
          p_product_id: string
          p_type: string
          p_quantity: number
          p_reason?: string | null
        }
        Returns: {
          new_quantity: number
          previous_quantity: number
        }[]
      }
      increment_customer_credit: {
        Args: {
          p_customer_id: string
          p_amount: number
        }
        Returns: undefined
      }
      process_credit_payment: {
        Args: {
          p_customer_id: string
          p_amount: number
          p_description?: string
        }
        Returns: undefined
      }
      register_user: {
        Args: {
          p_business_name: string
          p_owner_name: string
          p_phone?: string | null
          p_role?: string
          p_organization_id?: string | null
        }
        Returns: undefined
      }
      batch_update_stock: {
        Args: {
          p_sale_id: string
          p_items: {
            product_id: string
            quantity: number
            previous_quantity: number
          }[]
        }
        Returns: undefined
      }
      decrement_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      get_dashboard_stats: {
        Args: {
          p_day_start?: string | null
          p_day_end?: string | null
          p_month_start?: string | null
          p_month_end?: string | null
        }
        Returns: {
          todaySales: number
          todayTransactions: number
          monthSales: number
          monthCreditCount: number
          monthExpenses: number
          totalProducts: number
          lowStockProducts: number
          totalCredits: number
          creditsCount: number
        }[]
      }
      get_top_products: {
        Args: {
          p_since?: string | null
          p_limit?: number
        }
        Returns: {
          product_name: string
          total_quantity: number
          total_revenue: number
        }[]
      }
      get_organization_subscription: {
        Args: never
        Returns: {
          subscription_id: string
          plan_id: string
          plan_name: string
          status: string
          current_period_end: string
          trial_ends_at: string | null
          grace_period_ends_at: string | null
          max_stores: number | null
          max_users: number | null
          max_products: number | null
          max_sales_per_month: number | null
          has_advanced_reports: boolean
          has_exports: boolean
          has_supplier_management: boolean
          has_offline_advanced: boolean
          has_api_access: boolean
          has_priority_support: boolean
          has_custom_branding: boolean
          has_multi_currency: boolean
          has_ai_assistant: boolean
          has_loyalty_program: boolean
        }[]
      }
      check_plan_limit: {
        Args: { p_limit_type: string }
        Returns: {
          allowed: boolean
          current_count: number
          limit_value: number | null
          plan_id: string
        }[]
      }
      check_feature_access: {
        Args: { p_feature_key: string }
        Returns: {
          allowed: boolean
          plan_id: string
        }[]
      }
      get_plans: {
        Args: never
        Returns: {
          id: string
          name: string
          description: string | null
          price_monthly: number
          price_yearly: number | null
          currency: string
          max_stores: number | null
          max_users: number | null
          max_products: number | null
          max_sales_per_month: number | null
          has_advanced_reports: boolean
          has_exports: boolean
          has_supplier_management: boolean
          has_offline_advanced: boolean
          has_api_access: boolean
          has_priority_support: boolean
          has_custom_branding: boolean
          has_multi_currency: boolean
          has_ai_assistant: boolean
          has_loyalty_program: boolean
          sort_order: number
          is_active: boolean
        }[]
      }
      create_sale_with_limit: {
        Args: {
          p_store_id: string
          p_customer_name: string | null
          p_customer_phone: string | null
          p_payment_method: string
          p_items: Json
          p_subtotal: number
          p_tax_amount: number
          p_total_amount: number
          p_amount_paid: number
          p_change_amount: number
          p_seller_name: string | null
        }
        Returns: string
      }
      get_organization_stores: {
        Args: never
        Returns: {
          id: string
          name: string
          slug: string | null
          address: string | null
          city: string | null
          country: string | null
          currency: string | null
          phone: string | null
          is_active: boolean
          is_headquarters: boolean
          category: Database["public"]["Enums"]["store_category"] | null
          metadata: Json | null
          created_at: string
          updated_at: string
          product_count: number
          sales_this_month: number
        }[]
      }
      select_plan: {
        Args: { p_plan_id: string }
        Returns: string
      }
      update_onboarding_progress: {
        Args: {
          p_current_step?: string | null
          p_completed_steps?: string[] | null
          p_onboarding_complete?: boolean | null
        }
        Returns: Json
      }
      update_business_type: {
        Args: {
          p_category: string
          p_currency?: string | null
          p_country?: string | null
        }
        Returns: Json
      }
      setup_onboarding_store: {
        Args: {
          p_store_name: string
          p_address?: string | null
          p_city?: string | null
          p_phone?: string | null
          p_category?: Database["public"]["Enums"]["store_category"] | null
        }
        Returns: string
      }
      delete_store: {
        Args: { p_store_id: string }
        Returns: {
          success: boolean
          store_id: string
          store_name: string
        }
      }
      delete_organization: {
        Args: { p_organization_id: string }
        Returns: {
          success: boolean
          organization_id: string
          organization_name: string
          deleted_stores: number
          deleted_users: number
        }
      }
      get_seller_performance: {
        Args: {
          p_period_start?: string | null
          p_period_end?: string | null
        }
        Returns: {
          user_id: string
          seller_name: string
          role: string
          total_sales: number
          total_revenue: number
          avg_sale_amount: number
          last_login_at: string | null
          last_logout_at: string | null
          last_seen_at: string | null
          is_active: boolean
        }[]
      }
      get_seller_activities: {
        Args: {
          p_user_id?: string | null
          p_limit?: number
        }
        Returns: {
          id: string
          user_id: string
          seller_name: string
          action: string
          description: string | null
          metadata: Json | null
          created_at: string
        }[]
      }
      log_user_activity: {
        Args: {
          p_action: string
          p_description?: string | null
          p_metadata?: Json | null
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "vendeur" | "comptable"
      payment_method:
        | "cash"
        | "wave"
        | "orange_money"
        | "mtn_money"
        | "moov_money"
        | "mpesa"
        | "card"
        | "credit"
      subscription_plan: "starter" | "croissance" | "enterprise"
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
      sync_status: "synced" | "pending" | "conflict"
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
      app_role: ["super_admin", "admin", "manager", "vendeur", "comptable"],
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
      subscription_plan: ["starter", "croissance", "enterprise"],
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
      sync_status: ["synced", "pending", "conflict"],
    },
  },
} as const
