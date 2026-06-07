import { z } from 'zod';

export const planStatusSchema = z.enum(['draft', 'ready_for_approval', 'approved', 'implemented', 'failed']);
export const riskLevelSchema = z.enum(['low', 'medium', 'high']);

export const conditionSchema = z.object({
  variable: z.string().min(1),
  operator: z.enum(['equals', 'contains', 'matches_regex']),
  value: z.string().min(1)
});

export const createVariableActionSchema = z.object({
  action: z.literal('create_variable'),
  name: z.string().min(1),
  variableType: z.enum(['data_layer', 'constant', 'url', 'click']),
  value: z.string().optional()
});

export const createTriggerActionSchema = z.object({
  action: z.literal('create_trigger'),
  name: z.string().min(1),
  triggerType: z.enum(['pageview', 'click', 'form_submit', 'custom_event']),
  conditions: z.array(conditionSchema).optional()
});

export const createTagActionSchema = z.object({
  action: z.literal('create_tag'),
  name: z.string().min(1),
  tagType: z.enum(['custom_html', 'ga4_event', 'meta_pixel', 'tiktok_pixel', 'google_tag']),
  html: z.string().optional(),
  parameters: z.record(z.string(), z.string()).optional(),
  triggerName: z.string().min(1)
});

export const gtmActionSchema = z.discriminatedUnion('action', [
  createVariableActionSchema,
  createTriggerActionSchema,
  createTagActionSchema
]);

export const implementationPlanSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  containerId: z.string().min(1),
  workspaceName: z.string().min(1),
  status: planStatusSchema,
  riskLevel: riskLevelSchema,
  summary: z.string().min(1),
  actions: z.array(gtmActionSchema).min(1)
});

export const implementationRequestSchema = z.object({
  clientId: z.string().min(1),
  command: z.string().min(1),
  recommendation: z.any().optional(),
  answers: z.record(z.string(), z.string()).optional()
});

export const requirementsAnswerSchema = z.object({
  requestId: z.string().min(1),
  answers: z.record(z.string(), z.string().min(1))
});

export const planRequestSchema = z.object({
  requestId: z.string().optional(),
  clientId: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  recommendation: z.any().optional(),
  answers: z.record(z.string(), z.string()).optional()
});

export const approveRequestSchema = z.object({
  planId: z.string().min(1)
});

export const executeRequestSchema = z.object({
  planId: z.string().min(1)
});

export const docsParseRequestSchema = z.object({
  clientId: z.string().min(1),
  vendorName: z.string().min(1),
  documentation: z.string().min(20)
});

export type PlanStatus = z.infer<typeof planStatusSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type GTMCondition = z.infer<typeof conditionSchema>;
export type GTMAction = z.infer<typeof gtmActionSchema>;
export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;
export type ImplementationRequestInput = z.infer<typeof implementationRequestSchema>;

export type NeedsInfoResponse = {
  status: 'needs_info';
  requestId: string;
  missingFields: string[];
  questions: string[];
};

export type PlanValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
  riskLevel: RiskLevel;
};

export type CreatedResource = {
  actionName: string;
  resourceType: 'variable' | 'trigger' | 'tag' | 'workspace';
  id?: string;
  path?: string;
  tagManagerUrl?: string;
  status: 'created' | 'skipped';
  reason?: string;
};

export type ExecutionResult = {
  status: 'implemented' | 'failed';
  workspace?: {
    workspaceId?: string;
    path?: string;
    tagManagerUrl?: string;
    name?: string;
  };
  resources: CreatedResource[];
  errors: Array<{ actionName?: string; message: string }>;
};

export type RequirementContext = {
  clientId: string;
  command: string;
  recommendation?: unknown;
  answers?: Record<string, string>;
  ga4MeasurementId?: string;
};
