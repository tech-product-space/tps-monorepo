import axios from "axios";
import type { FormFieldConfig } from "./expenseFormsService";

// The public expense form is opened by external (logged-out) users, so these
// calls must NOT go through PrivateAxios — its 401 interceptor would bounce the
// visitor to /auth/login. A bare instance hits the no-auth backend endpoints.
const API = process.env.NEXT_PUBLIC_API_URL;
const PublicAxios = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

export interface PublicFormSubcategory {
  id: string;
  name: string;
}

export interface PublicFormCategory {
  id: string;
  name: string;
  subcategories: PublicFormSubcategory[];
}

export interface PublicFormPaymentAccount {
  id: string;
  name: string;
}

export interface PublicFormConfig {
  name: string;
  team: string | null;
  instructions: string | null;
  field_config: FormFieldConfig;
  categories: PublicFormCategory[];
  // Only populated when the form enables the payment_account field.
  paymentAccounts: PublicFormPaymentAccount[];
}

export interface ExpenseSubmission {
  title: string;
  amount: string;
  currency?: string;
  expense_date: string;
  category_id: string;
  subcategory_id: string | null;
  payment_method?: string | null;
  payment_account_id?: string | null;
  vendor?: string | null;
  notes?: string | null;
  receipt_url?: string | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  submitter_phone?: string | null;
  website?: string; // honeypot
}

export const getPublicForm = async (slug: string) => {
  const res = await PublicAxios.get(`/expense-forms/public/${slug}`);
  return res.data.data as PublicFormConfig;
};

export const submitExpense = async (slug: string, payload: ExpenseSubmission) => {
  const res = await PublicAxios.post(`/expense-forms/public/${slug}/submit`, payload);
  return res.data;
};

export const uploadFormReceipt = async (slug: string, file: File) => {
  const form = new FormData();
  form.append("receipt", file);
  // Bare call so axios sets the multipart boundary itself.
  const res = await axios.post(`${API}/expense-forms/public/${slug}/upload-receipt`, form);
  return res.data as { success: boolean; url: string; key: string };
};
