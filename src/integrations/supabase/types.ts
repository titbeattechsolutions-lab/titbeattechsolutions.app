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
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: number
          performed_by: string | null
          school_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: number
          performed_by?: string | null
          school_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: number
          performed_by?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          absent_count: number
          academic_year: string
          class_id: string
          class_name: string
          created_at: string | null
          date: string
          id: string
          present_count: number
          records: Json
          school_id: string
          taken_by: string
          taken_by_name: string
          term: string
        }
        Insert: {
          absent_count?: number
          academic_year: string
          class_id: string
          class_name: string
          created_at?: string | null
          date: string
          id?: string
          present_count?: number
          records?: Json
          school_id: string
          taken_by: string
          taken_by_name: string
          term: string
        }
        Update: {
          absent_count?: number
          academic_year?: string
          class_id?: string
          class_name?: string
          created_at?: string | null
          date?: string
          id?: string
          present_count?: number
          records?: Json
          school_id?: string
          taken_by?: string
          taken_by_name?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      billing: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          id: string
          plan: string
          school_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          school_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          plan?: string
          school_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year: string
          arm: string | null
          class_teacher_id: string | null
          class_teacher_name: string | null
          created_at: string | null
          id: string
          level: string | null
          name: string
          school_id: string
          student_count: number
          term: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          arm?: string | null
          class_teacher_id?: string | null
          class_teacher_name?: string | null
          created_at?: string | null
          id?: string
          level?: string | null
          name: string
          school_id: string
          student_count?: number
          term: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          arm?: string | null
          class_teacher_id?: string | null
          class_teacher_name?: string | null
          created_at?: string | null
          id?: string
          level?: string | null
          name?: string
          school_id?: string
          student_count?: number
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          academic_year: string
          amount: number
          applicable_to: string[] | null
          created_at: string | null
          currency: string
          due_date: string | null
          id: string
          name: string
          school_id: string
          term: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          amount: number
          applicable_to?: string[] | null
          created_at?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          name: string
          school_id: string
          term: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          amount?: number
          applicable_to?: string[] | null
          created_at?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          name?: string
          school_id?: string
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fees_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          channel: string | null
          created_at: string | null
          currency: string
          fee_id: string
          fee_name: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reference: string | null
          school_id: string
          status: string
          student_id: string
          student_name: string
        }
        Insert: {
          amount: number
          channel?: string | null
          created_at?: string | null
          currency?: string
          fee_id: string
          fee_name: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reference?: string | null
          school_id: string
          status?: string
          student_id: string
          student_name: string
        }
        Update: {
          amount?: number
          channel?: string | null
          created_at?: string | null
          currency?: string
          fee_id?: string
          fee_name?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reference?: string | null
          school_id?: string
          status?: string
          student_id?: string
          student_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_bridge_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          subject_id: string | null
          subject_kind: string
          tenant_id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          subject_id?: string | null
          subject_kind: string
          tenant_id: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          subject_id?: string | null
          subject_kind?: string
          tenant_id?: string
          token?: string
        }
        Relationships: []
      }
      pin_sessions: {
        Row: {
          auth_user_id: string
          created_at: string
          expires_at: string
          revoked_at: string | null
          school_id: string | null
          subject_id: string | null
          subject_kind: string
          tenant_id: string
          token: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
          school_id?: string | null
          subject_id?: string | null
          subject_kind: string
          tenant_id: string
          token: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
          school_id?: string | null
          subject_id?: string | null
          subject_kind?: string
          tenant_id?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          role: string
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          role?: string
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          academic_year: string
          admission_no: string
          attendance_rate: number | null
          average_score: number
          class_id: string
          class_name: string
          created_at: string | null
          date_issued: string | null
          days_absent: number | null
          days_in_term: number | null
          days_open: number | null
          days_present: number | null
          email_sent: boolean | null
          email_sent_at: string | null
          email_sent_by: string | null
          generated_by: string | null
          grade: string | null
          id: string
          next_term_begins: string | null
          position_in_class: number | null
          principal_comment: string | null
          principal_remark: string | null
          remark: string | null
          school_id: string
          signature: string | null
          status: string
          student_class: string | null
          student_id: string
          student_name: string
          teacher_comment: string | null
          teacher_remark: string | null
          term: string
          total_score: number
          total_subjects: number
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          admission_no: string
          attendance_rate?: number | null
          average_score?: number
          class_id: string
          class_name: string
          created_at?: string | null
          date_issued?: string | null
          days_absent?: number | null
          days_in_term?: number | null
          days_open?: number | null
          days_present?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          generated_by?: string | null
          grade?: string | null
          id?: string
          next_term_begins?: string | null
          position_in_class?: number | null
          principal_comment?: string | null
          principal_remark?: string | null
          remark?: string | null
          school_id: string
          signature?: string | null
          status?: string
          student_class?: string | null
          student_id: string
          student_name: string
          teacher_comment?: string | null
          teacher_remark?: string | null
          term: string
          total_score?: number
          total_subjects?: number
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          admission_no?: string
          attendance_rate?: number | null
          average_score?: number
          class_id?: string
          class_name?: string
          created_at?: string | null
          date_issued?: string | null
          days_absent?: number | null
          days_in_term?: number | null
          days_open?: number | null
          days_present?: number | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          email_sent_by?: string | null
          generated_by?: string | null
          grade?: string | null
          id?: string
          next_term_begins?: string | null
          position_in_class?: number | null
          principal_comment?: string | null
          principal_remark?: string | null
          remark?: string | null
          school_id?: string
          signature?: string | null
          status?: string
          student_class?: string | null
          student_id?: string
          student_name?: string
          teacher_comment?: string | null
          teacher_remark?: string | null
          term?: string
          total_score?: number
          total_subjects?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          academic_year: string
          admission_no: string
          class_id: string
          class_name: string
          created_at: string | null
          grade: string | null
          id: string
          remark: string | null
          school_id: string
          score_ca1: number | null
          score_ca2: number | null
          score_exam: number | null
          score_total: number | null
          student_id: string
          student_name: string
          subject_id: string
          subject_name: string
          teacher_comment: string | null
          teacher_id: string | null
          term: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          admission_no: string
          class_id: string
          class_name: string
          created_at?: string | null
          grade?: string | null
          id?: string
          remark?: string | null
          school_id: string
          score_ca1?: number | null
          score_ca2?: number | null
          score_exam?: number | null
          score_total?: number | null
          student_id: string
          student_name: string
          subject_id: string
          subject_name: string
          teacher_comment?: string | null
          teacher_id?: string | null
          term: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          admission_no?: string
          class_id?: string
          class_name?: string
          created_at?: string | null
          grade?: string | null
          id?: string
          remark?: string | null
          school_id?: string
          score_ca1?: number | null
          score_ca2?: number | null
          score_exam?: number | null
          score_total?: number | null
          student_id?: string
          student_name?: string
          subject_id?: string
          subject_name?: string
          teacher_comment?: string | null
          teacher_id?: string | null
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_requests: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          admin_email: string
          admin_name: string
          created_at: string
          id: string
          phone: string | null
          plan: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_code: string
          school_name: string
          status: string
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          admin_email: string
          admin_name: string
          created_at?: string
          id?: string
          phone?: string | null
          plan?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_code: string
          school_name: string
          status?: string
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          admin_email?: string
          admin_name?: string
          created_at?: string
          id?: string
          phone?: string | null
          plan?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_code?: string
          school_name?: string
          status?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          academic_year: string | null
          address_city: string | null
          address_country: string | null
          address_state: string | null
          address_street: string | null
          code: string
          created_at: string | null
          current_students: number
          current_term: string | null
          email: string | null
          features: Json | null
          id: string
          logo: string | null
          max_students: number
          name: string
          phone: string | null
          status: string
          tenant_id: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year?: string | null
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_street?: string | null
          code: string
          created_at?: string | null
          current_students?: number
          current_term?: string | null
          email?: string | null
          features?: Json | null
          id?: string
          logo?: string | null
          max_students?: number
          name: string
          phone?: string | null
          status?: string
          tenant_id?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: string | null
          address_city?: string | null
          address_country?: string | null
          address_state?: string | null
          address_street?: string | null
          code?: string
          created_at?: string | null
          current_students?: number
          current_term?: string | null
          email?: string | null
          features?: Json | null
          id?: string
          logo?: string | null
          max_students?: number
          name?: string
          phone?: string | null
          status?: string
          tenant_id?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      session_logs: {
        Row: {
          action: string
          created_at: string | null
          device: string | null
          id: string
          ip_address: string | null
          role: string
          school_id: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string | null
          device?: string | null
          id?: string
          ip_address?: string | null
          role: string
          school_id?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string | null
          device?: string | null
          id?: string
          ip_address?: string | null
          role?: string
          school_id?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          must_change_password: boolean
          role: string
          school_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          must_change_password?: boolean
          role?: string
          school_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          must_change_password?: boolean
          role?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invite_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          tenant_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invite_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_settings: {
        Row: {
          created_at: string | null
          school_id: string
          signature: string | null
          signature_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          school_id: string
          signature?: string | null
          signature_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          school_id?: string
          signature?: string | null
          signature_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_no: string
          auth_user_id: string | null
          class_id: string | null
          class_name: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          enrolled_at: string | null
          first_name: string
          gender: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          id: string
          is_active: boolean
          last_name: string
          must_change_password: boolean
          other_names: string | null
          photo: string | null
          pin_hash: string | null
          school_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          admission_no: string
          auth_user_id?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrolled_at?: string | null
          first_name: string
          gender?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          id?: string
          is_active?: boolean
          last_name: string
          must_change_password?: boolean
          other_names?: string | null
          photo?: string | null
          pin_hash?: string | null
          school_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          admission_no?: string
          auth_user_id?: string | null
          class_id?: string | null
          class_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrolled_at?: string | null
          first_name?: string
          gender?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          must_change_password?: boolean
          other_names?: string | null
          photo?: string | null
          pin_hash?: string | null
          school_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
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
      super_admin_bootstrap_tokens: {
        Row: {
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          expires_at: string
          id: string
          issued_by: string
          target_user_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          issued_by: string
          target_user_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string
          target_user_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      super_admin_token_audit: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          reason: string | null
          success: boolean
          target_user_id: string | null
          token_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          reason?: string | null
          success: boolean
          target_user_id?: string | null
          token_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          reason?: string | null
          success?: boolean
          target_user_id?: string | null
          token_id?: string | null
        }
        Relationships: []
      }
      teachers: {
        Row: {
          auth_user_id: string | null
          class_ids: string[] | null
          class_teacher_of: string | null
          created_at: string | null
          email: string | null
          employee_id: string | null
          first_name: string
          id: string
          is_class_teacher: boolean
          last_name: string
          phone: string | null
          pin_hash: string | null
          role: string
          school_id: string
          status: string
          subject_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          class_ids?: string[] | null
          class_teacher_of?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          first_name: string
          id?: string
          is_class_teacher?: boolean
          last_name: string
          phone?: string | null
          pin_hash?: string | null
          role?: string
          school_id: string
          status?: string
          subject_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          class_ids?: string[] | null
          class_teacher_of?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          first_name?: string
          id?: string
          is_class_teacher?: boolean
          last_name?: string
          phone?: string | null
          pin_hash?: string | null
          role?: string
          school_id?: string
          status?: string
          subject_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: number
          staff_id: string
          tenant_id: string
          timestamp: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: number
          staff_id: string
          tenant_id: string
          timestamp?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: number
          staff_id?: string
          tenant_id?: string
          timestamp?: string
        }
        Relationships: []
      }
      tenant_auth_audit: {
        Row: {
          created_at: string
          event_type: string
          id: string
          reason: string | null
          session_ref: string | null
          success: boolean
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          reason?: string | null
          session_ref?: string | null
          success: boolean
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          reason?: string | null
          session_ref?: string | null
          success?: boolean
          tenant_id?: string | null
        }
        Relationships: []
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
      tenant_members: {
        Row: {
          auth_user_id: string
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          auth_user_id: string
          id?: string
          role: string
          tenant_id: string
        }
        Update: {
          auth_user_id?: string
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_sessions: {
        Row: {
          created_at: string
          expires_at: string
          role: string | null
          staff_id: string | null
          student_id: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          role?: string | null
          staff_id?: string | null
          student_id?: string | null
          tenant_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          role?: string | null
          staff_id?: string | null
          student_id?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
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
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at: string | null
          subscription_starts_at: string | null
          tenant_code: string
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
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          tenant_code: string
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
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          tenant_code?: string
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          label: string
          school_id: string
          slot_type: string
          sort_order: number
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          label: string
          school_id: string
          slot_type?: string
          sort_order?: number
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          label?: string
          school_id?: string
          slot_type?: string
          sort_order?: number
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable: {
        Row: {
          academic_year: string
          class_id: string
          class_name: string
          created_at: string | null
          day: string
          end_time: string
          id: string
          notes: string | null
          period_number: number
          period_type: string
          room: string | null
          school_id: string
          start_time: string
          subject_id: string | null
          subject_name: string | null
          teacher_id: string | null
          teacher_name: string | null
          term: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          class_id: string
          class_name: string
          created_at?: string | null
          day: string
          end_time: string
          id?: string
          notes?: string | null
          period_number: number
          period_type?: string
          room?: string | null
          school_id: string
          start_time: string
          subject_id?: string | null
          subject_name?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          term: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          class_id?: string
          class_name?: string
          created_at?: string | null
          day?: string
          end_time?: string
          id?: string
          notes?: string | null
          period_number?: number
          period_type?: string
          room?: string | null
          school_id?: string
          start_time?: string
          subject_id?: string | null
          subject_name?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          term?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _is_bcrypt: { Args: { _hash: string }; Returns: boolean }
      _mint_bridge_token: {
        Args: { _subject_id: string; _subject_kind: string; _tenant_id: string }
        Returns: string
      }
      _session_ref: { Args: { _token: string }; Returns: string }
      _verify_pin_any: {
        Args: { _pin: string; _stored_hash: string }
        Returns: boolean
      }
      bridge_admin_pin: {
        Args: { _admin_pin: string; _school_pin: string }
        Returns: string
      }
      bridge_student_pin: {
        Args: {
          _admission_no: string
          _school_pin: string
          _student_pin: string
        }
        Returns: string
      }
      bridge_teacher_pin: {
        Args: {
          _employee_id: string
          _school_pin: string
          _teacher_pin: string
        }
        Returns: string
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      complete_password_change: { Args: never; Returns: boolean }
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
      find_duplicate_tenants: {
        Args: never
        Returns: {
          match_type: string
          match_value: string
          occurrences: number
          school_names: string[]
          tenant_ids: string[]
        }[]
      }
      generate_staff_invite_token: {
        Args: { _school_slug: string }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      get_all_session_logs: {
        Args: { _limit?: number }
        Returns: {
          action: string
          created_at: string
          device: string
          id: string
          ip_address: string
          role: string
          school_id: string
          user_id: string
          user_name: string
        }[]
      }
      get_login_history: {
        Args: { _auth_type: string; _identifier: string; _limit?: number }
        Returns: {
          event_type: string
          id: string
          ip_address: string
          timestamp: string
          user_agent: string
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_my_school_id: { Args: never; Returns: string }
      get_tenant_activity_logs: {
        Args: { _limit?: number; _tenant_id: string }
        Returns: {
          action: string
          details: string
          id: number
          staff_id: string
          timestamp: string
        }[]
      }
      get_tenant_by_slug: {
        Args: { _slug: string }
        Returns: {
          school_name: string
          status: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
        }[]
      }
      get_tenant_data: {
        Args: { _school_pin_hash: string; _tenant_id: string }
        Returns: Json
      }
      get_tenant_data_v2: { Args: { _session_token: string }; Returns: Json }
      get_today_attendance_by_class: {
        Args: { p_school_id: string }
        Returns: {
          absent_count: number
          class_id: string
          class_name: string
          present_count: number
          taken_at: string
          taken_by_name: string
        }[]
      }
      get_today_attendance_summary: {
        Args: { p_school_id: string }
        Returns: {
          attendance_rate: number
          total_absent: number
          total_classes_with_attendance: number
          total_present: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_school_admin: { Args: never; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      issue_super_admin_token: {
        Args: { _hours_valid?: number; _target_user_id: string }
        Returns: string
      }
      log_pin_session: {
        Args: {
          _event_type: string
          _role: string
          _session_token: string
          _tenant_id: string
          _user_agent?: string
        }
        Returns: undefined
      }
      log_tenant_activity: {
        Args: {
          _action: string
          _details?: string
          _staff_id: string
          _tenant_id: string
          _timestamp?: string
        }
        Returns: undefined
      }
      login_staff: {
        Args: { _first_name: string; _last_name: string; _school_id: string }
        Returns: {
          email: string
          must_change_password: boolean
        }[]
      }
      login_student: {
        Args: { _admission_no: string; _school_id: string }
        Returns: {
          email: string
          must_change_password: boolean
        }[]
      }
      pin_logout: { Args: { _session_token: string }; Returns: boolean }
      redeem_super_admin_token: { Args: { _token: string }; Returns: boolean }
      reset_school_pin: {
        Args: { _new_pin: string; _tenant_id: string }
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
      security_regression_check: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          passed: boolean
        }[]
      }
      set_admin_pin: {
        Args: { _pin_hash: string; _tenant_id: string }
        Returns: boolean
      }
      set_admin_pin_v2: {
        Args: { _pin: string; _session_token: string }
        Returns: boolean
      }
      set_student_pin: {
        Args: { _new_pin: string; _student_id: string }
        Returns: boolean
      }
      set_teacher_pin: {
        Args: { _new_pin: string; _teacher_id: string }
        Returns: boolean
      }
      superadmin_get_all_tenant_activity: {
        Args: { _limit?: number; _offset?: number; _school_id?: string }
        Returns: {
          action: string
          details: string
          id: number
          school_name: string
          staff_id: string
          tenant_id: string
          timestamp: string
          total_count: number
        }[]
      }
      suspend_duplicate_tenant: {
        Args: { _reason?: string; _tenant_id: string }
        Returns: boolean
      }
      upsert_staff_signature: {
        Args: {
          p_school_id: string
          p_signature: string
          p_signature_type: string
        }
        Returns: undefined
      }
      validate_school_pin: {
        Args: { _pin: string }
        Returns: {
          school_id: string
          school_name: string
          tenant_id: string
        }[]
      }
      validate_staff_invite_token: {
        Args: { _token: string }
        Returns: {
          plan: string
          school_name: string
          session_token: string
          status: string
          subscription_ends_at: string
          tenant_id: string
          trial_started_at: string
        }[]
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
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          subscription_ends_at: string
          tenant_id: string
          trial_started_at: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "school_admin" | "authorised_staff" | "student"
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
      app_role: ["super_admin", "school_admin", "authorised_staff", "student"],
      tenant_plan: ["trial", "termly", "yearly"],
      tenant_status: ["trial", "active", "expired", "suspended"],
    },
  },
} as const
