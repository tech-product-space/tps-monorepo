export interface ILead {
  id: number | string;
  name: string;
  email: string;
  phone: string;
  assignedTo: string;
  type: string;
  status?: string;
  additionalData?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
};
