export interface ILeadType {
  id: string;
  name: string;
  description?: string;
}

export interface IExternalLead {
  id: string
  external_lead_id: string
  external_created_at: string
  name?: string | null
  email?: string | null
  phone?: string | null
  source: string
  type_id?: string | null
  external_form_id?: string | null
  form_data: Record<string, any>
  additional_data: Record<string, any>
  createdAt: string
  updatedAt: string
}