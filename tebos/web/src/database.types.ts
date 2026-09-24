// Generated from the tebos-core schema (Supabase type generator). Do not edit by hand.
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
      action_dependencies: {
        Row: {
          action_id: string
          business_id: string
          created_at: string
          depends_on_action_id: string
          org_id: string
        }
        Insert: {
          action_id: string
          business_id: string
          created_at?: string
          depends_on_action_id: string
          org_id: string
        }
        Update: {
          action_id?: string
          business_id?: string
          created_at?: string
          depends_on_action_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_dependencies_action_id_business_id_fkey"
            columns: ["action_id", "business_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "action_dependencies_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "action_dependencies_depends_on_action_id_business_id_fkey"
            columns: ["depends_on_action_id", "business_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      action_runs: {
        Row: {
          action_id: string
          approval_id: string | null
          capability_key: string | null
          connection_instance_id: string | null
          created_at: string
          error_class: string | null
          error_detail: string | null
          execution_method: string
          finished_at: string | null
          id: string
          idempotency_key: string
          org_id: string
          request_summary: Json | null
          response_summary: Json | null
          started_at: string | null
          status: string
          verification_method: string | null
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          action_id: string
          approval_id?: string | null
          capability_key?: string | null
          connection_instance_id?: string | null
          created_at?: string
          error_class?: string | null
          error_detail?: string | null
          execution_method: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          org_id: string
          request_summary?: Json | null
          response_summary?: Json | null
          started_at?: string | null
          status?: string
          verification_method?: string | null
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          action_id?: string
          approval_id?: string | null
          capability_key?: string | null
          connection_instance_id?: string | null
          created_at?: string
          error_class?: string | null
          error_detail?: string | null
          execution_method?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          org_id?: string
          request_summary?: Json | null
          response_summary?: Json | null
          started_at?: string | null
          status?: string
          verification_method?: string | null
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_runs_action_id_org_id_fkey"
            columns: ["action_id", "org_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "action_runs_approval_id_org_id_fkey"
            columns: ["approval_id", "org_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "action_runs_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "action_runs_connection_instance_id_org_id_fkey"
            columns: ["connection_instance_id", "org_id"]
            isOneToOne: false
            referencedRelation: "connection_instances"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      actions: {
        Row: {
          approval_required: boolean
          blocked_reason: string | null
          business_id: string
          capability_key: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          evidence_requirement: string | null
          execution_method: string
          expected_outcome: string | null
          finding_id: string
          id: string
          idempotency_key: string | null
          objective: string
          org_id: string
          owner_user_id: string | null
          priority: number
          result: string | null
          risk_tier: number
          status: string
          title: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          approval_required: boolean
          blocked_reason?: string | null
          business_id: string
          capability_key?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          evidence_requirement?: string | null
          execution_method?: string
          expected_outcome?: string | null
          finding_id: string
          id?: string
          idempotency_key?: string | null
          objective: string
          org_id: string
          owner_user_id?: string | null
          priority?: number
          result?: string | null
          risk_tier: number
          status?: string
          title: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          approval_required?: boolean
          blocked_reason?: string | null
          business_id?: string
          capability_key?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          evidence_requirement?: string | null
          execution_method?: string
          expected_outcome?: string | null
          finding_id?: string
          id?: string
          idempotency_key?: string | null
          objective?: string
          org_id?: string
          owner_user_id?: string | null
          priority?: number
          result?: string | null
          risk_tier?: number
          status?: string
          title?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "actions_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "actions_finding_id_business_id_fkey"
            columns: ["finding_id", "business_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          action_id: string | null
          agent_role: string
          business_id: string | null
          error_detail: string | null
          finished_at: string | null
          id: string
          input_context: Json
          model: string | null
          model_provider: string | null
          org_id: string
          output_summary: Json | null
          purpose: string
          scan_id: string | null
          started_at: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          action_id?: string | null
          agent_role: string
          business_id?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          input_context?: Json
          model?: string | null
          model_provider?: string | null
          org_id: string
          output_summary?: Json | null
          purpose: string
          scan_id?: string | null
          started_at?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          action_id?: string | null
          agent_role?: string
          business_id?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          input_context?: Json
          model?: string | null
          model_provider?: string | null
          org_id?: string
          output_summary?: Json | null
          purpose?: string
          scan_id?: string | null
          started_at?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_action_id_org_id_fkey"
            columns: ["action_id", "org_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "agent_runs_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "agent_runs_scan_id_org_id_fkey"
            columns: ["scan_id", "org_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      approvals: {
        Row: {
          action_id: string
          consumed_at: string | null
          data_scope: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string | null
          id: string
          org_id: string
          proposed_action: Json
          requested_at: string
          requested_by: string | null
          requested_by_actor: string
          requested_operation: string
          risk_tier: number
          single_use: boolean
          status: string
        }
        Insert: {
          action_id: string
          consumed_at?: string | null
          data_scope?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          org_id: string
          proposed_action?: Json
          requested_at?: string
          requested_by?: string | null
          requested_by_actor?: string
          requested_operation: string
          risk_tier: number
          single_use?: boolean
          status?: string
        }
        Update: {
          action_id?: string
          consumed_at?: string | null
          data_scope?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string | null
          id?: string
          org_id?: string
          proposed_action?: Json
          requested_at?: string
          requested_by?: string | null
          requested_by_actor?: string
          requested_operation?: string
          risk_tier?: number
          single_use?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_action_id_org_id_fkey"
            columns: ["action_id", "org_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after: Json | null
          before: Json | null
          entity_id: string | null
          entity_type: string
          hash: string
          id: number
          occurred_at: string
          org_id: string | null
          prev_hash: string | null
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type: string
          hash: string
          id?: never
          occurred_at?: string
          org_id?: string | null
          prev_hash?: string | null
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type?: string
          hash?: string
          id?: never
          occurred_at?: string
          org_id?: string | null
          prev_hash?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_contexts: {
        Row: {
          business_id: string
          created_at: string
          id: string
          kind: string
          org_id: string
          retired_at: string | null
          statement: string
          supplied_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          kind: string
          org_id: string
          retired_at?: string | null
          statement: string
          supplied_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          retired_at?: string | null
          statement?: string
          supplied_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_contexts_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      businesses: {
        Row: {
          archived_at: string | null
          business_model: string | null
          created_at: string
          created_by: string | null
          geography: string | null
          id: string
          industry: string | null
          legal_name: string | null
          name: string
          org_id: string
          primary_domain: string | null
          size_context: string | null
          trading_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          business_model?: string | null
          created_at?: string
          created_by?: string | null
          geography?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name: string
          org_id: string
          primary_domain?: string | null
          size_context?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          business_model?: string | null
          created_at?: string
          created_by?: string | null
          geography?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name?: string
          org_id?: string
          primary_domain?: string | null
          size_context?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          created_at: string
          default_risk_tier: number
          description: string | null
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          default_risk_tier: number
          description?: string | null
          key: string
          name: string
        }
        Update: {
          created_at?: string
          default_risk_tier?: number
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      connection_instances: {
        Row: {
          business_id: string | null
          connector_key: string
          created_at: string
          created_by: string | null
          credential_ref_id: string | null
          failure_detail: string | null
          granted_scopes: string[]
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          last_verified_at: string | null
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          connector_key: string
          created_at?: string
          created_by?: string | null
          credential_ref_id?: string | null
          failure_detail?: string | null
          granted_scopes?: string[]
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          org_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          connector_key?: string
          created_at?: string
          created_by?: string | null
          credential_ref_id?: string | null
          failure_detail?: string | null
          granted_scopes?: string[]
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_instances_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "connection_instances_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "connection_instances_credential_ref_id_org_id_fkey"
            columns: ["credential_ref_id", "org_id"]
            isOneToOne: false
            referencedRelation: "credential_references"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "connection_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_capabilities: {
        Row: {
          capability_key: string
          connector_key: string
          operation: string
          required_scopes: string[]
          risk_tier: number
        }
        Insert: {
          capability_key: string
          connector_key: string
          operation: string
          required_scopes?: string[]
          risk_tier: number
        }
        Update: {
          capability_key?: string
          connector_key?: string
          operation?: string
          required_scopes?: string[]
          risk_tier?: number
        }
        Relationships: [
          {
            foreignKeyName: "connector_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "connector_capabilities_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["key"]
          },
        ]
      }
      connectors: {
        Row: {
          auth_method: string
          created_at: string
          data_sensitivity: string
          execution_method: string
          key: string
          name: string
          provider: string
          rate_limit: Json | null
          supports_polling: boolean
          supports_webhooks: boolean
        }
        Insert: {
          auth_method: string
          created_at?: string
          data_sensitivity?: string
          execution_method: string
          key: string
          name: string
          provider: string
          rate_limit?: Json | null
          supports_polling?: boolean
          supports_webhooks?: boolean
        }
        Update: {
          auth_method?: string
          created_at?: string
          data_sensitivity?: string
          execution_method?: string
          key?: string
          name?: string
          provider?: string
          rate_limit?: Json | null
          supports_polling?: boolean
          supports_webhooks?: boolean
        }
        Relationships: []
      }
      credential_references: {
        Row: {
          connector_key: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          org_id: string
          revoked_at: string | null
          rotated_at: string | null
          vault_ref: string
        }
        Insert: {
          connector_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          org_id: string
          revoked_at?: string | null
          rotated_at?: string | null
          vault_ref: string
        }
        Update: {
          connector_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          org_id?: string
          revoked_at?: string | null
          rotated_at?: string | null
          vault_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_references_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "connectors"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "credential_references_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          business_id: string
          confidence: number | null
          content_location: string | null
          created_at: string
          created_by_actor: string
          excerpt: string | null
          extraction_status: string | null
          fact: string | null
          fresh_until: string | null
          id: string
          missing_description: string | null
          org_id: string
          retrieved_at: string | null
          scan_id: string | null
          scan_target_id: string | null
          source_id: string
          state: string
          structured_value: Json | null
        }
        Insert: {
          business_id: string
          confidence?: number | null
          content_location?: string | null
          created_at?: string
          created_by_actor?: string
          excerpt?: string | null
          extraction_status?: string | null
          fact?: string | null
          fresh_until?: string | null
          id?: string
          missing_description?: string | null
          org_id: string
          retrieved_at?: string | null
          scan_id?: string | null
          scan_target_id?: string | null
          source_id: string
          state: string
          structured_value?: Json | null
        }
        Update: {
          business_id?: string
          confidence?: number | null
          content_location?: string | null
          created_at?: string
          created_by_actor?: string
          excerpt?: string | null
          extraction_status?: string | null
          fact?: string | null
          fresh_until?: string | null
          id?: string
          missing_description?: string | null
          org_id?: string
          retrieved_at?: string | null
          scan_id?: string | null
          scan_target_id?: string | null
          source_id?: string
          state?: string
          structured_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "evidence_scan_id_business_id_fkey"
            columns: ["scan_id", "business_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "evidence_scan_target_id_org_id_fkey"
            columns: ["scan_target_id", "org_id"]
            isOneToOne: false
            referencedRelation: "scan_targets"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "evidence_source_id_business_id_fkey"
            columns: ["source_id", "business_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      finding_evidence: {
        Row: {
          business_id: string
          created_at: string
          evidence_id: string
          finding_id: string
          note: string | null
          org_id: string
          relation: string
        }
        Insert: {
          business_id: string
          created_at?: string
          evidence_id: string
          finding_id: string
          note?: string | null
          org_id: string
          relation?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          evidence_id?: string
          finding_id?: string
          note?: string | null
          org_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_evidence_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "finding_evidence_evidence_id_business_id_fkey"
            columns: ["evidence_id", "business_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "finding_evidence_finding_id_business_id_fkey"
            columns: ["finding_id", "business_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      findings: {
        Row: {
          business_id: string
          category: string
          confidence: number
          confidence_components: Json | null
          created_at: string
          created_by_actor: string
          id: string
          impact_hypothesis: string | null
          kind: string
          missing_information: string[]
          org_id: string
          scan_id: string | null
          statement: string
          status: string
          superseded_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          category: string
          confidence: number
          confidence_components?: Json | null
          created_at?: string
          created_by_actor?: string
          id?: string
          impact_hypothesis?: string | null
          kind?: string
          missing_information?: string[]
          org_id: string
          scan_id?: string | null
          statement: string
          status?: string
          superseded_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string
          confidence?: number
          confidence_components?: Json | null
          created_at?: string
          created_by_actor?: string
          id?: string
          impact_hypothesis?: string | null
          kind?: string
          missing_information?: string[]
          org_id?: string
          scan_id?: string | null
          statement?: string
          status?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "findings_scan_id_business_id_fkey"
            columns: ["scan_id", "business_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "findings_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          connection_instance_id: string
          event_type: string
          id: string
          org_id: string
          payload_summary: Json | null
          processed_at: string | null
          provider_event_id: string
          received_at: string
        }
        Insert: {
          connection_instance_id: string
          event_type: string
          id?: string
          org_id: string
          payload_summary?: Json | null
          processed_at?: string | null
          provider_event_id: string
          received_at?: string
        }
        Update: {
          connection_instance_id?: string
          event_type?: string
          id?: string
          org_id?: string
          payload_summary?: Json | null
          processed_at?: string | null
          provider_event_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_connection_instance_id_org_id_fkey"
            columns: ["connection_instance_id", "org_id"]
            isOneToOne: false
            referencedRelation: "connection_instances"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      outcomes: {
        Row: {
          action_id: string
          baseline_value: number | null
          created_at: string
          evidence_id: string | null
          expected_value: number | null
          id: string
          metric: string
          note: string | null
          observed_at: string | null
          observed_value: number | null
          org_id: string
          unit: string | null
          verification_method: string | null
          verified_at: string | null
        }
        Insert: {
          action_id: string
          baseline_value?: number | null
          created_at?: string
          evidence_id?: string | null
          expected_value?: number | null
          id?: string
          metric: string
          note?: string | null
          observed_at?: string | null
          observed_value?: number | null
          org_id: string
          unit?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Update: {
          action_id?: string
          baseline_value?: number | null
          created_at?: string
          evidence_id?: string | null
          expected_value?: number | null
          id?: string
          metric?: string
          note?: string | null
          observed_at?: string | null
          observed_value?: number | null
          org_id?: string
          unit?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_action_id_org_id_fkey"
            columns: ["action_id", "org_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "outcomes_evidence_id_org_id_fkey"
            columns: ["evidence_id", "org_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scan_targets: {
        Row: {
          attempted_at: string | null
          bytes: number | null
          content_hash: string | null
          created_at: string
          failure_class: string | null
          failure_detail: string | null
          http_status: number | null
          id: string
          org_id: string
          scan_id: string
          source_id: string | null
          status: string
          uri: string
        }
        Insert: {
          attempted_at?: string | null
          bytes?: number | null
          content_hash?: string | null
          created_at?: string
          failure_class?: string | null
          failure_detail?: string | null
          http_status?: number | null
          id?: string
          org_id: string
          scan_id: string
          source_id?: string | null
          status?: string
          uri: string
        }
        Update: {
          attempted_at?: string | null
          bytes?: number | null
          content_hash?: string | null
          created_at?: string
          failure_class?: string | null
          failure_detail?: string | null
          http_status?: number | null
          id?: string
          org_id?: string
          scan_id?: string
          source_id?: string | null
          status?: string
          uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_targets_scan_id_org_id_fkey"
            columns: ["scan_id", "org_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "scan_targets_source_id_org_id_fkey"
            columns: ["source_id", "org_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      scans: {
        Row: {
          business_id: string
          confidence: number | null
          confidence_components: Json | null
          created_at: string
          failure_class: string | null
          failure_detail: string | null
          finished_at: string | null
          id: string
          objective: string | null
          org_id: string
          requested_by: string | null
          scope: Json
          started_at: string | null
          status: string
          target_limit: number
        }
        Insert: {
          business_id: string
          confidence?: number | null
          confidence_components?: Json | null
          created_at?: string
          failure_class?: string | null
          failure_detail?: string | null
          finished_at?: string | null
          id?: string
          objective?: string | null
          org_id: string
          requested_by?: string | null
          scope?: Json
          started_at?: string | null
          status?: string
          target_limit?: number
        }
        Update: {
          business_id?: string
          confidence?: number | null
          confidence_components?: Json | null
          created_at?: string
          failure_class?: string | null
          failure_detail?: string | null
          finished_at?: string | null
          id?: string
          objective?: string | null
          org_id?: string
          requested_by?: string | null
          scope?: Json
          started_at?: string | null
          status?: string
          target_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "scans_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      sources: {
        Row: {
          business_id: string
          created_at: string
          id: string
          label: string | null
          org_id: string
          reliability: number | null
          source_type: string
          uri: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          label?: string | null
          org_id: string
          reliability?: number | null
          source_type: string
          uri?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          label?: string | null
          org_id?: string
          reliability?: number | null
          source_type?: string
          uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_business_id_org_id_fkey"
            columns: ["business_id", "org_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      state_transitions: {
        Row: {
          from_state: string
          machine: string
          to_state: string
        }
        Insert: {
          from_state: string
          machine: string
          to_state: string
        }
        Update: {
          from_state?: string
          machine?: string
          to_state?: string
        }
        Relationships: []
      }
      tool_calls: {
        Row: {
          agent_run_id: string
          capability_key: string | null
          created_at: string
          error_detail: string | null
          id: string
          input_summary: Json | null
          latency_ms: number | null
          org_id: string
          output_summary: Json | null
          permissions_used: string[]
          status: string
          tool: string
        }
        Insert: {
          agent_run_id: string
          capability_key?: string | null
          created_at?: string
          error_detail?: string | null
          id?: string
          input_summary?: Json | null
          latency_ms?: number | null
          org_id: string
          output_summary?: Json | null
          permissions_used?: string[]
          status: string
          tool: string
        }
        Update: {
          agent_run_id?: string
          capability_key?: string | null
          created_at?: string
          error_detail?: string | null
          id?: string
          input_summary?: Json | null
          latency_ms?: number | null
          org_id?: string
          output_summary?: Json | null
          permissions_used?: string[]
          status?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_calls_agent_run_id_org_id_fkey"
            columns: ["agent_run_id", "org_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "tool_calls_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      create_invitation: {
        Args: { p_email: string; p_org: string; p_role: string }
        Returns: string
      }
      create_organisation: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
