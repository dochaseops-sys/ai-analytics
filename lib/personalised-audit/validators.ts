import { z } from 'zod';

export function parseJsonFromModel<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  return schema.parse(JSON.parse(cleaned));
}

export function includesPattern(value: string, patterns: string[]) {
  const lower = value.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export function normaliseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function hasPotentialPiiName(value: string) {
  return /(email|e_mail|phone|mobile|name|patient|dob|date_of_birth|address|postcode|zip|diagnosis|condition|student_id|account_number|ssn|nin|bvn)/i.test(value);
}
