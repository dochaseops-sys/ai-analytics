'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard-layout';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Bot, 
  ChevronLeft, 
  Sparkles, 
  AlertTriangle, 
  HelpCircle, 
  ClipboardCheck, 
  CheckCircle2, 
  ExternalLink,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';

type ImplementationAction = {
  action: string;
  name: string;
  variableType?: string;
  triggerType?: string;
  tagType?: string;
  triggerName?: string;
  conditions?: Array<{ variable: string; operator: string; value: string }>;
};

type ImplementationPlanView = {
  id: string;
  status: 'draft' | 'ready_for_approval' | 'approved' | 'implemented' | 'failed';
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  workspaceName: string;
  actions: ImplementationAction[];
};

type ImplementationResourceView = {
  actionName: string;
  resourceType: string;
  id?: string;
  status: string;
  reason?: string;
};

type ImplementationResultView = {
  status: string;
  workspace?: {
    tagManagerUrl?: string;
  };
  resources?: ImplementationResourceView[];
};

export default function GTMAgentPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gtmConnection, setGtmConnection] = useState<any>(null);

  // Implementation Agent State
  const [implementationCommand, setImplementationCommand] = useState('');
  const [implementationRequestId, setImplementationRequestId] = useState<string | null>(null);
  const [implementationPlan, setImplementationPlan] = useState<ImplementationPlanView | null>(null);
  const [implementationWarnings, setImplementationWarnings] = useState<string[]>([]);
  const [implementationErrors, setImplementationErrors] = useState<string[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [missingQuestions, setMissingQuestions] = useState<string[]>([]);
  const [requirementAnswers, setRequirementAnswers] = useState<Record<string, string>>({});
  const [implementationResult, setImplementationResult] = useState<ImplementationResultView | null>(null);
  const [implementationLoading, setImplementationLoading] = useState(false);
  const [implementationError, setImplementationError] = useState<string | null>(null);
  const [implementationHistory, setImplementationHistory] = useState<any[]>([]);

  const implementationPanelRef = useRef<HTMLDivElement>(null);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (!clientDoc.exists()) {
        router.push('/dashboard');
        return;
      }
      setClient({ id: clientDoc.id, ...clientDoc.data() });

      const gtmDoc = await getDoc(doc(db, 'gtm_containers', clientId));
      if (gtmDoc.exists()) {
        setGtmConnection(gtmDoc.data());
      } else {
        setGtmConnection(null);
      }

      await fetchImplementationHistory();
    } catch (err) {
      console.error('Error loading client agent data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchImplementationHistory = async () => {
    try {
      const q = query(
        collection(db, 'gtm_change_logs'),
        where('clientId', '==', clientId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
      }));
      setImplementationHistory(list);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [clientId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const commandParam = searchParams.get('command');
      const recIssueId = searchParams.get('recIssueId');
      const recText = searchParams.get('recText');
      if (commandParam) {
        setImplementationCommand(commandParam);
        const recommendation = recIssueId && recText ? { issueId: recIssueId, recommendation: recText } : undefined;
        handleImplementationCommand(commandParam, recommendation);
      }
    }
  }, [clientId]);

  const implementationFetch = async (url: string, bodyObj: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...bodyObj, clientId })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Server error occurred during execution.');
    }
    return data;
  };

  const handleImplementationCommand = async (commandOverride?: string, recommendation?: any) => {
    const commandText = commandOverride || implementationCommand;
    if (!commandText.trim()) return;

    try {
      setImplementationLoading(true);
      setImplementationError(null);
      setImplementationPlan(null);
      setImplementationResult(null);
      setMissingFields([]);
      setMissingQuestions([]);
      setRequirementAnswers({});

      const data = await implementationFetch('/api/implementation/command', {
        command: commandText,
        recommendation
      });

      if (data.status === 'needs_info') {
        setImplementationRequestId(data.requestId);
        setMissingFields(data.missingFields);
        setMissingQuestions(data.questions);
      } else if (data.status === 'planned' || data.plan) {
        setImplementationPlan(data.plan);
        setImplementationWarnings(data.warnings || []);
        setImplementationErrors(data.errors || []);
      }
    } catch (err) {
      setImplementationError((err as Error).message);
    } finally {
      setImplementationLoading(false);
    }
  };

  const handleSubmitRequirements = async () => {
    if (!implementationRequestId) return;

    try {
      setImplementationLoading(true);
      setImplementationError(null);
      const data = await implementationFetch('/api/implementation/requirements', {
        requestId: implementationRequestId,
        answers: requirementAnswers
      });

      if (data.status === 'needs_info') {
        setImplementationRequestId(data.requestId);
        setMissingFields(data.missingFields);
        setMissingQuestions(data.questions);
      } else if (data.status === 'planned' || data.plan) {
        setImplementationPlan(data.plan);
        setImplementationWarnings(data.warnings || []);
        setImplementationErrors(data.errors || []);
        setMissingFields([]);
        setMissingQuestions([]);
      }
    } catch (err) {
      setImplementationError((err as Error).message);
    } finally {
      setImplementationLoading(false);
    }
  };

  const handleApproveImplementation = async () => {
    if (!implementationPlan) return;

    try {
      setImplementationLoading(true);
      setImplementationError(null);
      const data = await implementationFetch('/api/implementation/approve', {
        planId: implementationPlan.id
      });
      if (data.plan) setImplementationPlan(data.plan);
    } catch (err) {
      setImplementationError((err as Error).message);
    } finally {
      setImplementationLoading(false);
    }
  };

  const handleExecuteImplementation = async () => {
    if (!implementationPlan) return;

    try {
      setImplementationLoading(true);
      setImplementationError(null);
      const data = await implementationFetch('/api/implementation/execute', {
        planId: implementationPlan.id
      });
      setImplementationResult(data.result);
      if (data.status) {
        setImplementationPlan((prev) => prev ? { ...prev, status: data.status } : prev);
      }
      await fetchImplementationHistory();
    } catch (err) {
      setImplementationError((err as Error).message);
    } finally {
      setImplementationLoading(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    const map = {
      low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      high: 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    };
    return (
      <Badge className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${map[risk as 'low'|'medium'|'high'] || map.low}`}>
        {risk} Risk
      </Badge>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link href={`/clients/${clientId}`} className="text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1.5 cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Client Workspace</span>
          </Link>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                <Bot className="h-7 w-7 text-indigo-400" />
                <span>GTM Implementation Agent</span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Workspace page for {client?.name}. Pushes tag, trigger, and variable setups dynamically.
              </p>
            </div>
            {gtmConnection ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 text-xs font-semibold rounded-xl">
                Connected GTM: {gtmConnection.publicId || gtmConnection.containerId}
              </Badge>
            ) : (
              <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3 py-1 text-xs font-semibold rounded-xl">
                GTM Container Not Connected
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Agent Console */}
          <div className="lg:col-span-2">
            <Card ref={implementationPanelRef} className="border-slate-900 bg-slate-900/20 backdrop-blur-xl h-full flex flex-col">
              <CardHeader className="border-b border-slate-900">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Bot className="h-5 w-5 text-indigo-400" />
                  <span>Agent Console</span>
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Enter an instruction or paste documentation code to plan the deployment.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6 flex-1">
                {!gtmConnection ? (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white">GTM Connection Required</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-2">
                      Please go back to the client workspace page and connect a Google Tag Manager container to enable the Implementation Agent.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <Input
                        value={implementationCommand}
                        onChange={(e) => setImplementationCommand(e.target.value)}
                        placeholder='Try "Install Meta Pixel on all pages" or "Create GA4 event tracking for WhatsApp clicks"'
                        disabled={implementationLoading}
                        className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white rounded-xl h-11 text-sm"
                      />
                      <Button
                        onClick={() => handleImplementationCommand()}
                        disabled={implementationLoading || !implementationCommand.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 px-4 cursor-pointer gap-2"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>{implementationLoading ? 'Working...' : 'Generate Plan'}</span>
                      </Button>
                    </div>

                    {implementationError && (
                      <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <p>{implementationError}</p>
                      </div>
                    )}

                    {missingQuestions.length > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                        <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                          <HelpCircle className="h-4 w-4" />
                          <span>More information needed</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {missingQuestions.map((question, index) => {
                            const field = missingFields[index];
                            return (
                              <div key={field || question} className="space-y-1.5">
                                <Label className="text-xs text-slate-300">{question}</Label>
                                {field === 'html' ? (
                                  <textarea
                                    value={requirementAnswers[field] || ''}
                                    onChange={(e) => setRequirementAnswers((prev) => ({ ...prev, [field]: e.target.value }))}
                                    className="min-h-28 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                    placeholder="Paste script or HTML"
                                    disabled={implementationLoading}
                                  />
                                ) : (
                                  <Input
                                    value={requirementAnswers[field] || ''}
                                    onChange={(e) => setRequirementAnswers((prev) => ({ ...prev, [field]: e.target.value }))}
                                    className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white h-9 text-xs"
                                    placeholder={field === 'trigger' ? 'all_pages, click, form_submit, or a custom event' : field}
                                    disabled={implementationLoading}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <Button
                          onClick={handleSubmitRequirements}
                          disabled={implementationLoading || missingFields.some((field) => !requirementAnswers[field]?.trim())}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 cursor-pointer"
                        >
                          Continue
                        </Button>
                      </div>
                    )}

                    {implementationPlan && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <ClipboardCheck className="h-4 w-4 text-indigo-400" />
                              <h3 className="font-bold text-white text-sm">Implementation Plan</h3>
                              {getRiskBadge(implementationPlan.riskLevel)}
                              <Badge variant="outline" className="border-slate-700 text-slate-300 bg-slate-900/60">{implementationPlan.status.replaceAll('_', ' ').toUpperCase()}</Badge>
                            </div>
                            <p className="text-sm text-slate-300">{implementationPlan.summary}</p>
                            <p className="text-xs text-slate-500">Workspace: {implementationPlan.workspaceName}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleApproveImplementation}
                              disabled={implementationLoading || implementationPlan.status !== 'ready_for_approval' || implementationErrors.length > 0}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl h-9 cursor-pointer"
                            >
                              Approve
                            </Button>
                            <Button
                              onClick={handleExecuteImplementation}
                              disabled={implementationLoading || implementationPlan.status !== 'approved'}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 cursor-pointer"
                            >
                              Execute
                            </Button>
                          </div>
                        </div>

                        {(implementationWarnings.length > 0 || implementationErrors.length > 0) && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {implementationWarnings.length > 0 && (
                              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                                  <ShieldAlert className="h-4 w-4" />
                                  <span>Warnings</span>
                                </div>
                                {implementationWarnings.map((warning) => (
                                  <p key={warning} className="text-xs text-amber-100/80">{warning}</p>
                                ))}
                              </div>
                            )}
                            {implementationErrors.length > 0 && (
                              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-red-300 text-xs font-semibold">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>Blocked</span>
                                </div>
                                {implementationErrors.map((error) => (
                                  <p key={error} className="text-xs text-red-100/80">{error}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          {implementationPlan.actions.map((action, index) => (
                            <div key={`${action.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-900 bg-slate-900/40 p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-200 truncate">{action.name}</p>
                                <p className="text-xs text-slate-500">
                                  {action.action.replace('create_', 'Create ')}
                                  {action.tagType ? ` / ${action.tagType}` : ''}
                                  {action.triggerType ? ` / ${action.triggerType}` : ''}
                                  {action.triggerName ? ` / fires on ${action.triggerName}` : ''}
                                </p>
                              </div>
                              <Badge variant="outline" className="border-indigo-500/20 text-indigo-300 bg-indigo-500/5">{index + 1}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {implementationResult && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Execution {implementationResult.status}</span>
                          </div>
                          {implementationResult.workspace?.tagManagerUrl && (
                            <a href={implementationResult.workspace.tagManagerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1">
                              <span>Open GTM workspace</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {implementationResult.resources?.map((resource, index) => (
                            <div key={`${resource.actionName}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                              <p className="text-xs font-semibold text-slate-200">{resource.resourceType}: {resource.actionName}</p>
                              <p className="text-[10px] text-slate-500">Status: {resource.status}{resource.id ? ` / ID: ${resource.id}` : ''}</p>
                              {resource.reason && <p className="text-[10px] text-amber-300 mt-1">{resource.reason}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Implementation History Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl flex flex-col h-full">
              <CardHeader className="border-b border-slate-900 pb-4">
                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-indigo-400" />
                  <span>Implementation History</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Recent GTM workspace updates and pushed tags.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar flex-1">
                {implementationHistory.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No implementation logs found for this client.
                  </div>
                ) : (
                  implementationHistory.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-slate-200 line-clamp-2">
                            {log.workspace?.name || 'Workspace Update'}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                          </p>
                        </div>
                        <Badge className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-semibold ${
                          log.status === 'implemented' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {log.status}
                        </Badge>
                      </div>

                      {log.workspace?.tagManagerUrl && (
                        <a 
                          href={log.workspace.tagManagerUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 font-semibold"
                        >
                          <span>Open GTM Workspace</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}

                      <div className="space-y-1.5 pt-2 border-t border-slate-900">
                        {log.resources?.map((res: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-400 truncate max-w-[150px]">
                              {res.resourceType}: {res.actionName}
                            </span>
                            <span className={`font-medium ${
                              res.status === 'created' ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {res.status}
                            </span>
                          </div>
                        ))}

                        {log.errors?.map((err: any, idx: number) => (
                          <div key={idx} className="text-[10px] text-red-400 flex gap-1 items-start mt-1 bg-red-500/5 p-1.5 rounded-lg border border-red-500/10">
                            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span className="break-words">{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
