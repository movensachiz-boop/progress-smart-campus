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
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_label: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_label?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          target_role: string
          term_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          target_role?: string
          term_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          target_role?: string
          term_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          role: string | null
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          role?: string | null
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          marked_by: string | null
          notes: string | null
          status: string
          student_profile_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: string
          student_profile_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: string
          student_profile_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_document_patterns: {
        Row: {
          bank_name: string
          created_at: string
          id: string
          id_regex: string
          sample_reference: string | null
          swift_code: string
          transaction_id_format: string
          updated_at: string
        }
        Insert: {
          bank_name: string
          created_at?: string
          id?: string
          id_regex: string
          sample_reference?: string | null
          swift_code: string
          transaction_id_format: string
          updated_at?: string
        }
        Update: {
          bank_name?: string
          created_at?: string
          id?: string
          id_regex?: string
          sample_reference?: string | null
          swift_code?: string
          transaction_id_format?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_teacher_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          teacher_user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          teacher_user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          teacher_user_id?: string
        }
        Relationships: []
      }
      device_sessions: {
        Row: {
          created_at: string
          device_fingerprint: string
          id: string
          ip_address: string
          last_active_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          id?: string
          ip_address: string
          last_active_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          id?: string
          ip_address?: string
          last_active_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exam_comments: {
        Row: {
          author_user_id: string
          comment: string
          comment_type: string
          created_at: string
          exam_id: string
          id: string
          student_profile_id: string
          subject_code: string | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          comment?: string
          comment_type: string
          created_at?: string
          exam_id: string
          id?: string
          student_profile_id: string
          subject_code?: string | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          comment?: string
          comment_type?: string
          created_at?: string
          exam_id?: string
          id?: string
          student_profile_id?: string
          subject_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          created_at: string
          entered_by: string | null
          exam_id: string
          grade: string | null
          id: string
          mark: number | null
          points: number | null
          student_profile_id: string
          subject_code: string
          subject_name: string | null
          term_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          exam_id: string
          grade?: string | null
          id?: string
          mark?: number | null
          points?: number | null
          student_profile_id: string
          subject_code: string
          subject_name?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          exam_id?: string
          grade?: string | null
          id?: string
          mark?: number | null
          points?: number | null
          student_profile_id?: string
          subject_code?: string
          subject_name?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          created_by: string | null
          exam_type: string
          form_levels: number[]
          id: string
          name: string
          published: boolean
          term: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          exam_type?: string
          form_levels?: number[]
          id?: string
          name: string
          published?: boolean
          term?: number
          updated_at?: string
          year?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          exam_type?: string
          form_levels?: number[]
          id?: string
          name?: string
          published?: boolean
          term?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      fee_requirements: {
        Row: {
          amount: number
          beginner_only: boolean
          category: string
          created_at: string
          currency: string
          form_levels: string[]
          gender: string
          id: string
          is_active: boolean
          item_name: string
          learning_area: string | null
          notes: string | null
          residency: string
          returning_only: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount?: number
          beginner_only?: boolean
          category?: string
          created_at?: string
          currency?: string
          form_levels?: string[]
          gender?: string
          id?: string
          is_active?: boolean
          item_name: string
          learning_area?: string | null
          notes?: string | null
          residency?: string
          returning_only?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          beginner_only?: boolean
          category?: string
          created_at?: string
          currency?: string
          form_levels?: string[]
          gender?: string
          id?: string
          is_active?: boolean
          item_name?: string
          learning_area?: string | null
          notes?: string | null
          residency?: string
          returning_only?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fund_expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          fund_id: string
          id: string
          spent_at: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          fund_id: string
          id?: string
          spent_at?: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          fund_id?: string
          id?: string
          spent_at?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_expenses_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_expenses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          note: string | null
          received_at: string
          reference: string | null
          source: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          note?: string | null
          received_at?: string
          reference?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          note?: string | null
          received_at?: string
          reference?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      goods_received: {
        Row: {
          cash_given: number | null
          change_amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          grn_number: string | null
          id: string
          items: Json
          notes: string | null
          purchase_order_id: string | null
          receipt_urls: string[] | null
          received_by: string | null
          received_date: string
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          cash_given?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          grn_number?: string | null
          id?: string
          items?: Json
          notes?: string | null
          purchase_order_id?: string | null
          receipt_urls?: string[] | null
          received_by?: string | null
          received_date?: string
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cash_given?: number | null
          change_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          grn_number?: string | null
          id?: string
          items?: Json
          notes?: string | null
          purchase_order_id?: string | null
          receipt_urls?: string[] | null
          received_by?: string | null
          received_date?: string
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          currency: string
          fee_requirement_id: string | null
          form_levels: string[]
          gender: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          name: string
          notes: string | null
          price: number
          sort_order: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          fee_requirement_id?: string | null
          form_levels?: string[]
          gender?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          notes?: string | null
          price?: number
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          fee_requirement_id?: string | null
          form_levels?: string[]
          gender?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          notes?: string | null
          price?: number
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_fee_requirement_id_fkey"
            columns: ["fee_requirement_id"]
            isOneToOne: false
            referencedRelation: "fee_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sales: {
        Row: {
          cashier_user_id: string | null
          created_at: string
          currency: string
          id: string
          items: Json
          method: string
          notes: string | null
          receipt_number: string | null
          status: string
          student_profile_id: string | null
          term_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          cashier_user_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          items?: Json
          method?: string
          notes?: string | null
          receipt_number?: string | null
          status?: string
          student_profile_id?: string | null
          term_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cashier_user_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          items?: Json
          method?: string
          notes?: string | null
          receipt_number?: string | null
          status?: string
          student_profile_id?: string | null
          term_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sales_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sales_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sales_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_issues: {
        Row: {
          created_at: string
          id: string
          issue_date: string
          issue_number: string | null
          issued_by: string | null
          item_id: string
          notes: string | null
          purpose: string | null
          quantity: number
          term_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_date?: string
          issue_number?: string | null
          issued_by?: string | null
          item_id: string
          notes?: string | null
          purpose?: string | null
          quantity: number
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_date?: string
          issue_number?: string | null
          issued_by?: string | null
          item_id?: string
          notes?: string | null
          purpose?: string | null
          quantity?: number
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_issues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kitchen_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_issues_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_items: {
        Row: {
          category: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          name: string
          notes: string | null
          stock_quantity: number
          supplier: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          notes?: string | null
          stock_quantity?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          notes?: string | null
          stock_quantity?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      kitchen_meals: {
        Row: {
          cost_per_portion: number
          created_at: string
          id: string
          ingredients: Json
          meal_date: string
          meal_name: string
          meal_number: string | null
          meal_type: string
          notes: string | null
          portions_served: number
          prepared_by: string | null
          term_id: string | null
          total_cost: number
          updated_at: string
        }
        Insert: {
          cost_per_portion?: number
          created_at?: string
          id?: string
          ingredients?: Json
          meal_date?: string
          meal_name: string
          meal_number?: string | null
          meal_type?: string
          notes?: string | null
          portions_served?: number
          prepared_by?: string | null
          term_id?: string | null
          total_cost?: number
          updated_at?: string
        }
        Update: {
          cost_per_portion?: number
          created_at?: string
          id?: string
          ingredients?: Json
          meal_date?: string
          meal_name?: string
          meal_number?: string | null
          meal_type?: string
          notes?: string | null
          portions_served?: number
          prepared_by?: string | null
          term_id?: string | null
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_meals_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_receipts: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          invoice_number: string | null
          item_id: string
          notes: string | null
          quantity: number
          receipt_number: string | null
          received_by: string | null
          supplier: string | null
          total_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_number?: string | null
          item_id: string
          notes?: string | null
          quantity: number
          receipt_number?: string | null
          received_by?: string | null
          supplier?: string | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          invoice_number?: string | null
          item_id?: string
          notes?: string | null
          quantity?: number
          receipt_number?: string | null
          received_by?: string | null
          supplier?: string | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_receipts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kitchen_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after_data: Json | null
          amount: number | null
          before_data: Json | null
          created_at: string
          currency: string | null
          id: string
          method: string | null
          note: string | null
          payment_id: string | null
          receipt_number: string | null
          status: string | null
          student_profile_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          amount?: number | null
          before_data?: Json | null
          created_at?: string
          currency?: string | null
          id?: string
          method?: string | null
          note?: string | null
          payment_id?: string | null
          receipt_number?: string | null
          status?: string | null
          student_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          amount?: number | null
          before_data?: Json | null
          created_at?: string
          currency?: string | null
          id?: string
          method?: string | null
          note?: string | null
          payment_id?: string | null
          receipt_number?: string | null
          status?: string | null
          student_profile_id?: string | null
        }
        Relationships: []
      }
      payment_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_auto: boolean
          name: string
          row_count: number
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name: string
          row_count?: number
          snapshot_data: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name?: string
          row_count?: number
          snapshot_data?: Json
        }
        Relationships: []
      }
      payment_vouchers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          method: string
          notes: string | null
          paid_by: string
          paid_to: string
          payment_date: string
          purchase_order_id: string | null
          received_by: string
          supplier_name: string | null
          updated_at: string
          voucher_number: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          paid_by: string
          paid_to: string
          payment_date?: string
          purchase_order_id?: string | null
          received_by: string
          supplier_name?: string | null
          updated_at?: string
          voucher_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          paid_by?: string
          paid_to?: string
          payment_date?: string
          purchase_order_id?: string | null
          received_by?: string
          supplier_name?: string | null
          updated_at?: string
          voucher_number?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          currency: string
          deposit_slip_url: string | null
          description: string | null
          document_fingerprint: string | null
          id: string
          method: string
          paynow_reference: string | null
          phone: string | null
          poll_url: string | null
          receipt_number: string | null
          status: string
          student_profile_id: string
          swift_code: string | null
          term_id: string | null
          transaction_id_format: string | null
          updated_at: string
          verification_hash: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          currency?: string
          deposit_slip_url?: string | null
          description?: string | null
          document_fingerprint?: string | null
          id?: string
          method: string
          paynow_reference?: string | null
          phone?: string | null
          poll_url?: string | null
          receipt_number?: string | null
          status?: string
          student_profile_id: string
          swift_code?: string | null
          term_id?: string | null
          transaction_id_format?: string | null
          updated_at?: string
          verification_hash?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          currency?: string
          deposit_slip_url?: string | null
          description?: string | null
          document_fingerprint?: string | null
          id?: string
          method?: string
          paynow_reference?: string | null
          phone?: string | null
          poll_url?: string | null
          receipt_number?: string | null
          status?: string
          student_profile_id?: string
          swift_code?: string | null
          term_id?: string | null
          transaction_id_format?: string | null
          updated_at?: string
          verification_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      prepaid_accounts: {
        Row: {
          created_at: string
          currency: string
          default_unit_price: number
          id: string
          is_active: boolean
          item_name: string
          notes: string | null
          supplier_name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_unit_price?: number
          id?: string
          is_active?: boolean
          item_name: string
          notes?: string | null
          supplier_name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_unit_price?: number
          id?: string
          is_active?: boolean
          item_name?: string
          notes?: string | null
          supplier_name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prepaid_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          entry_type: string
          id: string
          note: string | null
          occurred_on: string
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          created_at?: string
          entry_type: string
          id?: string
          note?: string | null
          occurred_on?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          entry_type?: string
          id?: string
          note?: string | null
          occurred_on?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prepaid_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "prepaid_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergies: string | null
          balance: number
          blood_group: string | null
          claimed: boolean
          created_at: string
          date_of_birth: string | null
          doctor_contact: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          first_name: string
          form: string | null
          gender: string
          guardian_address: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_occupation: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          guardian2_email: string | null
          guardian2_name: string | null
          guardian2_phone: string | null
          guardian2_relationship: string | null
          home_address: string | null
          id: string
          is_beginner: boolean
          last_name: string
          medical_conditions: string | null
          national_id: string | null
          nationality: string | null
          phone: string | null
          previous_school: string | null
          profile_completed: boolean
          registration_number: string
          residency: string
          selfie_url: string | null
          status: string
          stream: string | null
          updated_at: string
          user_id: string | null
          year_joined: string | null
        }
        Insert: {
          allergies?: string | null
          balance?: number
          blood_group?: string | null
          claimed?: boolean
          created_at?: string
          date_of_birth?: string | null
          doctor_contact?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name: string
          form?: string | null
          gender?: string
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_occupation?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          guardian2_email?: string | null
          guardian2_name?: string | null
          guardian2_phone?: string | null
          guardian2_relationship?: string | null
          home_address?: string | null
          id?: string
          is_beginner?: boolean
          last_name: string
          medical_conditions?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          previous_school?: string | null
          profile_completed?: boolean
          registration_number: string
          residency?: string
          selfie_url?: string | null
          status?: string
          stream?: string | null
          updated_at?: string
          user_id?: string | null
          year_joined?: string | null
        }
        Update: {
          allergies?: string | null
          balance?: number
          blood_group?: string | null
          claimed?: boolean
          created_at?: string
          date_of_birth?: string | null
          doctor_contact?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          first_name?: string
          form?: string | null
          gender?: string
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_occupation?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          guardian2_email?: string | null
          guardian2_name?: string | null
          guardian2_phone?: string | null
          guardian2_relationship?: string | null
          home_address?: string | null
          id?: string
          is_beginner?: boolean
          last_name?: string
          medical_conditions?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          previous_school?: string | null
          profile_completed?: boolean
          registration_number?: string
          residency?: string
          selfie_url?: string | null
          status?: string
          stream?: string | null
          updated_at?: string
          user_id?: string | null
          year_joined?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          expected_delivery: string | null
          id: string
          items: Json
          notes: string | null
          po_number: string | null
          requisition_id: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_delivery?: string | null
          id?: string
          items?: Json
          notes?: string | null
          po_number?: string | null
          requisition_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_delivery?: string | null
          id?: string
          items?: Json
          notes?: string | null
          po_number?: string | null
          requisition_id?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      requisition_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_auto: boolean
          name: string
          row_count: number
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name: string
          row_count?: number
          snapshot_data: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name?: string
          row_count?: number
          snapshot_data?: Json
        }
        Relationships: []
      }
      requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          department: string | null
          id: string
          image_url: string | null
          items: Json
          notes: string | null
          purpose: string | null
          requested_by: string
          requisition_number: string | null
          status: string
          term_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          id?: string
          image_url?: string | null
          items?: Json
          notes?: string | null
          purpose?: string | null
          requested_by: string
          requisition_number?: string | null
          status?: string
          term_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          id?: string
          image_url?: string | null
          items?: Json
          notes?: string | null
          purpose?: string | null
          requested_by?: string
          requisition_number?: string | null
          status?: string
          term_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      student_class_terms: {
        Row: {
          created_at: string
          form: string | null
          stream: string | null
          student_profile_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          form?: string | null
          stream?: string | null
          student_profile_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          form?: string | null
          stream?: string | null
          student_profile_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_class_terms_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_class_terms_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_class_terms_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          is_current: boolean
          started_at: string
          term_number: number
          year: number
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_current?: boolean
          started_at?: string
          term_number: number
          year: number
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          is_current?: boolean
          started_at?: string
          term_number?: number
          year?: number
        }
        Relationships: []
      }
      timetable_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_auto: boolean
          name: string
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name: string
          snapshot_data: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_auto?: boolean
          name?: string
          snapshot_data?: Json
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
          role: Database["public"]["Enums"]["app_role"]
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
      student_roster: {
        Row: {
          first_name: string | null
          form: string | null
          id: string | null
          last_name: string | null
          registration_number: string | null
          status: string | null
          stream: string | null
        }
        Insert: {
          first_name?: string | null
          form?: string | null
          id?: string | null
          last_name?: string | null
          registration_number?: string | null
          status?: string | null
          stream?: string | null
        }
        Update: {
          first_name?: string | null
          form?: string | null
          id?: string | null
          last_name?: string | null
          registration_number?: string | null
          status?: string | null
          stream?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_term_id: { Args: never; Returns: string }
      get_exam_analytics: {
        Args: { p_exam_id: string }
        Returns: {
          my_avg: number
          my_rank: number
          pass_rate: number
          top_student_avg: number
          top_student_name: string
          total_students: number
        }[]
      }
      get_student_fee_summary: {
        Args: never
        Returns: {
          balance: number
          payment_status: string
          profile_id: string
          total_fees: number
          total_paid: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_document_fingerprint: {
        Args: {
          p_amount: string
          p_bank_name: string
          p_swift_code: string
          p_transaction_id_format: string
        }
        Returns: {
          match_found: boolean
          matching_payment_id: string
          matching_receipt_number: string
          matching_student: string
        }[]
      }
      verify_payment_hash: {
        Args: {
          p_amount: string
          p_created_at: string
          p_receipt_number: string
          p_stored_hash: string
          p_student_profile_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "student"
        | "teacher"
        | "owner"
        | "cashier"
        | "timetable_manager"
        | "kitchen"
        | "principal"
        | "it_assistant"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "admin",
        "student",
        "teacher",
        "owner",
        "cashier",
        "timetable_manager",
        "kitchen",
        "principal",
        "it_assistant",
      ],
    },
  },
} as const
