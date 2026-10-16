export interface ContractTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  defaultContent: string;
  defaultClauses: ContractClause[];
  defaultPaymentTerms: PaymentTerm[];
  requiredFields: string[];
}

export interface ContractClause {
  id: string;
  title: string;
  content: string;
  isRequired: boolean;
  order: number;
}

export interface PaymentTerm {
  id: string;
  description: string;
  amount: string;
  currency: string;
  dueDate: string;
  isAutomatic: boolean;
}

export interface ContractParty {
  id: string;
  name: string;
  email: string;
  role: 'creator' | 'signer' | 'witness';
  walletAddress?: string;
}

export interface ContractFormData {
  title: string;
  description: string;
  content: string;
  parties: ContractParty[];
  clauses: ContractClause[];
  paymentTerms: PaymentTerm[];
  startDate: string;
  endDate: string;
  jurisdiction: string;
  isConfidential: boolean;
  requiresNotarization: boolean;
  templateId?: string;
}