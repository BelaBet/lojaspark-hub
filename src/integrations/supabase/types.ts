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
      clientes: {
        Row: {
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco: Json | null
          id: string
          loja_id: string
          nome: string
          observacoes: string | null
          pontos: number
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: Json | null
          id?: string
          loja_id: string
          nome: string
          observacoes?: string | null
          pontos?: number
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: Json | null
          id?: string
          loja_id?: string
          nome?: string
          observacoes?: string | null
          pontos?: number
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          deposito: string
          id: string
          loja_id: string
          produto_id: string
          quantidade: number
          quantidade_minima: number
          updated_at: string
        }
        Insert: {
          deposito?: string
          id?: string
          loja_id: string
          produto_id: string
          quantidade?: number
          quantidade_minima?: number
          updated_at?: string
        }
        Update: {
          deposito?: string
          id?: string
          loja_id?: string
          produto_id?: string
          quantidade?: number
          quantidade_minima?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_usuarios: {
        Row: {
          created_at: string
          id: string
          loja_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          loja_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          loja_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loja_usuarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_usuarios_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      lojas: {
        Row: {
          cnpj: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          nome: string
          onboarding_completo: boolean
          pagarme_recipient_id: string | null
          plano: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          onboarding_completo?: boolean
          pagarme_recipient_id?: string | null
          plano?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          onboarding_completo?: boolean
          pagarme_recipient_id?: string | null
          plano?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lojas_config_fiscal: {
        Row: {
          ambiente: string
          cert_pfx_url: string | null
          cert_senha: string | null
          created_at: string
          csc_id: string | null
          csc_token: string | null
          loja_id: string
          regime_tributario: string
          serie_nfce: string
          serie_nfe: string
          ultimo_numero_nfce: number
          ultimo_numero_nfe: number
          updated_at: string
        }
        Insert: {
          ambiente?: string
          cert_pfx_url?: string | null
          cert_senha?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          loja_id: string
          regime_tributario?: string
          serie_nfce?: string
          serie_nfe?: string
          ultimo_numero_nfce?: number
          ultimo_numero_nfe?: number
          updated_at?: string
        }
        Update: {
          ambiente?: string
          cert_pfx_url?: string | null
          cert_senha?: string | null
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          loja_id?: string
          regime_tributario?: string
          serie_nfce?: string
          serie_nfe?: string
          ultimo_numero_nfce?: number
          ultimo_numero_nfe?: number
          updated_at?: string
        }
        Relationships: []
      }
      maquininhas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          localizacao: string | null
          loja_id: string
          nome: string
          serial: string
          ultima_atividade: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          localizacao?: string | null
          loja_id: string
          nome: string
          serial: string
          ultima_atividade?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          localizacao?: string | null
          loja_id?: string
          nome?: string
          serial?: string
          ultima_atividade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          created_at: string
          deposito: string
          id: string
          loja_id: string
          motivo: string | null
          produto_id: string
          quantidade: number
          ref_venda_id: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          deposito?: string
          id?: string
          loja_id: string
          motivo?: string | null
          produto_id: string
          quantidade: number
          ref_venda_id?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          deposito?: string
          id?: string
          loja_id?: string
          motivo?: string | null
          produto_id?: string
          quantidade?: number
          ref_venda_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_ref_venda_id_fkey"
            columns: ["ref_venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          cancelada_at: string | null
          chave_acesso: string | null
          created_at: string
          danfe_url: string | null
          emitida_at: string | null
          id: string
          loja_id: string
          motivo_rejeicao: string | null
          numero: number | null
          protocolo: string | null
          ref_focusnfe: string | null
          serie: string | null
          status: string
          tipo: string
          venda_id: string | null
          xml_autorizado: string | null
        }
        Insert: {
          cancelada_at?: string | null
          chave_acesso?: string | null
          created_at?: string
          danfe_url?: string | null
          emitida_at?: string | null
          id?: string
          loja_id: string
          motivo_rejeicao?: string | null
          numero?: number | null
          protocolo?: string | null
          ref_focusnfe?: string | null
          serie?: string | null
          status?: string
          tipo: string
          venda_id?: string | null
          xml_autorizado?: string | null
        }
        Update: {
          cancelada_at?: string | null
          chave_acesso?: string | null
          created_at?: string
          danfe_url?: string | null
          emitida_at?: string | null
          id?: string
          loja_id?: string
          motivo_rejeicao?: string | null
          numero?: number | null
          protocolo?: string | null
          ref_focusnfe?: string | null
          serie?: string | null
          status?: string
          tipo?: string
          venda_id?: string | null
          xml_autorizado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          aliquota_icms: number | null
          ativo: boolean
          categoria: string | null
          cfop: string | null
          created_at: string
          cst_cofins: string | null
          cst_icms: string | null
          cst_pis: string | null
          descricao: string | null
          ean: string | null
          fornecedor: string | null
          fotos: string[]
          id: string
          loja_id: string
          marca: string | null
          ncm: string | null
          nome: string
          preco_atacado: number | null
          preco_custo: number
          preco_venda: number
          sku: string | null
          unidade_medida: string | null
          updated_at: string
        }
        Insert: {
          aliquota_icms?: number | null
          ativo?: boolean
          categoria?: string | null
          cfop?: string | null
          created_at?: string
          cst_cofins?: string | null
          cst_icms?: string | null
          cst_pis?: string | null
          descricao?: string | null
          ean?: string | null
          fornecedor?: string | null
          fotos?: string[]
          id?: string
          loja_id: string
          marca?: string | null
          ncm?: string | null
          nome: string
          preco_atacado?: number | null
          preco_custo?: number
          preco_venda?: number
          sku?: string | null
          unidade_medida?: string | null
          updated_at?: string
        }
        Update: {
          aliquota_icms?: number | null
          ativo?: boolean
          categoria?: string | null
          cfop?: string | null
          created_at?: string
          cst_cofins?: string | null
          cst_icms?: string | null
          cst_pis?: string | null
          descricao?: string | null
          ean?: string | null
          fornecedor?: string | null
          fotos?: string[]
          id?: string
          loja_id?: string
          marca?: string | null
          ncm?: string | null
          nome?: string
          preco_atacado?: number | null
          preco_custo?: number
          preco_venda?: number
          sku?: string | null
          unidade_medida?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
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
      venda_itens: {
        Row: {
          desconto: number
          id: string
          preco_unit: number
          produto_id: string | null
          quantidade: number
          subtotal: number | null
          venda_id: string
        }
        Insert: {
          desconto?: number
          id?: string
          preco_unit: number
          produto_id?: string | null
          quantidade: number
          subtotal?: number | null
          venda_id: string
        }
        Update: {
          desconto?: number
          id?: string
          preco_unit?: number
          produto_id?: string | null
          quantidade?: number
          subtotal?: number | null
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          base_amount: number | null
          cliente_id: string | null
          created_at: string
          desconto: number
          device_serial: string | null
          forma_pagamento: string | null
          id: string
          installments: number | null
          loja_id: string
          observacoes: string | null
          pagamento_status: string
          pagarme_charge_id: string | null
          pagarme_order_id: string | null
          paid_at: string | null
          payment_channel: string | null
          platform_amount: number | null
          recibo_url: string | null
          seller_amount: number | null
          seller_recipient_id: string | null
          split_rules: Json | null
          status: string
          total: number
          updated_at: string
          vendedor_id: string | null
          vendedor_nome: string | null
        }
        Insert: {
          base_amount?: number | null
          cliente_id?: string | null
          created_at?: string
          desconto?: number
          device_serial?: string | null
          forma_pagamento?: string | null
          id?: string
          installments?: number | null
          loja_id: string
          observacoes?: string | null
          pagamento_status?: string
          pagarme_charge_id?: string | null
          pagarme_order_id?: string | null
          paid_at?: string | null
          payment_channel?: string | null
          platform_amount?: number | null
          recibo_url?: string | null
          seller_amount?: number | null
          seller_recipient_id?: string | null
          split_rules?: Json | null
          status?: string
          total?: number
          updated_at?: string
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          base_amount?: number | null
          cliente_id?: string | null
          created_at?: string
          desconto?: number
          device_serial?: string | null
          forma_pagamento?: string | null
          id?: string
          installments?: number | null
          loja_id?: string
          observacoes?: string | null
          pagamento_status?: string
          pagarme_charge_id?: string | null
          pagarme_order_id?: string | null
          paid_at?: string | null
          payment_channel?: string | null
          platform_amount?: number | null
          recibo_url?: string | null
          seller_amount?: number | null
          seller_recipient_id?: string | null
          split_rules?: Json | null
          status?: string
          total?: number
          updated_at?: string
          vendedor_id?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_loja_id_fkey"
            columns: ["loja_id"]
            isOneToOne: false
            referencedRelation: "lojas_publico"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          auth_ok: boolean | null
          created_at: string
          error: string | null
          event_type: string | null
          headers: Json | null
          http_status: number | null
          id: string
          ip: string | null
          pagarme_charge_id: string | null
          pagarme_order_id: string | null
          payload: Json | null
          response: Json | null
          source: string
          venda_id: string | null
        }
        Insert: {
          auth_ok?: boolean | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json | null
          http_status?: number | null
          id?: string
          ip?: string | null
          pagarme_charge_id?: string | null
          pagarme_order_id?: string | null
          payload?: Json | null
          response?: Json | null
          source?: string
          venda_id?: string | null
        }
        Update: {
          auth_ok?: boolean | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          headers?: Json | null
          http_status?: number | null
          id?: string
          ip?: string | null
          pagarme_charge_id?: string | null
          pagarme_order_id?: string | null
          payload?: Json | null
          response?: Json | null
          source?: string
          venda_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      lojas_publico: {
        Row: {
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string | null
          id: string | null
          logo_url: string | null
          nome: string | null
          onboarding_completo: boolean | null
          plano: string | null
          updated_at: string | null
        }
        Insert: {
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          nome?: string | null
          onboarding_completo?: boolean | null
          plano?: string | null
          updated_at?: string | null
        }
        Update: {
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          nome?: string | null
          onboarding_completo?: boolean | null
          plano?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_loja_id: { Args: never; Returns: string }
      get_loja_pagarme_recipient: { Args: never; Returns: string }
      has_app_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_loja_role:
        | { Args: { _loja_id: string; _role: string }; Returns: boolean }
        | { Args: { _role: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin"
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
      app_role: ["super_admin"],
    },
  },
} as const
