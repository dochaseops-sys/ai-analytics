import { google, tagmanager_v2 } from 'googleapis';
import { adminDb } from '@/lib/firebase-admin';
import { getValidAccessToken } from '@/lib/google-auth';
import { CreatedResource, ExecutionResult, GTMAction, ImplementationPlan } from './types';

type ResourceMaps = {
  variables: Map<string, tagmanager_v2.Schema$Variable>;
  triggers: Map<string, tagmanager_v2.Schema$Trigger>;
  tags: Map<string, tagmanager_v2.Schema$Tag>;
};

const param = (key: string, value: string, type = 'template'): tagmanager_v2.Schema$Parameter => ({ key, type, value });

function conditionToGtm(condition: NonNullable<Extract<GTMAction, { action: 'create_trigger' }>['conditions']>[number]) {
  const operatorMap = {
    equals: 'equals',
    contains: 'contains',
    matches_regex: 'matchesRegex'
  };

  return {
    type: operatorMap[condition.operator],
    parameter: [
      param('arg0', `{{${condition.variable}}}`),
      param('arg1', condition.value)
    ]
  };
}

function variableBody(action: Extract<GTMAction, { action: 'create_variable' }>): tagmanager_v2.Schema$Variable {
  if (action.variableType === 'constant') {
    return { name: action.name, type: 'c', parameter: [param('value', action.value || '')] };
  }
  if (action.variableType === 'url') {
    return { name: action.name, type: 'u' };
  }
  if (action.variableType === 'click') {
    return { name: action.name, type: 'aev', parameter: [param('varType', action.value || 'ELEMENT_URL')] };
  }
  return { name: action.name, type: 'v', parameter: [param('name', action.value || action.name)] };
}

function triggerBody(action: Extract<GTMAction, { action: 'create_trigger' }>): tagmanager_v2.Schema$Trigger {
  const typeMap = {
    pageview: 'pageview',
    click: 'click',
    form_submit: 'formSubmission',
    custom_event: 'customEvent'
  };

  const body: tagmanager_v2.Schema$Trigger = {
    name: action.name,
    type: typeMap[action.triggerType]
  };

  if (action.triggerType === 'custom_event') {
    body.eventName = param('eventName', action.conditions?.find((item) => item.variable === 'Event')?.value || action.name);
  }

  if (action.conditions?.length) {
    body.filter = action.conditions.map(conditionToGtm);
  }

  return body;
}

function tagBody(action: Extract<GTMAction, { action: 'create_tag' }>, triggerId: string): tagmanager_v2.Schema$Tag {
  if (action.tagType === 'google_tag') {
    return {
      name: action.name,
      type: 'googtag',
      parameter: [
        param('tagId', action.parameters?.measurementId || '')
      ],
      firingTriggerId: [triggerId]
    };
  }

  if (action.tagType === 'ga4_event') {
    return {
      name: action.name,
      type: 'gaawe',
      parameter: [
        param('measurementIdOverride', action.parameters?.measurementId || ''),
        param('eventName', action.parameters?.eventName || action.name)
      ],
      firingTriggerId: [triggerId]
    };
  }

  return {
    name: action.name,
    type: 'html',
    parameter: [param('html', action.html || action.parameters?.html || '')],
    firingTriggerId: [triggerId]
  };
}

async function listResources(tagmanager: tagmanager_v2.Tagmanager, workspacePath: string): Promise<ResourceMaps> {
  const [variablesRes, triggersRes, tagsRes] = await Promise.all([
    tagmanager.accounts.containers.workspaces.variables.list({ parent: workspacePath }),
    tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspacePath }),
    tagmanager.accounts.containers.workspaces.tags.list({ parent: workspacePath })
  ]);

  return {
    variables: new Map((variablesRes.data.variable || []).map((item) => [(item.name || '').toLowerCase(), item])),
    triggers: new Map((triggersRes.data.trigger || []).map((item) => [(item.name || '').toLowerCase(), item])),
    tags: new Map((tagsRes.data.tag || []).map((item) => [(item.name || '').toLowerCase(), item]))
  };
}

export async function executeImplementationPlan(plan: ImplementationPlan, accountId: string): Promise<ExecutionResult> {
  const accessToken = await getValidAccessToken(plan.clientId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const tagmanager = google.tagmanager({ version: 'v2', auth: oauth2Client });
  const parent = `accounts/${accountId}/containers/${plan.containerId}`;
  const resources: CreatedResource[] = [];
  const errors: ExecutionResult['errors'] = [];

  const workspacesListRes = await tagmanager.accounts.containers.workspaces.list({ parent });
  const existingWorkspace = (workspacesListRes.data.workspace || []).find(
    (w) => w.name === plan.workspaceName
  );

  let workspace;
  let workspaceStatus: 'created' | 'skipped' = 'created';

  if (existingWorkspace) {
    workspace = existingWorkspace;
    workspaceStatus = 'skipped';
  } else {
    const workspaceRes = await tagmanager.accounts.containers.workspaces.create({
      parent,
      requestBody: {
        name: plan.workspaceName,
        description: `Created by Tracking Health AI implementation plan ${plan.id}. Not published automatically.`
      }
    });
    workspace = workspaceRes.data;
  }

  if (!workspace.path) {
    throw new Error('GTM workspace was created or retrieved without a path.');
  }

  resources.push({
    actionName: workspace.name || plan.workspaceName,
    resourceType: 'workspace',
    id: workspace.workspaceId || undefined,
    path: workspace.path,
    tagManagerUrl: workspace.tagManagerUrl || undefined,
    status: workspaceStatus,
    reason: workspaceStatus === 'skipped' ? 'Using existing workspace.' : undefined
  });

  const maps = await listResources(tagmanager, workspace.path);
  const orderedActions = [
    ...plan.actions.filter((action) => action.action === 'create_variable'),
    ...plan.actions.filter((action) => action.action === 'create_trigger'),
    ...plan.actions.filter((action) => action.action === 'create_tag')
  ];

  for (const action of orderedActions) {
    try {
      const key = action.name.toLowerCase();

      if (action.action === 'create_variable') {
        const existing = maps.variables.get(key);
        if (existing) {
          resources.push({ actionName: action.name, resourceType: 'variable', id: existing.variableId || undefined, path: existing.path || undefined, status: 'skipped', reason: 'Duplicate variable name.' });
          continue;
        }
        const created = await tagmanager.accounts.containers.workspaces.variables.create({ parent: workspace.path, requestBody: variableBody(action) });
        maps.variables.set(key, created.data);
        resources.push({ actionName: action.name, resourceType: 'variable', id: created.data.variableId || undefined, path: created.data.path || undefined, tagManagerUrl: created.data.tagManagerUrl || undefined, status: 'created' });
      }

      if (action.action === 'create_trigger') {
        const existing = maps.triggers.get(key);
        if (existing) {
          resources.push({ actionName: action.name, resourceType: 'trigger', id: existing.triggerId || undefined, path: existing.path || undefined, status: 'skipped', reason: 'Duplicate trigger name.' });
          continue;
        }
        const created = await tagmanager.accounts.containers.workspaces.triggers.create({ parent: workspace.path, requestBody: triggerBody(action) });
        maps.triggers.set(key, created.data);
        resources.push({ actionName: action.name, resourceType: 'trigger', id: created.data.triggerId || undefined, path: created.data.path || undefined, tagManagerUrl: created.data.tagManagerUrl || undefined, status: 'created' });
      }

      if (action.action === 'create_tag') {
        const existing = maps.tags.get(key);
        if (existing) {
          resources.push({ actionName: action.name, resourceType: 'tag', id: existing.tagId || undefined, path: existing.path || undefined, status: 'skipped', reason: 'Duplicate tag name.' });
          continue;
        }
        const trigger = maps.triggers.get(action.triggerName.toLowerCase());
        if (!trigger?.triggerId) {
          throw new Error(`Missing trigger "${action.triggerName}" for tag "${action.name}".`);
        }
        const created = await tagmanager.accounts.containers.workspaces.tags.create({ parent: workspace.path, requestBody: tagBody(action, trigger.triggerId) });
        maps.tags.set(key, created.data);
        resources.push({ actionName: action.name, resourceType: 'tag', id: created.data.tagId || undefined, path: created.data.path || undefined, tagManagerUrl: created.data.tagManagerUrl || undefined, status: 'created' });
      }
    } catch (error) {
      errors.push({ actionName: action.name, message: (error as Error).message });
    }
  }

  return JSON.parse(
    JSON.stringify({
      status: errors.length > 0 ? 'failed' : 'implemented',
      workspace: {
        workspaceId: workspace.workspaceId || undefined,
        path: workspace.path,
        tagManagerUrl: workspace.tagManagerUrl || undefined,
        name: workspace.name || undefined
      },
      resources,
      errors
    })
  );
}

export async function saveExecutionLog(plan: ImplementationPlan, result: ExecutionResult) {
  const ref = adminDb.collection('gtm_change_logs').doc();
  const data = {
    id: ref.id,
    planId: plan.id,
    clientId: plan.clientId,
    containerId: plan.containerId,
    status: result.status,
    workspace: result.workspace || null,
    resources: result.resources,
    errors: result.errors,
    createdAt: new Date()
  };
  await ref.set(data);
  return data;
}
