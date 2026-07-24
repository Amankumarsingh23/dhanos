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
          adjustment_transaction_id: string | null;
          as_of_date: string;
          balance_minor_units: number;
          calculated_balance_minor_units: number | null;
          created_at: string;
          currency_code: string;
          difference_minor_units: number | null;
          household_id: string;
          id: string;
          notes: string | null;
          source: string;
        };
        Insert: {
          account_id: string;
          adjustment_transaction_id?: string | null;
          as_of_date: string;
          balance_minor_units: number;
          calculated_balance_minor_units?: number | null;
          created_at?: string;
          currency_code: string;
          difference_minor_units?: number | null;
          household_id: string;
          id?: string;
          notes?: string | null;
          source?: string;
        };
        Update: {
          account_id?: string;
          adjustment_transaction_id?: string | null;
          as_of_date?: string;
          balance_minor_units?: number;
          calculated_balance_minor_units?: number | null;
          created_at?: string;
          currency_code?: string;
          difference_minor_units?: number | null;
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
            foreignKeyName: "account_balance_snapshots_adjustment_transaction_id_fkey";
            columns: ["adjustment_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_balance_snapshots_adjustment_transaction_id_fkey";
            columns: ["adjustment_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
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
      asset_valuation_snapshots: {
        Row: {
          appraiser: string | null;
          as_of_date: string;
          asset_id: string;
          confidence: string;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          household_id: string;
          id: string;
          notes: string | null;
          source: string;
          value_minor_units: number;
        };
        Insert: {
          appraiser?: string | null;
          as_of_date: string;
          asset_id: string;
          confidence?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          household_id: string;
          id?: string;
          notes?: string | null;
          source: string;
          value_minor_units: number;
        };
        Update: {
          appraiser?: string | null;
          as_of_date?: string;
          asset_id?: string;
          confidence?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          source?: string;
          value_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "asset_valuation_snapshots_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asset_valuation_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      assets: {
        Row: {
          acquisition_date: string;
          acquisition_type: string;
          acquisition_value_minor_units: number | null;
          area_unit: string | null;
          asset_group: string;
          category: string;
          condition: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          dispute_status: string | null;
          encumbrance_notes: string | null;
          encumbrance_status: string | null;
          generates_income: boolean;
          household_id: string;
          id: string;
          include_in_net_worth: boolean;
          income_notes: string | null;
          land_area: number | null;
          legal_heir_notes: string | null;
          liquidity_classification: string;
          location: string | null;
          location_precise: string | null;
          mutation_status: string | null;
          name: string;
          notes: string | null;
          occupancy: string | null;
          original_owner: string | null;
          owner_person_id: string;
          ownership_percentage: number;
          ownership_share_notes: string | null;
          ownership_status: string;
          property_type: string | null;
          registration_details: string | null;
          related_loan_id: string | null;
          rental_status: string | null;
          title_status: string | null;
          updated_at: string;
        };
        Insert: {
          acquisition_date: string;
          acquisition_type: string;
          acquisition_value_minor_units?: number | null;
          area_unit?: string | null;
          asset_group: string;
          category: string;
          condition?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          dispute_status?: string | null;
          encumbrance_notes?: string | null;
          encumbrance_status?: string | null;
          generates_income?: boolean;
          household_id: string;
          id?: string;
          include_in_net_worth?: boolean;
          income_notes?: string | null;
          land_area?: number | null;
          legal_heir_notes?: string | null;
          liquidity_classification: string;
          location?: string | null;
          location_precise?: string | null;
          mutation_status?: string | null;
          name: string;
          notes?: string | null;
          occupancy?: string | null;
          original_owner?: string | null;
          owner_person_id: string;
          ownership_percentage?: number;
          ownership_share_notes?: string | null;
          ownership_status?: string;
          property_type?: string | null;
          registration_details?: string | null;
          related_loan_id?: string | null;
          rental_status?: string | null;
          title_status?: string | null;
          updated_at?: string;
        };
        Update: {
          acquisition_date?: string;
          acquisition_type?: string;
          acquisition_value_minor_units?: number | null;
          area_unit?: string | null;
          asset_group?: string;
          category?: string;
          condition?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          dispute_status?: string | null;
          encumbrance_notes?: string | null;
          encumbrance_status?: string | null;
          generates_income?: boolean;
          household_id?: string;
          id?: string;
          include_in_net_worth?: boolean;
          income_notes?: string | null;
          land_area?: number | null;
          legal_heir_notes?: string | null;
          liquidity_classification?: string;
          location?: string | null;
          location_precise?: string | null;
          mutation_status?: string | null;
          name?: string;
          notes?: string | null;
          occupancy?: string | null;
          original_owner?: string | null;
          owner_person_id?: string;
          ownership_percentage?: number;
          ownership_share_notes?: string | null;
          ownership_status?: string;
          property_type?: string | null;
          registration_details?: string | null;
          related_loan_id?: string | null;
          rental_status?: string | null;
          title_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_related_loan_id_fkey";
            columns: ["related_loan_id"];
            isOneToOne: false;
            referencedRelation: "loans";
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
      calculator_scenarios: {
        Row: {
          calculator_type: string;
          created_at: string;
          created_by: string | null;
          household_id: string;
          id: string;
          inputs: Json;
          linked_account_id: string | null;
          name: string;
          notes: string | null;
          outputs: Json;
          updated_at: string;
        };
        Insert: {
          calculator_type: string;
          created_at?: string;
          created_by?: string | null;
          household_id: string;
          id?: string;
          inputs?: Json;
          linked_account_id?: string | null;
          name: string;
          notes?: string | null;
          outputs?: Json;
          updated_at?: string;
        };
        Update: {
          calculator_type?: string;
          created_at?: string;
          created_by?: string | null;
          household_id?: string;
          id?: string;
          inputs?: Json;
          linked_account_id?: string | null;
          name?: string;
          notes?: string | null;
          outputs?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calculator_scenarios_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calculator_scenarios_linked_account_id_fkey";
            columns: ["linked_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      decision_journal_entries: {
        Row: {
          actual_outcome: string | null;
          alternatives: string | null;
          amount_minor_units: number | null;
          choice: string;
          context: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string | null;
          decision_date: string;
          entity_id: string | null;
          entity_type: string | null;
          expected_result: string | null;
          household_id: string;
          id: string;
          lessons_learned: string | null;
          rationale: string;
          review_date: string | null;
          risks: string | null;
          status: string;
          supersedes_entry_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          actual_outcome?: string | null;
          alternatives?: string | null;
          amount_minor_units?: number | null;
          choice: string;
          context?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          decision_date: string;
          entity_id?: string | null;
          entity_type?: string | null;
          expected_result?: string | null;
          household_id: string;
          id?: string;
          lessons_learned?: string | null;
          rationale: string;
          review_date?: string | null;
          risks?: string | null;
          status?: string;
          supersedes_entry_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          actual_outcome?: string | null;
          alternatives?: string | null;
          amount_minor_units?: number | null;
          choice?: string;
          context?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string | null;
          decision_date?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          expected_result?: string | null;
          household_id?: string;
          id?: string;
          lessons_learned?: string | null;
          rationale?: string;
          review_date?: string | null;
          risks?: string | null;
          status?: string;
          supersedes_entry_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decision_journal_entries_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decision_journal_entries_supersedes_entry_id_fkey";
            columns: ["supersedes_entry_id"];
            isOneToOne: false;
            referencedRelation: "decision_journal_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          category: string;
          checksum: string | null;
          created_at: string;
          display_name: string;
          document_date: string | null;
          entity_id: string | null;
          entity_type: string | null;
          expiry_date: string | null;
          household_id: string;
          id: string;
          mime_type: string;
          notes: string | null;
          original_filename: string;
          size_bytes: number;
          status: string;
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          category: string;
          checksum?: string | null;
          created_at?: string;
          display_name: string;
          document_date?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expiry_date?: string | null;
          household_id: string;
          id?: string;
          mime_type: string;
          notes?: string | null;
          original_filename: string;
          size_bytes: number;
          status?: string;
          storage_bucket?: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          category?: string;
          checksum?: string | null;
          created_at?: string;
          display_name?: string;
          document_date?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expiry_date?: string | null;
          household_id?: string;
          id?: string;
          mime_type?: string;
          notes?: string | null;
          original_filename?: string;
          size_bytes?: number;
          status?: string;
          storage_bucket?: string;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documents_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      emergency_fund_plans: {
        Row: {
          coverage_target_months: number;
          created_at: string;
          dependants_count: number;
          household_id: string;
          id: string;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          coverage_target_months?: number;
          created_at?: string;
          dependants_count?: number;
          household_id: string;
          id?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          coverage_target_months?: number;
          created_at?: string;
          dependants_count?: number;
          household_id?: string;
          id?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "emergency_fund_plans_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: true;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      emergency_fund_source_overrides: {
        Row: {
          account_id: string | null;
          created_at: string;
          emergency_fund_plan_id: string;
          household_id: string;
          id: string;
          investment_holding_id: string | null;
          is_included: boolean;
          source_type: string;
        };
        Insert: {
          account_id?: string | null;
          created_at?: string;
          emergency_fund_plan_id: string;
          household_id: string;
          id?: string;
          investment_holding_id?: string | null;
          is_included: boolean;
          source_type: string;
        };
        Update: {
          account_id?: string | null;
          created_at?: string;
          emergency_fund_plan_id?: string;
          household_id?: string;
          id?: string;
          investment_holding_id?: string | null;
          is_included?: boolean;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "emergency_fund_source_overrides_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emergency_fund_source_overrides_emergency_fund_plan_id_fkey";
            columns: ["emergency_fund_plan_id"];
            isOneToOne: false;
            referencedRelation: "emergency_fund_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emergency_fund_source_overrides_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emergency_fund_source_overrides_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
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
          maturity_date: string | null;
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
          maturity_date?: string | null;
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
          maturity_date?: string | null;
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
      goal_funding_sources: {
        Row: {
          account_id: string | null;
          allocation_percentage: number;
          created_at: string;
          goal_id: string;
          household_id: string;
          id: string;
          investment_holding_id: string | null;
          notes: string | null;
          source_type: string;
        };
        Insert: {
          account_id?: string | null;
          allocation_percentage?: number;
          created_at?: string;
          goal_id: string;
          household_id: string;
          id?: string;
          investment_holding_id?: string | null;
          notes?: string | null;
          source_type: string;
        };
        Update: {
          account_id?: string | null;
          allocation_percentage?: number;
          created_at?: string;
          goal_id?: string;
          household_id?: string;
          id?: string;
          investment_holding_id?: string | null;
          notes?: string | null;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_funding_sources_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_funding_sources_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_funding_sources_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_funding_sources_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_responsible_people: {
        Row: {
          created_at: string;
          goal_id: string;
          household_id: string;
          id: string;
          person_id: string;
        };
        Insert: {
          created_at?: string;
          goal_id: string;
          household_id: string;
          id?: string;
          person_id: string;
        };
        Update: {
          created_at?: string;
          goal_id?: string;
          household_id?: string;
          id?: string;
          person_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_responsible_people_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_responsible_people_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_responsible_people_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          annual_expected_return: number;
          annual_inflation_rate: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          flexibility: string;
          goal_type: string;
          household_id: string;
          id: string;
          manual_current_saved_amount_minor_units: number;
          name: string;
          notes: string | null;
          priority: string;
          status: string;
          target_amount_minor_units: number;
          target_date: string;
          updated_at: string;
        };
        Insert: {
          annual_expected_return?: number;
          annual_inflation_rate?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          flexibility?: string;
          goal_type: string;
          household_id: string;
          id?: string;
          manual_current_saved_amount_minor_units?: number;
          name: string;
          notes?: string | null;
          priority?: string;
          status?: string;
          target_amount_minor_units: number;
          target_date: string;
          updated_at?: string;
        };
        Update: {
          annual_expected_return?: number;
          annual_inflation_rate?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          flexibility?: string;
          goal_type?: string;
          household_id?: string;
          id?: string;
          manual_current_saved_amount_minor_units?: number;
          name?: string;
          notes?: string | null;
          priority?: string;
          status?: string;
          target_amount_minor_units?: number;
          target_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
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
      income_sources: {
        Row: {
          category_id: string | null;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          expected_amount_minor_units: number | null;
          expected_day_of_month: number | null;
          expected_payment_date_rule: string | null;
          frequency: string;
          household_id: string;
          id: string;
          institution_id: string | null;
          is_active: boolean;
          name: string;
          notes: string | null;
          person_id: string | null;
          receiving_account_id: string;
          source_type: string;
          start_date: string;
          tax_withholding_expected: boolean;
          tax_withholding_notes: string | null;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          currency_code: string;
          end_date?: string | null;
          expected_amount_minor_units?: number | null;
          expected_day_of_month?: number | null;
          expected_payment_date_rule?: string | null;
          frequency: string;
          household_id: string;
          id?: string;
          institution_id?: string | null;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          person_id?: string | null;
          receiving_account_id: string;
          source_type: string;
          start_date: string;
          tax_withholding_expected?: boolean;
          tax_withholding_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          currency_code?: string;
          end_date?: string | null;
          expected_amount_minor_units?: number | null;
          expected_day_of_month?: number | null;
          expected_payment_date_rule?: string | null;
          frequency?: string;
          household_id?: string;
          id?: string;
          institution_id?: string | null;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          person_id?: string | null;
          receiving_account_id?: string;
          source_type?: string;
          start_date?: string;
          tax_withholding_expected?: boolean;
          tax_withholding_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "income_sources_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "transaction_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_sources_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_sources_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_sources_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "income_sources_receiving_account_id_fkey";
            columns: ["receiving_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
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
      insurance_claims: {
        Row: {
          approved_amount_minor_units: number | null;
          claim_date: string;
          claimed_amount_minor_units: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          hospital_provider: string | null;
          household_id: string;
          id: string;
          incident_date: string;
          insured_person_id: string;
          notes: string | null;
          policy_id: string;
          reference_number: string | null;
          settled_account_id: string | null;
          settled_amount_minor_units: number | null;
          settled_date: string | null;
          settlement_transaction_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_amount_minor_units?: number | null;
          claim_date: string;
          claimed_amount_minor_units: number;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          hospital_provider?: string | null;
          household_id: string;
          id?: string;
          incident_date: string;
          insured_person_id: string;
          notes?: string | null;
          policy_id: string;
          reference_number?: string | null;
          settled_account_id?: string | null;
          settled_amount_minor_units?: number | null;
          settled_date?: string | null;
          settlement_transaction_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_amount_minor_units?: number | null;
          claim_date?: string;
          claimed_amount_minor_units?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          hospital_provider?: string | null;
          household_id?: string;
          id?: string;
          incident_date?: string;
          insured_person_id?: string;
          notes?: string | null;
          policy_id?: string;
          reference_number?: string | null;
          settled_account_id?: string | null;
          settled_amount_minor_units?: number | null;
          settled_date?: string | null;
          settlement_transaction_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_claims_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_claims_insured_person_id_fkey";
            columns: ["insured_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_claims_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "insurance_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_claims_settled_account_id_fkey";
            columns: ["settled_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_claims_settlement_transaction_id_fkey";
            columns: ["settlement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_claims_settlement_transaction_id_fkey";
            columns: ["settlement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_policies: {
        Row: {
          agent_contact: string | null;
          agent_name: string | null;
          cashless_availability: boolean | null;
          claim_contact: string | null;
          co_pay_percentage: number | null;
          consumables_cover: boolean | null;
          coverage_amount_minor_units: number;
          created_at: string;
          currency_code: string;
          day_care_treatment: boolean | null;
          deductible_minor_units: number | null;
          exclusions_summary: string | null;
          expiry_date: string | null;
          household_id: string;
          id: string;
          insurer_institution_id: string;
          masked_policy_number: string | null;
          name: string;
          network_hospital_notes: string | null;
          no_claim_bonus: string | null;
          nominee_person_id: string | null;
          notes: string | null;
          opd_cover: boolean | null;
          payment_account_id: string;
          policy_type: string;
          policyholder_person_id: string;
          post_hospitalization_days: number | null;
          pre_existing_conditions_declared: string | null;
          pre_hospitalization_days: number | null;
          premium_amount_minor_units: number;
          premium_frequency: string;
          previous_policy_id: string | null;
          renewal_date: string | null;
          restoration_benefit: boolean | null;
          room_rent_restriction: string | null;
          start_date: string;
          status: string;
          support_contact: string | null;
          updated_at: string;
          waiting_periods: string | null;
        };
        Insert: {
          agent_contact?: string | null;
          agent_name?: string | null;
          cashless_availability?: boolean | null;
          claim_contact?: string | null;
          co_pay_percentage?: number | null;
          consumables_cover?: boolean | null;
          coverage_amount_minor_units: number;
          created_at?: string;
          currency_code: string;
          day_care_treatment?: boolean | null;
          deductible_minor_units?: number | null;
          exclusions_summary?: string | null;
          expiry_date?: string | null;
          household_id: string;
          id?: string;
          insurer_institution_id: string;
          masked_policy_number?: string | null;
          name: string;
          network_hospital_notes?: string | null;
          no_claim_bonus?: string | null;
          nominee_person_id?: string | null;
          notes?: string | null;
          opd_cover?: boolean | null;
          payment_account_id: string;
          policy_type: string;
          policyholder_person_id: string;
          post_hospitalization_days?: number | null;
          pre_existing_conditions_declared?: string | null;
          pre_hospitalization_days?: number | null;
          premium_amount_minor_units: number;
          premium_frequency: string;
          previous_policy_id?: string | null;
          renewal_date?: string | null;
          restoration_benefit?: boolean | null;
          room_rent_restriction?: string | null;
          start_date: string;
          status?: string;
          support_contact?: string | null;
          updated_at?: string;
          waiting_periods?: string | null;
        };
        Update: {
          agent_contact?: string | null;
          agent_name?: string | null;
          cashless_availability?: boolean | null;
          claim_contact?: string | null;
          co_pay_percentage?: number | null;
          consumables_cover?: boolean | null;
          coverage_amount_minor_units?: number;
          created_at?: string;
          currency_code?: string;
          day_care_treatment?: boolean | null;
          deductible_minor_units?: number | null;
          exclusions_summary?: string | null;
          expiry_date?: string | null;
          household_id?: string;
          id?: string;
          insurer_institution_id?: string;
          masked_policy_number?: string | null;
          name?: string;
          network_hospital_notes?: string | null;
          no_claim_bonus?: string | null;
          nominee_person_id?: string | null;
          notes?: string | null;
          opd_cover?: boolean | null;
          payment_account_id?: string;
          policy_type?: string;
          policyholder_person_id?: string;
          post_hospitalization_days?: number | null;
          pre_existing_conditions_declared?: string | null;
          pre_hospitalization_days?: number | null;
          premium_amount_minor_units?: number;
          premium_frequency?: string;
          previous_policy_id?: string | null;
          renewal_date?: string | null;
          restoration_benefit?: boolean | null;
          room_rent_restriction?: string | null;
          start_date?: string;
          status?: string;
          support_contact?: string | null;
          updated_at?: string;
          waiting_periods?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_policies_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policies_insurer_institution_id_fkey";
            columns: ["insurer_institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policies_nominee_person_id_fkey";
            columns: ["nominee_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policies_payment_account_id_fkey";
            columns: ["payment_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policies_policyholder_person_id_fkey";
            columns: ["policyholder_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policies_previous_policy_id_fkey";
            columns: ["previous_policy_id"];
            isOneToOne: false;
            referencedRelation: "insurance_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_policy_insured_people: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          person_id: string;
          policy_id: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          person_id: string;
          policy_id: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          person_id?: string;
          policy_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_policy_insured_people_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policy_insured_people_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policy_insured_people_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "insurance_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      insurance_policy_waiting_periods: {
        Row: {
          created_at: string;
          duration_months: number;
          household_id: string;
          id: string;
          label: string;
          notes: string | null;
          policy_id: string;
          starts_from: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          duration_months: number;
          household_id: string;
          id?: string;
          label: string;
          notes?: string | null;
          policy_id: string;
          starts_from: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          duration_months?: number;
          household_id?: string;
          id?: string;
          label?: string;
          notes?: string | null;
          policy_id?: string;
          starts_from?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurance_policy_waiting_periods_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insurance_policy_waiting_periods_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "insurance_policies";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_accounts: {
        Row: {
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
          owner_person_id: string | null;
          updated_at: string;
        };
        Insert: {
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
          owner_person_id?: string | null;
          updated_at?: string;
        };
        Update: {
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
          owner_person_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_accounts_institution_id_fkey";
            columns: ["institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_accounts_owner_person_id_fkey";
            columns: ["owner_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_assets: {
        Row: {
          asset_class: string;
          created_at: string;
          currency_code: string;
          household_id: string;
          id: string;
          is_active: boolean;
          name: string;
          notes: string | null;
          symbol_or_identifier: string | null;
          updated_at: string;
        };
        Insert: {
          asset_class: string;
          created_at?: string;
          currency_code: string;
          household_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          symbol_or_identifier?: string | null;
          updated_at?: string;
        };
        Update: {
          asset_class?: string;
          created_at?: string;
          currency_code?: string;
          household_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          symbol_or_identifier?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_assets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_documents: {
        Row: {
          created_at: string;
          document_date: string | null;
          document_type: string;
          file_name: string;
          household_id: string;
          id: string;
          investment_account_id: string | null;
          investment_holding_id: string | null;
          investment_valuation_snapshot_id: string | null;
          mime_type: string | null;
          notes: string | null;
          size_bytes: number | null;
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          document_date?: string | null;
          document_type: string;
          file_name: string;
          household_id: string;
          id?: string;
          investment_account_id?: string | null;
          investment_holding_id?: string | null;
          investment_valuation_snapshot_id?: string | null;
          mime_type?: string | null;
          notes?: string | null;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          document_date?: string | null;
          document_type?: string;
          file_name?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string | null;
          investment_holding_id?: string | null;
          investment_valuation_snapshot_id?: string | null;
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
            foreignKeyName: "investment_documents_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_documents_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_documents_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_documents_investment_valuation_snapshot_id_fkey";
            columns: ["investment_valuation_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "investment_valuation_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_holdings: {
        Row: {
          closed_date: string | null;
          created_at: string;
          household_id: string;
          id: string;
          investment_account_id: string;
          investment_asset_id: string;
          is_active: boolean;
          notes: string | null;
          opened_date: string | null;
          updated_at: string;
        };
        Insert: {
          closed_date?: string | null;
          created_at?: string;
          household_id: string;
          id?: string;
          investment_account_id: string;
          investment_asset_id: string;
          is_active?: boolean;
          notes?: string | null;
          opened_date?: string | null;
          updated_at?: string;
        };
        Update: {
          closed_date?: string | null;
          created_at?: string;
          household_id?: string;
          id?: string;
          investment_account_id?: string;
          investment_asset_id?: string;
          is_active?: boolean;
          notes?: string | null;
          opened_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_holdings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_holdings_investment_account_id_fkey";
            columns: ["investment_account_id"];
            isOneToOne: false;
            referencedRelation: "investment_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_holdings_investment_asset_id_fkey";
            columns: ["investment_asset_id"];
            isOneToOne: false;
            referencedRelation: "investment_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_sip_events: {
        Row: {
          created_at: string;
          event_type: string;
          household_id: string;
          id: string;
          investment_sip_id: string;
          investment_transaction_id: string | null;
          notes: string | null;
          occurrence_date: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          household_id: string;
          id?: string;
          investment_sip_id: string;
          investment_transaction_id?: string | null;
          notes?: string | null;
          occurrence_date?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          household_id?: string;
          id?: string;
          investment_sip_id?: string;
          investment_transaction_id?: string | null;
          notes?: string | null;
          occurrence_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "investment_sip_events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_sip_events_investment_sip_id_fkey";
            columns: ["investment_sip_id"];
            isOneToOne: false;
            referencedRelation: "investment_sips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_sip_events_investment_transaction_id_fkey";
            columns: ["investment_transaction_id"];
            isOneToOne: false;
            referencedRelation: "investment_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_sips: {
        Row: {
          contribution_account_id: string;
          contribution_amount_minor_units: number;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          expected_duration_months: number | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          investment_holding_id: string;
          last_contribution_date: string | null;
          name: string;
          next_due_date: string | null;
          notes: string | null;
          provider: string | null;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          contribution_account_id: string;
          contribution_amount_minor_units: number;
          created_at?: string;
          currency_code: string;
          end_date?: string | null;
          expected_duration_months?: number | null;
          frequency: string;
          household_id: string;
          id?: string;
          interval_count?: number;
          investment_holding_id: string;
          last_contribution_date?: string | null;
          name: string;
          next_due_date?: string | null;
          notes?: string | null;
          provider?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          contribution_account_id?: string;
          contribution_amount_minor_units?: number;
          created_at?: string;
          currency_code?: string;
          end_date?: string | null;
          expected_duration_months?: number | null;
          frequency?: string;
          household_id?: string;
          id?: string;
          interval_count?: number;
          investment_holding_id?: string;
          last_contribution_date?: string | null;
          name?: string;
          next_due_date?: string | null;
          notes?: string | null;
          provider?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_sips_contribution_account_id_fkey";
            columns: ["contribution_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_sips_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_sips_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_transactions: {
        Row: {
          amount_minor_units: number;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          fee_minor_units: number | null;
          household_id: string;
          id: string;
          investment_holding_id: string;
          investment_sip_id: string | null;
          linked_transaction_id: string | null;
          price_per_unit: number | null;
          quantity: number | null;
          related_person_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transaction_type: string;
          updated_at: string;
        };
        Insert: {
          amount_minor_units: number;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          description?: string | null;
          fee_minor_units?: number | null;
          household_id: string;
          id?: string;
          investment_holding_id: string;
          investment_sip_id?: string | null;
          linked_transaction_id?: string | null;
          price_per_unit?: number | null;
          quantity?: number | null;
          related_person_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date: string;
          transaction_type: string;
          updated_at?: string;
        };
        Update: {
          amount_minor_units?: number;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          description?: string | null;
          fee_minor_units?: number | null;
          household_id?: string;
          id?: string;
          investment_holding_id?: string;
          investment_sip_id?: string | null;
          linked_transaction_id?: string | null;
          price_per_unit?: number | null;
          quantity?: number | null;
          related_person_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date?: string;
          transaction_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_transactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_transactions_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_transactions_investment_sip_id_fkey";
            columns: ["investment_sip_id"];
            isOneToOne: false;
            referencedRelation: "investment_sips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_transactions_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_transactions_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_transactions_related_person_id_fkey";
            columns: ["related_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_valuation_snapshots: {
        Row: {
          as_of_date: string;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          household_id: string;
          id: string;
          investment_holding_id: string;
          notes: string | null;
          price_per_unit: number | null;
          source: string;
          value_minor_units: number;
        };
        Insert: {
          as_of_date: string;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          household_id: string;
          id?: string;
          investment_holding_id: string;
          notes?: string | null;
          price_per_unit?: number | null;
          source: string;
          value_minor_units: number;
        };
        Update: {
          as_of_date?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          household_id?: string;
          id?: string;
          investment_holding_id?: string;
          notes?: string | null;
          price_per_unit?: number | null;
          source?: string;
          value_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "investment_valuation_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_valuation_snapshots_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
            referencedColumns: ["id"];
          },
        ];
      };
      lending_repayments: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          excess_amount_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          lending_id: string;
          linked_transaction_id: string | null;
          notes: string | null;
          principal_component_minor_units: number;
          repayment_date: string;
          reversal_reason: string | null;
          reverses_repayment_id: string | null;
          total_repayment_minor_units: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          excess_amount_minor_units?: number;
          household_id: string;
          id?: string;
          interest_component_minor_units?: number;
          lending_id: string;
          linked_transaction_id?: string | null;
          notes?: string | null;
          principal_component_minor_units?: number;
          repayment_date: string;
          reversal_reason?: string | null;
          reverses_repayment_id?: string | null;
          total_repayment_minor_units: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          excess_amount_minor_units?: number;
          household_id?: string;
          id?: string;
          interest_component_minor_units?: number;
          lending_id?: string;
          linked_transaction_id?: string | null;
          notes?: string | null;
          principal_component_minor_units?: number;
          repayment_date?: string;
          reversal_reason?: string | null;
          reverses_repayment_id?: string | null;
          total_repayment_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lending_repayments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lending_repayments_lending_id_fkey";
            columns: ["lending_id"];
            isOneToOne: false;
            referencedRelation: "lendings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lending_repayments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lending_repayments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lending_repayments_reverses_repayment_id_fkey";
            columns: ["reverses_repayment_id"];
            isOneToOne: false;
            referencedRelation: "lending_repayments";
            referencedColumns: ["id"];
          },
        ];
      };
      lendings: {
        Row: {
          amount_lent_minor_units: number;
          annual_interest_rate: number | null;
          borrower_institution_id: string | null;
          borrower_person_id: string | null;
          charges_interest: boolean;
          created_at: string;
          currency_code: string;
          disbursed_date: string;
          disbursement_transaction_id: string | null;
          expected_repayment_date: string | null;
          household_id: string;
          id: string;
          installment_amount_minor_units: number | null;
          installment_frequency: string | null;
          interest_type: string | null;
          name: string;
          notes: string | null;
          purpose: string | null;
          repayment_schedule_type: string;
          risk_level: string;
          source_account_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_lent_minor_units: number;
          annual_interest_rate?: number | null;
          borrower_institution_id?: string | null;
          borrower_person_id?: string | null;
          charges_interest?: boolean;
          created_at?: string;
          currency_code: string;
          disbursed_date: string;
          disbursement_transaction_id?: string | null;
          expected_repayment_date?: string | null;
          household_id: string;
          id?: string;
          installment_amount_minor_units?: number | null;
          installment_frequency?: string | null;
          interest_type?: string | null;
          name: string;
          notes?: string | null;
          purpose?: string | null;
          repayment_schedule_type?: string;
          risk_level?: string;
          source_account_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_lent_minor_units?: number;
          annual_interest_rate?: number | null;
          borrower_institution_id?: string | null;
          borrower_person_id?: string | null;
          charges_interest?: boolean;
          created_at?: string;
          currency_code?: string;
          disbursed_date?: string;
          disbursement_transaction_id?: string | null;
          expected_repayment_date?: string | null;
          household_id?: string;
          id?: string;
          installment_amount_minor_units?: number | null;
          installment_frequency?: string | null;
          interest_type?: string | null;
          name?: string;
          notes?: string | null;
          purpose?: string | null;
          repayment_schedule_type?: string;
          risk_level?: string;
          source_account_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lendings_borrower_institution_id_fkey";
            columns: ["borrower_institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lendings_borrower_person_id_fkey";
            columns: ["borrower_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lendings_disbursement_transaction_id_fkey";
            columns: ["disbursement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lendings_disbursement_transaction_id_fkey";
            columns: ["disbursement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lendings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lendings_source_account_id_fkey";
            columns: ["source_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      liabilities: {
        Row: {
          amount_minor_units: number;
          annual_interest_rate: number | null;
          category: string;
          certainty: string;
          charges_interest: boolean;
          counterparty_institution_id: string | null;
          counterparty_person_id: string | null;
          created_at: string;
          currency_code: string;
          documentation_status: string;
          due_date: string | null;
          household_id: string;
          id: string;
          incurred_transaction_id: string | null;
          installment_amount_minor_units: number | null;
          installment_frequency: string | null;
          interest_type: string | null;
          liability_source: string;
          name: string;
          notes: string | null;
          payment_account_id: string;
          received_date: string | null;
          receiving_account_id: string | null;
          repayment_schedule_type: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_minor_units: number;
          annual_interest_rate?: number | null;
          category: string;
          certainty?: string;
          charges_interest?: boolean;
          counterparty_institution_id?: string | null;
          counterparty_person_id?: string | null;
          created_at?: string;
          currency_code: string;
          documentation_status?: string;
          due_date?: string | null;
          household_id: string;
          id?: string;
          incurred_transaction_id?: string | null;
          installment_amount_minor_units?: number | null;
          installment_frequency?: string | null;
          interest_type?: string | null;
          liability_source: string;
          name: string;
          notes?: string | null;
          payment_account_id: string;
          received_date?: string | null;
          receiving_account_id?: string | null;
          repayment_schedule_type?: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_minor_units?: number;
          annual_interest_rate?: number | null;
          category?: string;
          certainty?: string;
          charges_interest?: boolean;
          counterparty_institution_id?: string | null;
          counterparty_person_id?: string | null;
          created_at?: string;
          currency_code?: string;
          documentation_status?: string;
          due_date?: string | null;
          household_id?: string;
          id?: string;
          incurred_transaction_id?: string | null;
          installment_amount_minor_units?: number | null;
          installment_frequency?: string | null;
          interest_type?: string | null;
          liability_source?: string;
          name?: string;
          notes?: string | null;
          payment_account_id?: string;
          received_date?: string | null;
          receiving_account_id?: string | null;
          repayment_schedule_type?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "liabilities_counterparty_institution_id_fkey";
            columns: ["counterparty_institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_counterparty_person_id_fkey";
            columns: ["counterparty_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_incurred_transaction_id_fkey";
            columns: ["incurred_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_incurred_transaction_id_fkey";
            columns: ["incurred_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_payment_account_id_fkey";
            columns: ["payment_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liabilities_receiving_account_id_fkey";
            columns: ["receiving_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      liability_payments: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          excess_amount_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          liability_id: string;
          linked_transaction_id: string | null;
          notes: string | null;
          payment_date: string;
          principal_component_minor_units: number;
          reversal_reason: string | null;
          reverses_payment_id: string | null;
          total_payment_minor_units: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          excess_amount_minor_units?: number;
          household_id: string;
          id?: string;
          interest_component_minor_units?: number;
          liability_id: string;
          linked_transaction_id?: string | null;
          notes?: string | null;
          payment_date: string;
          principal_component_minor_units?: number;
          reversal_reason?: string | null;
          reverses_payment_id?: string | null;
          total_payment_minor_units: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          excess_amount_minor_units?: number;
          household_id?: string;
          id?: string;
          interest_component_minor_units?: number;
          liability_id?: string;
          linked_transaction_id?: string | null;
          notes?: string | null;
          payment_date?: string;
          principal_component_minor_units?: number;
          reversal_reason?: string | null;
          reverses_payment_id?: string | null;
          total_payment_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "liability_payments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liability_payments_liability_id_fkey";
            columns: ["liability_id"];
            isOneToOne: false;
            referencedRelation: "liabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liability_payments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liability_payments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "liability_payments_reverses_payment_id_fkey";
            columns: ["reverses_payment_id"];
            isOneToOne: false;
            referencedRelation: "liability_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      loan_payments: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          fee_component_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          linked_transaction_id: string | null;
          loan_id: string;
          notes: string | null;
          overpayment_amount_minor_units: number;
          payment_date: string;
          penalty_component_minor_units: number;
          principal_component_minor_units: number;
          reversal_reason: string | null;
          reverses_payment_id: string | null;
          total_payment_minor_units: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          fee_component_minor_units?: number;
          household_id: string;
          id?: string;
          interest_component_minor_units?: number;
          linked_transaction_id?: string | null;
          loan_id: string;
          notes?: string | null;
          overpayment_amount_minor_units?: number;
          payment_date: string;
          penalty_component_minor_units?: number;
          principal_component_minor_units?: number;
          reversal_reason?: string | null;
          reverses_payment_id?: string | null;
          total_payment_minor_units: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          fee_component_minor_units?: number;
          household_id?: string;
          id?: string;
          interest_component_minor_units?: number;
          linked_transaction_id?: string | null;
          loan_id?: string;
          notes?: string | null;
          overpayment_amount_minor_units?: number;
          payment_date?: string;
          penalty_component_minor_units?: number;
          principal_component_minor_units?: number;
          reversal_reason?: string | null;
          reverses_payment_id?: string | null;
          total_payment_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "loan_payments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loan_payments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loan_payments_linked_transaction_id_fkey";
            columns: ["linked_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey";
            columns: ["loan_id"];
            isOneToOne: false;
            referencedRelation: "loans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loan_payments_reverses_payment_id_fkey";
            columns: ["reverses_payment_id"];
            isOneToOne: false;
            referencedRelation: "loan_payments";
            referencedColumns: ["id"];
          },
        ];
      };
      loans: {
        Row: {
          annual_interest_rate: number;
          borrower_person_id: string;
          co_borrower_person_id: string | null;
          collateral: string | null;
          course: string | null;
          created_at: string;
          currency_code: string;
          disbursed_amount_minor_units: number | null;
          disbursed_date: string | null;
          disbursement_transaction_id: string | null;
          educational_institution_id: string | null;
          emi_amount_minor_units: number | null;
          household_id: string;
          id: string;
          interest_subsidy: boolean;
          interest_subsidy_notes: string | null;
          interest_type: string;
          lender_institution_id: string | null;
          lender_person_id: string | null;
          loan_type: string;
          maturity_date: string | null;
          moratorium: boolean;
          moratorium_end_date: string | null;
          name: string;
          notes: string | null;
          original_principal_minor_units: number;
          payment_account_id: string;
          repayment_start_date: string;
          start_date: string;
          status: string;
          study_end_date: string | null;
          study_start_date: string | null;
          updated_at: string;
        };
        Insert: {
          annual_interest_rate: number;
          borrower_person_id: string;
          co_borrower_person_id?: string | null;
          collateral?: string | null;
          course?: string | null;
          created_at?: string;
          currency_code: string;
          disbursed_amount_minor_units?: number | null;
          disbursed_date?: string | null;
          disbursement_transaction_id?: string | null;
          educational_institution_id?: string | null;
          emi_amount_minor_units?: number | null;
          household_id: string;
          id?: string;
          interest_subsidy?: boolean;
          interest_subsidy_notes?: string | null;
          interest_type: string;
          lender_institution_id?: string | null;
          lender_person_id?: string | null;
          loan_type: string;
          maturity_date?: string | null;
          moratorium?: boolean;
          moratorium_end_date?: string | null;
          name: string;
          notes?: string | null;
          original_principal_minor_units: number;
          payment_account_id: string;
          repayment_start_date: string;
          start_date: string;
          status?: string;
          study_end_date?: string | null;
          study_start_date?: string | null;
          updated_at?: string;
        };
        Update: {
          annual_interest_rate?: number;
          borrower_person_id?: string;
          co_borrower_person_id?: string | null;
          collateral?: string | null;
          course?: string | null;
          created_at?: string;
          currency_code?: string;
          disbursed_amount_minor_units?: number | null;
          disbursed_date?: string | null;
          disbursement_transaction_id?: string | null;
          educational_institution_id?: string | null;
          emi_amount_minor_units?: number | null;
          household_id?: string;
          id?: string;
          interest_subsidy?: boolean;
          interest_subsidy_notes?: string | null;
          interest_type?: string;
          lender_institution_id?: string | null;
          lender_person_id?: string | null;
          loan_type?: string;
          maturity_date?: string | null;
          moratorium?: boolean;
          moratorium_end_date?: string | null;
          name?: string;
          notes?: string | null;
          original_principal_minor_units?: number;
          payment_account_id?: string;
          repayment_start_date?: string;
          start_date?: string;
          status?: string;
          study_end_date?: string | null;
          study_start_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loans_borrower_person_id_fkey";
            columns: ["borrower_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_co_borrower_person_id_fkey";
            columns: ["co_borrower_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_disbursement_transaction_id_fkey";
            columns: ["disbursement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_disbursement_transaction_id_fkey";
            columns: ["disbursement_transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_educational_institution_id_fkey";
            columns: ["educational_institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_lender_institution_id_fkey";
            columns: ["lender_institution_id"];
            isOneToOne: false;
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_lender_person_id_fkey";
            columns: ["lender_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loans_payment_account_id_fkey";
            columns: ["payment_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      money_drains: {
        Row: {
          cancellation_terms: string | null;
          cost_amount_minor_units: number;
          cost_frequency: string;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          current_value_minor_units: number | null;
          drain_type: string;
          household_id: string;
          id: string;
          is_essential: boolean;
          item: string;
          linked_account_id: string | null;
          linked_asset_id: string | null;
          linked_recurring_rule_id: string | null;
          next_renewal_date: string | null;
          notes: string | null;
          status: string;
          updated_at: string;
          usage_frequency: string;
        };
        Insert: {
          cancellation_terms?: string | null;
          cost_amount_minor_units: number;
          cost_frequency: string;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          current_value_minor_units?: number | null;
          drain_type: string;
          household_id: string;
          id?: string;
          is_essential?: boolean;
          item: string;
          linked_account_id?: string | null;
          linked_asset_id?: string | null;
          linked_recurring_rule_id?: string | null;
          next_renewal_date?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          usage_frequency: string;
        };
        Update: {
          cancellation_terms?: string | null;
          cost_amount_minor_units?: number;
          cost_frequency?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          current_value_minor_units?: number | null;
          drain_type?: string;
          household_id?: string;
          id?: string;
          is_essential?: boolean;
          item?: string;
          linked_account_id?: string | null;
          linked_asset_id?: string | null;
          linked_recurring_rule_id?: string | null;
          next_renewal_date?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          usage_frequency?: string;
        };
        Relationships: [
          {
            foreignKeyName: "money_drains_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_drains_linked_account_id_fkey";
            columns: ["linked_account_id"];
            isOneToOne: false;
            referencedRelation: "financial_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_drains_linked_asset_id_fkey";
            columns: ["linked_asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "money_drains_linked_recurring_rule_id_fkey";
            columns: ["linked_recurring_rule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_closing_review_items: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          is_reviewed: boolean;
          item_type: string;
          monthly_closing_id: string;
          notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          is_reviewed?: boolean;
          item_type: string;
          monthly_closing_id: string;
          notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          is_reviewed?: boolean;
          item_type?: string;
          monthly_closing_id?: string;
          notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_closing_review_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_closing_review_items_monthly_closing_id_fkey";
            columns: ["monthly_closing_id"];
            isOneToOne: false;
            referencedRelation: "monthly_closings";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_closings: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          currency_code: string;
          debt_payment_minor_units: number | null;
          expense_total_minor_units: number | null;
          household_id: string;
          id: string;
          income_total_minor_units: number | null;
          investment_contribution_minor_units: number | null;
          net_cash_flow_minor_units: number | null;
          net_worth_snapshot_id: string | null;
          notes: string | null;
          period: string;
          reconciliation_status: string | null;
          reopen_reason: string | null;
          reopened_at: string | null;
          reopened_by: string | null;
          report_version: number;
          started_at: string;
          started_by: string | null;
          status: string;
          supersedes_closing_id: string | null;
          unresolved_items_count: number;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          currency_code: string;
          debt_payment_minor_units?: number | null;
          expense_total_minor_units?: number | null;
          household_id: string;
          id?: string;
          income_total_minor_units?: number | null;
          investment_contribution_minor_units?: number | null;
          net_cash_flow_minor_units?: number | null;
          net_worth_snapshot_id?: string | null;
          notes?: string | null;
          period: string;
          reconciliation_status?: string | null;
          reopen_reason?: string | null;
          reopened_at?: string | null;
          reopened_by?: string | null;
          report_version?: number;
          started_at?: string;
          started_by?: string | null;
          status?: string;
          supersedes_closing_id?: string | null;
          unresolved_items_count?: number;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          currency_code?: string;
          debt_payment_minor_units?: number | null;
          expense_total_minor_units?: number | null;
          household_id?: string;
          id?: string;
          income_total_minor_units?: number | null;
          investment_contribution_minor_units?: number | null;
          net_cash_flow_minor_units?: number | null;
          net_worth_snapshot_id?: string | null;
          notes?: string | null;
          period?: string;
          reconciliation_status?: string | null;
          reopen_reason?: string | null;
          reopened_at?: string | null;
          reopened_by?: string | null;
          report_version?: number;
          started_at?: string;
          started_by?: string | null;
          status?: string;
          supersedes_closing_id?: string | null;
          unresolved_items_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_closings_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_closings_net_worth_snapshot_id_fkey";
            columns: ["net_worth_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "net_worth_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_closings_supersedes_closing_id_fkey";
            columns: ["supersedes_closing_id"];
            isOneToOne: false;
            referencedRelation: "monthly_closings";
            referencedColumns: ["id"];
          },
        ];
      };
      net_worth_snapshots: {
        Row: {
          as_of_date: string;
          cash_and_accounts_minor_units: number;
          completeness_percentage: number;
          created_at: string;
          currency_code: string;
          household_id: string;
          id: string;
          investments_minor_units: number;
          loans_minor_units: number;
          missing_valuation_count: number;
          movable_assets_minor_units: number;
          net_worth_minor_units: number;
          other_liabilities_minor_units: number;
          property_minor_units: number;
          receivables_minor_units: number;
          source_cutoff_at: string;
          total_assets_minor_units: number;
          total_liabilities_minor_units: number;
          valuation_dependent_item_count: number;
        };
        Insert: {
          as_of_date: string;
          cash_and_accounts_minor_units?: number;
          completeness_percentage?: number;
          created_at?: string;
          currency_code: string;
          household_id: string;
          id?: string;
          investments_minor_units?: number;
          loans_minor_units?: number;
          missing_valuation_count?: number;
          movable_assets_minor_units?: number;
          net_worth_minor_units?: number;
          other_liabilities_minor_units?: number;
          property_minor_units?: number;
          receivables_minor_units?: number;
          source_cutoff_at?: string;
          total_assets_minor_units?: number;
          total_liabilities_minor_units?: number;
          valuation_dependent_item_count?: number;
        };
        Update: {
          as_of_date?: string;
          cash_and_accounts_minor_units?: number;
          completeness_percentage?: number;
          created_at?: string;
          currency_code?: string;
          household_id?: string;
          id?: string;
          investments_minor_units?: number;
          loans_minor_units?: number;
          missing_valuation_count?: number;
          movable_assets_minor_units?: number;
          net_worth_minor_units?: number;
          other_liabilities_minor_units?: number;
          property_minor_units?: number;
          receivables_minor_units?: number;
          source_cutoff_at?: string;
          total_assets_minor_units?: number;
          total_liabilities_minor_units?: number;
          valuation_dependent_item_count?: number;
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
      recurring_rule_amount_schedules: {
        Row: {
          amount_minor_units: number;
          created_at: string;
          effective_date: string;
          household_id: string;
          id: string;
          recurring_rule_id: string;
        };
        Insert: {
          amount_minor_units: number;
          created_at?: string;
          effective_date: string;
          household_id: string;
          id?: string;
          recurring_rule_id: string;
        };
        Update: {
          amount_minor_units?: number;
          created_at?: string;
          effective_date?: string;
          household_id?: string;
          id?: string;
          recurring_rule_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rule_amount_schedules_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rule_amount_schedules_recurring_rule_id_fkey";
            columns: ["recurring_rule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_rule_events: {
        Row: {
          created_at: string;
          effective_date: string | null;
          event_type: string;
          household_id: string;
          id: string;
          new_amount_minor_units: number | null;
          notes: string | null;
          occurrence_date: string | null;
          previous_amount_minor_units: number | null;
          recurring_rule_id: string;
          transaction_id: string | null;
        };
        Insert: {
          created_at?: string;
          effective_date?: string | null;
          event_type: string;
          household_id: string;
          id?: string;
          new_amount_minor_units?: number | null;
          notes?: string | null;
          occurrence_date?: string | null;
          previous_amount_minor_units?: number | null;
          recurring_rule_id: string;
          transaction_id?: string | null;
        };
        Update: {
          created_at?: string;
          effective_date?: string | null;
          event_type?: string;
          household_id?: string;
          id?: string;
          new_amount_minor_units?: number | null;
          notes?: string | null;
          occurrence_date?: string | null;
          previous_amount_minor_units?: number | null;
          recurring_rule_id?: string;
          transaction_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_rule_events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rule_events_recurring_rule_id_fkey";
            columns: ["recurring_rule_id"];
            isOneToOne: false;
            referencedRelation: "recurring_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rule_events_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_flow_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_rule_events_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_rules: {
        Row: {
          account_id: string;
          amount_minor_units: number;
          auto_create_mode: string;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          kind: string;
          last_generated_date: string | null;
          name: string;
          next_due_date: string | null;
          notes: string | null;
          related_person_id: string | null;
          reminder_lead_days: number;
          start_date: string;
          status: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor_units: number;
          auto_create_mode?: string;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          currency_code: string;
          end_date?: string | null;
          frequency: string;
          household_id: string;
          id?: string;
          interval_count?: number;
          kind: string;
          last_generated_date?: string | null;
          name: string;
          next_due_date?: string | null;
          notes?: string | null;
          related_person_id?: string | null;
          reminder_lead_days?: number;
          start_date: string;
          status?: string;
          transfer_account_id?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor_units?: number;
          auto_create_mode?: string;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          currency_code?: string;
          end_date?: string | null;
          frequency?: string;
          household_id?: string;
          id?: string;
          interval_count?: number;
          kind?: string;
          last_generated_date?: string | null;
          name?: string;
          next_due_date?: string | null;
          notes?: string | null;
          related_person_id?: string | null;
          reminder_lead_days?: number;
          start_date?: string;
          status?: string;
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
            foreignKeyName: "recurring_rules_related_person_id_fkey";
            columns: ["related_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
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
      reminders: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          due_date: string;
          entity_id: string;
          entity_type: string;
          household_id: string;
          id: string;
          notes: string | null;
          reminder_type: string;
          snoozed_until: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          due_date: string;
          entity_id: string;
          entity_type: string;
          household_id: string;
          id?: string;
          notes?: string | null;
          reminder_type: string;
          snoozed_until?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          due_date?: string;
          entity_id?: string;
          entity_type?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          reminder_type?: string;
          snoozed_until?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      staking_daily_snapshots: {
        Row: {
          adjustment_reason: string | null;
          closing_value_minor_units: number;
          contribution_minor_units: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          fee_minor_units: number;
          household_id: string;
          id: string;
          manually_confirmed: boolean;
          notes: string | null;
          opening_value_minor_units: number;
          revision: number;
          reward_minor_units: number;
          snapshot_date: string;
          source: string;
          staking_position_id: string;
          withdrawal_minor_units: number;
        };
        Insert: {
          adjustment_reason?: string | null;
          closing_value_minor_units: number;
          contribution_minor_units?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          fee_minor_units?: number;
          household_id: string;
          id?: string;
          manually_confirmed?: boolean;
          notes?: string | null;
          opening_value_minor_units: number;
          revision?: number;
          reward_minor_units?: number;
          snapshot_date: string;
          source?: string;
          staking_position_id: string;
          withdrawal_minor_units?: number;
        };
        Update: {
          adjustment_reason?: string | null;
          closing_value_minor_units?: number;
          contribution_minor_units?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          fee_minor_units?: number;
          household_id?: string;
          id?: string;
          manually_confirmed?: boolean;
          notes?: string | null;
          opening_value_minor_units?: number;
          revision?: number;
          reward_minor_units?: number;
          snapshot_date?: string;
          source?: string;
          staking_position_id?: string;
          withdrawal_minor_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: "staking_daily_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staking_daily_snapshots_staking_position_id_fkey";
            columns: ["staking_position_id"];
            isOneToOne: false;
            referencedRelation: "staking_positions";
            referencedColumns: ["id"];
          },
        ];
      };
      staking_positions: {
        Row: {
          created_at: string;
          currency_code: string;
          expected_daily_rate: number | null;
          fee_notes: string | null;
          household_id: string;
          id: string;
          investment_holding_id: string;
          lock_in_end_date: string | null;
          name: string;
          notes: string | null;
          opening_date: string;
          opening_principal_minor_units: number;
          risk_notes: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency_code: string;
          expected_daily_rate?: number | null;
          fee_notes?: string | null;
          household_id: string;
          id?: string;
          investment_holding_id: string;
          lock_in_end_date?: string | null;
          name: string;
          notes?: string | null;
          opening_date: string;
          opening_principal_minor_units: number;
          risk_notes?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency_code?: string;
          expected_daily_rate?: number | null;
          fee_notes?: string | null;
          household_id?: string;
          id?: string;
          investment_holding_id?: string;
          lock_in_end_date?: string | null;
          name?: string;
          notes?: string | null;
          opening_date?: string;
          opening_principal_minor_units?: number;
          risk_notes?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staking_positions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staking_positions_investment_holding_id_fkey";
            columns: ["investment_holding_id"];
            isOneToOne: false;
            referencedRelation: "investment_holdings";
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
          asset_id: string | null;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          exchange_rate: number | null;
          household_id: string;
          id: string;
          income_source_id: string | null;
          insurance_claim_id: string | null;
          insurance_policy_id: string | null;
          is_planned: boolean;
          kind: string;
          lending_id: string | null;
          liability_id: string | null;
          loan_id: string | null;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          transfer_destination_amount_minor_units: number | null;
          transfer_fee_minor_units: number | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          amount_minor_units: number;
          asset_id?: string | null;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          description?: string | null;
          exchange_rate?: number | null;
          household_id: string;
          id?: string;
          income_source_id?: string | null;
          insurance_claim_id?: string | null;
          insurance_policy_id?: string | null;
          is_planned?: boolean;
          kind: string;
          lending_id?: string | null;
          liability_id?: string | null;
          loan_id?: string | null;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date: string;
          transfer_account_id?: string | null;
          transfer_destination_amount_minor_units?: number | null;
          transfer_fee_minor_units?: number | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount_minor_units?: number;
          asset_id?: string | null;
          category_id?: string | null;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          description?: string | null;
          exchange_rate?: number | null;
          household_id?: string;
          id?: string;
          income_source_id?: string | null;
          insurance_claim_id?: string | null;
          insurance_policy_id?: string | null;
          is_planned?: boolean;
          kind?: string;
          lending_id?: string | null;
          liability_id?: string | null;
          loan_id?: string | null;
          recurring_rule_id?: string | null;
          related_person_id?: string | null;
          reverses_transaction_id?: string | null;
          source_type?: string;
          status?: string;
          transaction_date?: string;
          transfer_account_id?: string | null;
          transfer_destination_amount_minor_units?: number | null;
          transfer_fee_minor_units?: number | null;
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
            foreignKeyName: "transactions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
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
            foreignKeyName: "transactions_income_source_id_fkey";
            columns: ["income_source_id"];
            isOneToOne: false;
            referencedRelation: "income_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_insurance_claim_id_fkey";
            columns: ["insurance_claim_id"];
            isOneToOne: false;
            referencedRelation: "insurance_claims";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_insurance_policy_id_fkey";
            columns: ["insurance_policy_id"];
            isOneToOne: false;
            referencedRelation: "insurance_policies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_lending_id_fkey";
            columns: ["lending_id"];
            isOneToOne: false;
            referencedRelation: "lendings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_liability_id_fkey";
            columns: ["liability_id"];
            isOneToOne: false;
            referencedRelation: "liabilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_loan_id_fkey";
            columns: ["loan_id"];
            isOneToOne: false;
            referencedRelation: "loans";
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
      staking_daily_snapshots_current: {
        Row: {
          adjustment_reason: string | null;
          closing_value_minor_units: number | null;
          contribution_minor_units: number | null;
          created_at: string | null;
          created_by: string | null;
          currency_code: string | null;
          fee_minor_units: number | null;
          household_id: string | null;
          id: string | null;
          manually_confirmed: boolean | null;
          notes: string | null;
          opening_value_minor_units: number | null;
          revision: number | null;
          reward_minor_units: number | null;
          snapshot_date: string | null;
          source: string | null;
          staking_position_id: string | null;
          withdrawal_minor_units: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "staking_daily_snapshots_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staking_daily_snapshots_staking_position_id_fkey";
            columns: ["staking_position_id"];
            isOneToOne: false;
            referencedRelation: "staking_positions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      create_asset: {
        Args: {
          p_acquisition_date: string;
          p_acquisition_type: string;
          p_acquisition_value_minor_units?: number;
          p_area_unit?: string;
          p_asset_group: string;
          p_category: string;
          p_condition?: string;
          p_currency_code: string;
          p_dispute_status?: string;
          p_encumbrance_notes?: string;
          p_encumbrance_status?: string;
          p_estimated_value_minor_units: number;
          p_generates_income?: boolean;
          p_household_id: string;
          p_include_in_net_worth?: boolean;
          p_income_notes?: string;
          p_land_area?: number;
          p_legal_heir_notes?: string;
          p_liquidity_classification: string;
          p_location?: string;
          p_location_precise?: string;
          p_mutation_status?: string;
          p_name: string;
          p_notes?: string;
          p_occupancy?: string;
          p_original_owner?: string;
          p_owner_person_id: string;
          p_ownership_percentage: number;
          p_ownership_share_notes?: string;
          p_ownership_status: string;
          p_property_type?: string;
          p_registration_details?: string;
          p_related_loan_id?: string;
          p_rental_status?: string;
          p_title_status?: string;
          p_valuation_appraiser?: string;
          p_valuation_confidence?: string;
          p_valuation_date: string;
        };
        Returns: {
          acquisition_date: string;
          acquisition_type: string;
          acquisition_value_minor_units: number | null;
          area_unit: string | null;
          asset_group: string;
          category: string;
          condition: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          dispute_status: string | null;
          encumbrance_notes: string | null;
          encumbrance_status: string | null;
          generates_income: boolean;
          household_id: string;
          id: string;
          include_in_net_worth: boolean;
          income_notes: string | null;
          land_area: number | null;
          legal_heir_notes: string | null;
          liquidity_classification: string;
          location: string | null;
          location_precise: string | null;
          mutation_status: string | null;
          name: string;
          notes: string | null;
          occupancy: string | null;
          original_owner: string | null;
          owner_person_id: string;
          ownership_percentage: number;
          ownership_share_notes: string | null;
          ownership_status: string;
          property_type: string | null;
          registration_details: string | null;
          related_loan_id: string | null;
          rental_status: string | null;
          title_status: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_decision_journal_entry: {
        Args: {
          p_alternatives?: string;
          p_amount_minor_units?: number;
          p_choice: string;
          p_context?: string;
          p_currency_code?: string;
          p_decision_date: string;
          p_entity_id?: string;
          p_entity_type?: string;
          p_expected_result?: string;
          p_household_id: string;
          p_rationale: string;
          p_review_date?: string;
          p_risks?: string;
          p_status?: string;
          p_supersedes_entry_id?: string;
          p_title: string;
        };
        Returns: {
          actual_outcome: string | null;
          alternatives: string | null;
          amount_minor_units: number | null;
          choice: string;
          context: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string | null;
          decision_date: string;
          entity_id: string | null;
          entity_type: string | null;
          expected_result: string | null;
          household_id: string;
          id: string;
          lessons_learned: string | null;
          rationale: string;
          review_date: string | null;
          risks: string | null;
          status: string;
          supersedes_entry_id: string | null;
          title: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "decision_journal_entries";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_goal: {
        Args: {
          p_annual_expected_return?: number;
          p_annual_inflation_rate?: number;
          p_currency_code: string;
          p_flexibility?: string;
          p_funding_sources?: Json;
          p_goal_type: string;
          p_household_id: string;
          p_manual_current_saved_amount_minor_units?: number;
          p_name: string;
          p_notes?: string;
          p_priority?: string;
          p_responsible_person_ids?: string[];
          p_target_amount_minor_units: number;
          p_target_date: string;
        };
        Returns: {
          annual_expected_return: number;
          annual_inflation_rate: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          flexibility: string;
          goal_type: string;
          household_id: string;
          id: string;
          manual_current_saved_amount_minor_units: number;
          name: string;
          notes: string | null;
          priority: string;
          status: string;
          target_amount_minor_units: number;
          target_date: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "goals";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_insurance_policy: {
        Args: {
          p_agent_contact?: string;
          p_agent_name?: string;
          p_cashless_availability?: boolean;
          p_claim_contact?: string;
          p_co_pay_percentage?: number;
          p_consumables_cover?: boolean;
          p_coverage_amount_minor_units: number;
          p_currency_code: string;
          p_day_care_treatment?: boolean;
          p_deductible_minor_units?: number;
          p_exclusions_summary?: string;
          p_expiry_date?: string;
          p_household_id: string;
          p_insured_person_ids?: string[];
          p_insurer_institution_id: string;
          p_masked_policy_number?: string;
          p_name: string;
          p_network_hospital_notes?: string;
          p_no_claim_bonus?: string;
          p_nominee_person_id?: string;
          p_notes?: string;
          p_opd_cover?: boolean;
          p_payment_account_id: string;
          p_policy_type: string;
          p_policyholder_person_id: string;
          p_post_hospitalization_days?: number;
          p_pre_existing_conditions_declared?: string;
          p_pre_hospitalization_days?: number;
          p_premium_amount_minor_units: number;
          p_premium_frequency: string;
          p_previous_policy_id?: string;
          p_renewal_date?: string;
          p_restoration_benefit?: boolean;
          p_room_rent_restriction?: string;
          p_start_date: string;
          p_support_contact?: string;
          p_waiting_periods?: string;
        };
        Returns: {
          agent_contact: string | null;
          agent_name: string | null;
          cashless_availability: boolean | null;
          claim_contact: string | null;
          co_pay_percentage: number | null;
          consumables_cover: boolean | null;
          coverage_amount_minor_units: number;
          created_at: string;
          currency_code: string;
          day_care_treatment: boolean | null;
          deductible_minor_units: number | null;
          exclusions_summary: string | null;
          expiry_date: string | null;
          household_id: string;
          id: string;
          insurer_institution_id: string;
          masked_policy_number: string | null;
          name: string;
          network_hospital_notes: string | null;
          no_claim_bonus: string | null;
          nominee_person_id: string | null;
          notes: string | null;
          opd_cover: boolean | null;
          payment_account_id: string;
          policy_type: string;
          policyholder_person_id: string;
          post_hospitalization_days: number | null;
          pre_existing_conditions_declared: string | null;
          pre_hospitalization_days: number | null;
          premium_amount_minor_units: number;
          premium_frequency: string;
          previous_policy_id: string | null;
          renewal_date: string | null;
          restoration_benefit: boolean | null;
          room_rent_restriction: string | null;
          start_date: string;
          status: string;
          support_contact: string | null;
          updated_at: string;
          waiting_periods: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "insurance_policies";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_lending: {
        Args: {
          p_amount_lent_minor_units: number;
          p_annual_interest_rate?: number;
          p_borrower_institution_id?: string;
          p_borrower_person_id?: string;
          p_charges_interest?: boolean;
          p_currency_code: string;
          p_disbursed_date: string;
          p_expected_repayment_date?: string;
          p_household_id: string;
          p_installment_amount_minor_units?: number;
          p_installment_frequency?: string;
          p_interest_type?: string;
          p_name: string;
          p_notes?: string;
          p_purpose?: string;
          p_repayment_schedule_type?: string;
          p_risk_level?: string;
          p_source_account_id: string;
        };
        Returns: {
          amount_lent_minor_units: number;
          annual_interest_rate: number | null;
          borrower_institution_id: string | null;
          borrower_person_id: string | null;
          charges_interest: boolean;
          created_at: string;
          currency_code: string;
          disbursed_date: string;
          disbursement_transaction_id: string | null;
          expected_repayment_date: string | null;
          household_id: string;
          id: string;
          installment_amount_minor_units: number | null;
          installment_frequency: string | null;
          interest_type: string | null;
          name: string;
          notes: string | null;
          purpose: string | null;
          repayment_schedule_type: string;
          risk_level: string;
          source_account_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "lendings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_liability: {
        Args: {
          p_amount_minor_units: number;
          p_annual_interest_rate?: number;
          p_category: string;
          p_certainty?: string;
          p_charges_interest?: boolean;
          p_counterparty_institution_id?: string;
          p_counterparty_person_id?: string;
          p_currency_code: string;
          p_documentation_status?: string;
          p_due_date?: string;
          p_household_id: string;
          p_installment_amount_minor_units?: number;
          p_installment_frequency?: string;
          p_interest_type?: string;
          p_liability_source: string;
          p_name: string;
          p_notes?: string;
          p_payment_account_id: string;
          p_received_date?: string;
          p_receiving_account_id?: string;
          p_repayment_schedule_type?: string;
          p_start_date: string;
        };
        Returns: {
          amount_minor_units: number;
          annual_interest_rate: number | null;
          category: string;
          certainty: string;
          charges_interest: boolean;
          counterparty_institution_id: string | null;
          counterparty_person_id: string | null;
          created_at: string;
          currency_code: string;
          documentation_status: string;
          due_date: string | null;
          household_id: string;
          id: string;
          incurred_transaction_id: string | null;
          installment_amount_minor_units: number | null;
          installment_frequency: string | null;
          interest_type: string | null;
          liability_source: string;
          name: string;
          notes: string | null;
          payment_account_id: string;
          received_date: string | null;
          receiving_account_id: string | null;
          repayment_schedule_type: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "liabilities";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_transaction_with_splits: {
        Args: {
          p_account_id: string;
          p_amount_minor_units: number;
          p_category_id?: string;
          p_counterparty?: string;
          p_currency_code: string;
          p_description?: string;
          p_exchange_rate?: number;
          p_household_id: string;
          p_is_planned?: boolean;
          p_kind: string;
          p_recurring_rule_id?: string;
          p_related_person_id?: string;
          p_reverses_transaction_id?: string;
          p_source_type?: string;
          p_splits?: Json;
          p_status?: string;
          p_transaction_date: string;
          p_transfer_account_id?: string;
          p_transfer_destination_amount_minor_units?: number;
          p_transfer_fee_minor_units?: number;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          asset_id: string | null;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          exchange_rate: number | null;
          household_id: string;
          id: string;
          income_source_id: string | null;
          insurance_claim_id: string | null;
          insurance_policy_id: string | null;
          is_planned: boolean;
          kind: string;
          lending_id: string | null;
          liability_id: string | null;
          loan_id: string | null;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          transfer_destination_amount_minor_units: number | null;
          transfer_fee_minor_units: number | null;
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
      record_insurance_claim_settlement: {
        Args: {
          p_claim_id: string;
          p_description?: string;
          p_household_id: string;
          p_settled_account_id: string;
          p_settled_amount_minor_units: number;
          p_settled_date: string;
        };
        Returns: {
          approved_amount_minor_units: number | null;
          claim_date: string;
          claimed_amount_minor_units: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          hospital_provider: string | null;
          household_id: string;
          id: string;
          incident_date: string;
          insured_person_id: string;
          notes: string | null;
          policy_id: string;
          reference_number: string | null;
          settled_account_id: string | null;
          settled_amount_minor_units: number | null;
          settled_date: string | null;
          settlement_transaction_id: string | null;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "insurance_claims";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_investment_sip_contribution: {
        Args: {
          p_amount_minor_units: number;
          p_contribution_account_id: string;
          p_currency_code: string;
          p_household_id: string;
          p_investment_holding_id: string;
          p_investment_sip_id: string;
          p_next_due_date?: string;
          p_occurrence_date: string;
          p_status: string;
        };
        Returns: {
          amount_minor_units: number;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          fee_minor_units: number | null;
          household_id: string;
          id: string;
          investment_holding_id: string;
          investment_sip_id: string | null;
          linked_transaction_id: string | null;
          price_per_unit: number | null;
          quantity: number | null;
          related_person_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transaction_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "investment_transactions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_lending_repayment: {
        Args: {
          p_excess_amount_minor_units?: number;
          p_household_id: string;
          p_interest_component_minor_units: number;
          p_lending_id: string;
          p_notes?: string;
          p_principal_component_minor_units: number;
          p_repayment_date: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          excess_amount_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          lending_id: string;
          linked_transaction_id: string | null;
          notes: string | null;
          principal_component_minor_units: number;
          repayment_date: string;
          reversal_reason: string | null;
          reverses_repayment_id: string | null;
          total_repayment_minor_units: number;
        };
        SetofOptions: {
          from: "*";
          to: "lending_repayments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_liability_payment: {
        Args: {
          p_excess_amount_minor_units?: number;
          p_household_id: string;
          p_interest_component_minor_units: number;
          p_liability_id: string;
          p_notes?: string;
          p_payment_date: string;
          p_principal_component_minor_units: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          excess_amount_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          liability_id: string;
          linked_transaction_id: string | null;
          notes: string | null;
          payment_date: string;
          principal_component_minor_units: number;
          reversal_reason: string | null;
          reverses_payment_id: string | null;
          total_payment_minor_units: number;
        };
        SetofOptions: {
          from: "*";
          to: "liability_payments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_loan_disbursement: {
        Args: {
          p_amount_minor_units: number;
          p_disbursement_date: string;
          p_household_id: string;
          p_loan_id: string;
          p_notes?: string;
        };
        Returns: {
          annual_interest_rate: number;
          borrower_person_id: string;
          co_borrower_person_id: string | null;
          collateral: string | null;
          course: string | null;
          created_at: string;
          currency_code: string;
          disbursed_amount_minor_units: number | null;
          disbursed_date: string | null;
          disbursement_transaction_id: string | null;
          educational_institution_id: string | null;
          emi_amount_minor_units: number | null;
          household_id: string;
          id: string;
          interest_subsidy: boolean;
          interest_subsidy_notes: string | null;
          interest_type: string;
          lender_institution_id: string | null;
          lender_person_id: string | null;
          loan_type: string;
          maturity_date: string | null;
          moratorium: boolean;
          moratorium_end_date: string | null;
          name: string;
          notes: string | null;
          original_principal_minor_units: number;
          payment_account_id: string;
          repayment_start_date: string;
          start_date: string;
          status: string;
          study_end_date: string | null;
          study_start_date: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "loans";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_loan_payment: {
        Args: {
          p_fee_component_minor_units: number;
          p_household_id: string;
          p_interest_component_minor_units: number;
          p_loan_id: string;
          p_notes?: string;
          p_overpayment_amount_minor_units?: number;
          p_payment_date: string;
          p_penalty_component_minor_units: number;
          p_principal_component_minor_units: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          fee_component_minor_units: number;
          household_id: string;
          id: string;
          interest_component_minor_units: number;
          linked_transaction_id: string | null;
          loan_id: string;
          notes: string | null;
          overpayment_amount_minor_units: number;
          payment_date: string;
          penalty_component_minor_units: number;
          principal_component_minor_units: number;
          reversal_reason: string | null;
          reverses_payment_id: string | null;
          total_payment_minor_units: number;
        };
        SetofOptions: {
          from: "*";
          to: "loan_payments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_recurring_rule_occurrence: {
        Args: {
          p_account_id: string;
          p_amount_minor_units: number;
          p_category_id?: string;
          p_counterparty?: string;
          p_currency_code: string;
          p_description: string;
          p_household_id: string;
          p_kind: string;
          p_next_due_date?: string;
          p_occurrence_date: string;
          p_recurring_rule_id: string;
          p_related_person_id?: string;
          p_status: string;
          p_transfer_account_id?: string;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          asset_id: string | null;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          exchange_rate: number | null;
          household_id: string;
          id: string;
          income_source_id: string | null;
          insurance_claim_id: string | null;
          insurance_policy_id: string | null;
          is_planned: boolean;
          kind: string;
          lending_id: string | null;
          liability_id: string | null;
          loan_id: string | null;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          transfer_destination_amount_minor_units: number | null;
          transfer_fee_minor_units: number | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "transactions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      seed_default_transaction_categories: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      set_investment_sip_status: {
        Args: {
          p_event_type: string;
          p_household_id: string;
          p_investment_sip_id: string;
          p_notes?: string;
          p_status: string;
        };
        Returns: {
          contribution_account_id: string;
          contribution_amount_minor_units: number;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          expected_duration_months: number | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          investment_holding_id: string;
          last_contribution_date: string | null;
          name: string;
          next_due_date: string | null;
          notes: string | null;
          provider: string | null;
          start_date: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "investment_sips";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_recurring_rule_status: {
        Args: {
          p_event_type: string;
          p_household_id: string;
          p_notes?: string;
          p_recurring_rule_id: string;
          p_status: string;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          auto_create_mode: string;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          kind: string;
          last_generated_date: string | null;
          name: string;
          next_due_date: string | null;
          notes: string | null;
          related_person_id: string | null;
          reminder_lead_days: number;
          start_date: string;
          status: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "recurring_rules";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      skip_recurring_rule_occurrence: {
        Args: {
          p_household_id: string;
          p_next_due_date?: string;
          p_notes?: string;
          p_occurrence_date: string;
          p_recurring_rule_id: string;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          auto_create_mode: string;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          currency_code: string;
          end_date: string | null;
          frequency: string;
          household_id: string;
          id: string;
          interval_count: number;
          kind: string;
          last_generated_date: string | null;
          name: string;
          next_due_date: string | null;
          notes: string | null;
          related_person_id: string | null;
          reminder_lead_days: number;
          start_date: string;
          status: string;
          transfer_account_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "recurring_rules";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      start_monthly_closing: {
        Args: {
          p_currency_code: string;
          p_household_id: string;
          p_period: string;
          p_supersedes_closing_id?: string;
        };
        Returns: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          currency_code: string;
          debt_payment_minor_units: number | null;
          expense_total_minor_units: number | null;
          household_id: string;
          id: string;
          income_total_minor_units: number | null;
          investment_contribution_minor_units: number | null;
          net_cash_flow_minor_units: number | null;
          net_worth_snapshot_id: string | null;
          notes: string | null;
          period: string;
          reconciliation_status: string | null;
          reopen_reason: string | null;
          reopened_at: string | null;
          reopened_by: string | null;
          report_version: number;
          started_at: string;
          started_by: string | null;
          status: string;
          supersedes_closing_id: string | null;
          unresolved_items_count: number;
        };
        SetofOptions: {
          from: "*";
          to: "monthly_closings";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
          p_exchange_rate?: number;
          p_household_id: string;
          p_is_planned?: boolean;
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
          p_transfer_destination_amount_minor_units?: number;
          p_transfer_fee_minor_units?: number;
        };
        Returns: {
          account_id: string;
          amount_minor_units: number;
          asset_id: string | null;
          category_id: string | null;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          exchange_rate: number | null;
          household_id: string;
          id: string;
          income_source_id: string | null;
          insurance_claim_id: string | null;
          insurance_policy_id: string | null;
          is_planned: boolean;
          kind: string;
          lending_id: string | null;
          liability_id: string | null;
          loan_id: string | null;
          recurring_rule_id: string | null;
          related_person_id: string | null;
          reverses_transaction_id: string | null;
          source_type: string;
          status: string;
          transaction_date: string;
          transfer_account_id: string | null;
          transfer_destination_amount_minor_units: number | null;
          transfer_fee_minor_units: number | null;
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
