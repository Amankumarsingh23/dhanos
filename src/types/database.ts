export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account_balance_snapshots: {
        Row: {
          account_id: string;
          as_of_date: string;
          balance_minor_units: number;
          created_at: string;
          currency_code: string;
          household_id: string;
          id: string;
          notes: string | null;
          source: string;
        };
        Insert: {
          account_id: string;
          as_of_date: string;
          balance_minor_units: number;
          created_at?: string;
          currency_code: string;
          household_id: string;
          id?: string;
          notes?: string | null;
          source?: string;
        };
        Update: {
          account_id?: string;
          as_of_date?: string;
          balance_minor_units?: number;
          created_at?: string;
          currency_code?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_balance_snapshots_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_balance_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_events: {
        Row: {
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          event_type: string;
          household_id: string;
          id: string;
          metadata: Json;
        };
        Insert: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          event_type: string;
          household_id: string;
          id?: string;
          metadata?: Json;
        };
        Update: {
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          event_type?: string;
          household_id?: string;
          id?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      attachments: {
        Row: {
          attachable_id: string;
          attachable_type: string;
          created_at: string;
          file_name: string;
          household_id: string;
          id: string;
          mime_type: string | null;
          notes: string | null;
          size_bytes: number | null;
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          attachable_id: string;
          attachable_type: string;
          created_at?: string;
          file_name: string;
          household_id: string;
          id?: string;
          mime_type?: string | null;
          notes?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          attachable_id?: string;
          attachable_type?: string;
          created_at?: string;
          file_name?: string;
          household_id?: string;
          id?: string;
          mime_type?: string | null;
          notes?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_accounts: {
        Row: {
          account_type: string;
          closed_date: string | null;
          created_at: string;
          currency_code: string;
          household_id: string;
          id: string;
          include_in_net_worth: boolean;
          institution_id: string | null;
          is_active: boolean;
          masked_identifier: string | null;
          name: string;
          notes: string | null;
          opened_date: string | null;
          opening_balance_minor_units: number;
          owner_person_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_type: string;
          closed_date?: string | null;
          created_at?: string;
          currency_code: string;
          household_id: string;
          id?: string;
          include_in_net_worth?: boolean;
          institution_id?: string | null;
          is_active?: boolean;
          masked_identifier?: string | null;
          name: string;
          notes?: string | null;
          opened_date?: string | null;
          opening_balance_minor_units?: number;
          owner_person_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type?: string;
          closed_date?: string | null;
          created_at?: string;
          currency_code?: string;
          household_id?: string;
          id?: string;
          include_in_net_worth?: boolean;
          institution_id?: string | null;
          is_active?: boolean;
          masked_identifier?: string | null;
          name?: string;
          notes?: string | null;
          opened_date?: string | null;
          opening_balance_minor_units?: number;
          owner_person_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_accounts_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_accounts_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      household_memberships: {
        Row: {
          created_at: string;
          date_of_birth: string | null;
          household_id: string;
          id: string;
          joined_at: string;
          role: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date_of_birth?: string | null;
          household_id: string;
          id?: string;
          joined_at?: string;
          role: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date_of_birth?: string | null;
          household_id?: string;
          id?: string;
          joined_at?: string;
          role?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          base_currency_code: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          financial_month_start_day: number;
          id: string;
          name: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          base_currency_code?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          financial_month_start_day?: number;
          id?: string;
          name: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          base_currency_code?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          financial_month_start_day?: number;
          id?: string;
          name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      institutions: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          institution_type: string;
          is_archived: boolean;
          name: string;
          notes: string | null;
          platform_name: string | null;
          support_email: string | null;
          support_phone: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          institution_type: string;
          is_archived?: boolean;
          name: string;
          notes?: string | null;
          platform_name?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          institution_type?: string;
          is_archived?: boolean;
          name?: string;
          notes?: string | null;
          platform_name?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "institutions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      net_worth_snapshots: {
        Row: {
          as_of_date: string;
          created_at: string;
          currency_code: string;
          household_id: string;
          id: string;
          total_assets_minor_units: number;
          total_liabilities_minor_units: number;
        };
        Insert: {
          as_of_date: string;
          created_at?: string;
          currency_code: string;
          household_id: string;
          id?: string;
          total_assets_minor_units: number;
          total_liabilities_minor_units: number;
        };
        Update: {
          as_of_date?: string;
          created_at?: string;
          currency_code?: string;
          household_id?: string;
          id?: string;
          total_assets_minor_units?: number;
          total_liabilities_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      people: {
        Row: {
          birth_date: string | null;
          created_at: string;
          display_name: string;
          household_id: string;
          id: string;
          is_active: boolean;
          notes: string | null;
          relationship_type: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          birth_date?: string | null;
          created_at?: string;
          display_name: string;
          household_id: string;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          relationship_type: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          birth_date?: string | null;
          created_at?: string;
          display_name?: string;
          household_id?: string;
          id?: string;
          is_active?: boolean;
          notes?: string | null;
          relationship_type?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "people_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          default_currency_code: string;
          full_name: string | null;
          id: string;
          locale: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          default_currency_code?: string;
          full_name?: string | null;
          id: string;
          locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          default_currency_code?: string;
          full_name?: string | null;
          id?: string;
          locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recurring_rules: {
        Row: {
          account_id: string;
          amount_minor_units: number;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          is_active: boolean;
          kind: string;
          last_generated_date: string | null;
          name: string;
          next_due_date: string;
          notes: string | null;
          start_date: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor_units: number;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          currency_code: string;
          end_date?: string | null;
          frequency: string;
          household_id: string;
          id?: string;
          interval_count?: number;
          is_active?: boolean;
          kind: string;
          last_generated_date?: string | null;
          name: string;
          next_due_date: string;
          notes?: string | null;
          start_date: string;
          transfer_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor_units?: number;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          currency_code?: string;
          end_date?: string | null;
          frequency?: string;
          household_id?: string;
          id?: string;
          interval_count?: number;
          is_active?: boolean;
          kind?: string;
          last_generated_date?: string | null;
          name?: string;
          next_due_date?: string;
          notes?: string | null;
          start_date?: string;
          transfer_account_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rules_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rules_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rules_transfer_account_id_fkey";
            columns: ["transfer_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_categories: {
        Row: {
          category_kind: string;
          classification: string | null;
          color: string | null;
          created_at: string;
          household_id: string;
          icon: string | null;
          id: string;
          is_archived: boolean;
          is_system_default: boolean;
          name: string;
          parent_category_id: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category_kind: string;
          classification?: string | null;
          color?: string | null;
          created_at?: string;
          household_id: string;
          icon?: string | null;
          id?: string;
          is_archived?: boolean;
          is_system_default?: boolean;
          name: string;
          parent_category_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category_kind?: string;
          classification?: string | null;
          color?: string | null;
          created_at?: string;
          household_id?: string;
          icon?: string | null;
          id?: string;
          is_archived?: boolean;
          is_system_default?: boolean;
          name?: string;
          parent_category_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_categories_parent_category_id_fkey";
            columns: ["parent_category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_splits: {
        Row: {
          amount_minor_units: number;
          category_id: string;
          created_at: string;
          household_id: string;
          id: string;
          notes: string | null;
          transaction_id: string;
          updated_at: string;
        };
        Insert: {
          amount_minor_units: number;
          category_id: string;
          created_at?: string;
          household_id: string;
          id?: string;
          notes?: string | null;
          transaction_id: string;
          updated_at?: string;
        };
        Update: {
          amount_minor_units?: number;
          category_id?: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          transaction_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_splits_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          amount_minor_units: number;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          household_id: string;
          id: string;
          kind: string;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor_units: number;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          description?: string | null;
          household_id: string;
          id?: string;
          kind: string;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date: string;
          transfer_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor_units?: number;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          description?: string | null;
          household_id?: string;
          id?: string;
          kind?: string;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date?: string;
          transfer_account_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey";
            columns: ["recurring_rule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_related_person_id_fkey";
            columns: ["related_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_reverses_transaction_id_fkey";
            columns: ["reverses_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_reverses_transaction_id_fkey";
            columns: ["reverses_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey";
            columns: ["transfer_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      cash_flow_transactions: {
        Row: {
          account_id: string | null;
          amount_minor_units: number | null;
          category_id: string | null;
          counterparty: string | null;
          created_at: string | null;
          created_by: string | null;
          currency_code: string | null;
          description: string | null;
          household_id: string | null;
          id: string | null;
          kind: string | null;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string | null;
          status: string | null;
          transaction_date: string | null;
          transfer_account_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          account_id?: string | null;
          amount_minor_units?: number | null;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          currency_code?: string | null;
          description?: string | null;
          household_id?: string | null;
          id?: string | null;
          kind?: string | null;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string | null;
          status?: string | null;
          transaction_date?: string | null;
          transfer_account_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          account_id?: string | null;
          amount_minor_units?: number | null;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          currency_code?: string | null;
          description?: string | null;
          household_id?: string | null;
          id?: string | null;
          kind?: string | null;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string | null;
          status?: string | null;
          transaction_date?: string | null;
          transfer_account_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey";
            columns: ["recurring_rule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_related_person_id_fkey";
            columns: ["related_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_reverses_transaction_id_fkey";
            columns: ["reverses_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_reverses_transaction_id_fkey";
            columns: ["reverses_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey";
            columns: ["transfer_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      create_transaction_with_splits: {
        Args: {
          p_account_id: string;
          p_amount_minor_units: number;
          p_category_id?: string;
          p_counterparty?: string;
          p_currency_code: string;
          p_description?: string;
          p_household_id: string;
          p_kind: string;
          p_recurring_rule_id?: string;
          p_related_person_id?: string;
          p_reverses_transaction_id?: string;
          p_source_type?: string;
          p_splits?: Json;
          p_status?: string;
          p_transaction_date: string;
          p_transfer_account_id?: string;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          household_id: string;
          id: string;
          kind: string;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "transactions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_or_create_household: {
        Args: {
          p_base_currency_code: string;
          p_financial_month_start_day: number;
          p_name: string;
          p_timezone: string;
        };
        Returns: string;
      };
      household_role: {
        Args: { target_household_id: string };
        Returns: string;
      };
      is_household_member: {
        Args: { target_household_id: string };
        Returns: boolean;
      };
      record_account_balance_correction: {
        Args: {
          p_account_id: string;
          p_as_of_date: string;
          p_confirmed_balance_minor_units: number;
          p_household_id: string;
          p_notes?: string;
          p_prior_calculated_balance_minor_units: number;
        };
        Returns: {
          adjustment_transaction_id: string;
          snapshot_id: string;
        }[];
      };
      seed_default_transaction_categories: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      transaction_amount_matches_splits: {
        Args: { p_transaction_id: string };
        Returns: boolean;
      };
      update_transaction_with_splits: {
        Args: {
          p_account_id: string;
          p_amount_minor_units: number;
          p_category_id?: string;
          p_counterparty?: string;
          p_currency_code: string;
          p_description?: string;
          p_household_id: string;
          p_kind: string;
          p_recurring_rule_id?: string;
          p_related_person_id?: string;
          p_reverses_transaction_id?: string;
          p_source_type?: string;
          p_splits?: Json;
          p_status?: string;
          p_transaction_date: string;
          p_transaction_id: string;
          p_transfer_account_id?: string;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          household_id: string;
          id: string;
          kind: string;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "transactions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
