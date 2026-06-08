import { PersonalisedAuditContext, PersonalisedRuleDefinition } from './types';

export function getApplicableRules(context: PersonalisedAuditContext, registry: PersonalisedRuleDefinition[]) {
  const model = context.clientProfile.businessModel;
  return registry.filter((rule) => rule.enabled && (rule.appliesToBusinessModels.includes('all') || rule.appliesToBusinessModels.includes(model)));
}
