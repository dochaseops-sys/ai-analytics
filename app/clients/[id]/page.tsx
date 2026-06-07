'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard-layout';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, deleteDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Tag, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Play, 
  Sparkles, 
  Download, 
  MessageSquare, 
  Send,
  HelpCircle,
  AlertCircle,
  Pencil,
  Check,
  X,
  Bot,
  ClipboardCheck,
  ShieldAlert,
  ExternalLink
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

export default function ClientWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [ga4Connection, setGa4Connection] = useState<any>(null);
  const [gtmConnection, setGtmConnection] = useState<any>(null);
  
  // Available properties/containers for dropdown lists
  const [availableGA4, setAvailableGA4] = useState<any[]>([]);
  const [availableGTM, setAvailableGTM] = useState<any[]>([]);
  const [fetchingPlatforms, setFetchingPlatforms] = useState(false);

  // Search query states for platforms dropdown list
  const [ga4Search, setGa4Search] = useState('');
  const [gtmSearch, setGtmSearch] = useState('');

  // Selected for connection form
  const [selectedGA4, setSelectedGA4] = useState('');
  const [selectedGTM, setSelectedGTM] = useState('');
  const [connectingGA4, setConnectingGA4] = useState(false);
  const [connectingGTM, setConnectingGTM] = useState(false);

  // Audits
  const [latestAudit, setLatestAudit] = useState<any>(null);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Gemini Explanation
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);

  // Editing Industry State
  const [editingIndustry, setEditingIndustry] = useState(false);
  const [industryInput, setIndustryInput] = useState('');
  const [savingIndustry, setSavingIndustry] = useState(false);

  const handleStartEditIndustry = () => {
    setIndustryInput(client?.industry || '');
    setEditingIndustry(true);
  };

  const handleSaveIndustry = async () => {
    try {
      setSavingIndustry(true);
      const clientRef = doc(db, 'clients', clientId);
      await updateDoc(clientRef, { industry: industryInput });
      setClient((prev: any) => ({ ...prev, industry: industryInput }));
      setEditingIndustry(false);
    } catch (err) {
      console.error('Error updating industry:', err);
      alert('Failed to update industry: ' + (err as Error).message);
    } finally {
      setSavingIndustry(false);
    }
  };

  // Chat Panel
  const [messages, setMessages] = useState<any[]>([
    { role: 'model', content: 'Hi there! I am your AI Tracking Investigator. Ask me anything about this client\'s GA4 and GTM health, recent audit findings, or what issues should be fixed first!' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchClientAndConnections = async () => {
    try {
      setLoading(true);
      // 1. Fetch Client Profile
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (!clientDoc.exists()) {
        router.push('/dashboard');
        return;
      }
      setClient({ id: clientDoc.id, ...clientDoc.data() });

      // 2. Fetch Google Credentials existence
      setGoogleConnected(clientDoc.data()?.googleConnected || false);

      // 3. Fetch GA4 property connected
      const ga4Doc = await getDoc(doc(db, 'ga4_properties', clientId));
      if (ga4Doc.exists()) {
        setGa4Connection(ga4Doc.data());
      } else {
        setGa4Connection(null);
      }

      // 4. Fetch GTM container connected
      const gtmDoc = await getDoc(doc(db, 'gtm_containers', clientId));
      if (gtmDoc.exists()) {
        setGtmConnection(gtmDoc.data());
      } else {
        setGtmConnection(null);
      }

      // 5. Fetch Audits
      await fetchAudits();

    } catch (err) {
      console.error('Error fetching client workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAudits = async () => {
    const q = query(
      collection(db, 'audit_runs'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const list: any[] = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
    }));

    if (list.length > 0) {
      setLatestAudit(list[0]);
      setAuditHistory(list.slice(1));
      if (list[0].explanation) {
        setExplanation(list[0].explanation);
      } else {
        setExplanation(null);
      }
    } else {
      setLatestAudit(null);
      setAuditHistory([]);
      setExplanation(null);
    }
  };

  // Fetch available GA4/GTM platforms from APIs using token
  const fetchAvailablePlatforms = async () => {
    try {
      setFetchingPlatforms(true);
      // Fetch GA4 Properties
      const ga4Res = await fetch(`/api/ga4/properties?clientId=${clientId}`);
      const ga4Data = await ga4Res.json();
      if (ga4Data.properties) {
        setAvailableGA4(ga4Data.properties);
      }

      // Fetch GTM Containers
      const gtmRes = await fetch(`/api/gtm/containers?clientId=${clientId}`);
      const gtmData = await gtmRes.json();
      if (gtmData.containers) {
        setAvailableGTM(gtmData.containers);
      }
    } catch (err) {
      console.error('Error fetching available connections:', err);
    } finally {
      setFetchingPlatforms(false);
    }
  };

  useEffect(() => {
    fetchClientAndConnections();
  }, [clientId]);

  // Fetch lists only when Google is connected
  useEffect(() => {
    if (googleConnected) {
      fetchAvailablePlatforms();
    }
  }, [googleConnected]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDisconnectGoogle = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Account? This will also disconnect GA4 property and GTM container connections for this client.')) {
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/auth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      if (res.ok) {
        setGoogleConnected(false);
        setGa4Connection(null);
        setGtmConnection(null);
        await fetchClientAndConnections();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to disconnect Google Account.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to disconnect Google Account.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectGA4 = async () => {
    if (!confirm('Are you sure you want to disconnect this GA4 property?')) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'ga4_properties', clientId));
      setGa4Connection(null);
      await fetchClientAndConnections();
    } catch (err) {
      console.error(err);
      alert('Failed to disconnect GA4 property: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectGTM = async () => {
    if (!confirm('Are you sure you want to disconnect this GTM container?')) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'gtm_containers', clientId));
      setGtmConnection(null);
      await fetchClientAndConnections();
    } catch (err) {
      console.error(err);
      alert('Failed to disconnect GTM container: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGA4 = async () => {
    if (!selectedGA4) return;
    try {
      setConnectingGA4(true);
      const selected = availableGA4.find(p => p.id === selectedGA4);
      const res = await fetch('/api/ga4/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          propertyId: selected.id,
          propertyName: selected.name,
          accountEmail: user?.email || ''
        })
      });
      if (res.ok) {
        await fetchClientAndConnections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnectingGA4(false);
    }
  };

  const handleConnectGTM = async () => {
    if (!selectedGTM) return;
    try {
      setConnectingGTM(true);
      const selected = availableGTM.find(c => c.id === selectedGTM);
      const res = await fetch('/api/gtm/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          accountId: selected.accountId,
          containerId: selected.id,
          containerName: selected.name
        })
      });
      if (res.ok) {
        await fetchClientAndConnections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnectingGTM(false);
    }
  };

  const handleRunAudit = async () => {
    try {
      setRunningAudit(true);
      setAuditError(null);
      const res = await fetch('/api/audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId })
      });
      const data = await res.json();
      if (data.success) {
        await fetchAudits();
      } else {
        setAuditError(data.error || 'Failed to run tracking health audit.');
      }
    } catch (err) {
      console.error(err);
      setAuditError((err as Error).message);
    } finally {
      setRunningAudit(false);
    }
  };

  const handleGenerateExplanation = async () => {
    if (!latestAudit) return;
    try {
      setGeneratingExplanation(true);
      const res = await fetch('/api/audit/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditRunId: latestAudit.id })
      });
      const data = await res.json();
      if (data.explanation) {
        setExplanation(data.explanation);
        // Refresh audit lists to pull cached explanation
        await fetchAudits();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingExplanation(false);
    }
  };

  const handleImplementRecommendation = (result: any) => {
    const command = `Fix the ${result.issueId} tracking recommendation: ${result.recommendation}`;
    router.push(`/clients/${clientId}/gtm-agent?command=${encodeURIComponent(command)}&recIssueId=${encodeURIComponent(result.issueId)}&recText=${encodeURIComponent(result.recommendation)}`);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sendingMessage) return;

    const userMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setSendingMessage(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          message: userMessage.content,
          history: messages.slice(1) // exclude intro message
        })
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'model', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: 'Sorry, I encountered an issue generating a response. Please try again.' }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: 'Network error. Please confirm your server connection.' }]);
    } finally {
      setSendingMessage(false);
    }
  };

  // Helper styles
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500';
    if (score >= 80) return 'text-indigo-400';
    if (score >= 70) return 'text-amber-500';
    if (score >= 60) return 'text-orange-500';
    return 'text-rose-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    if (score >= 80) return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
    if (score >= 70) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    if (score >= 60) return 'bg-orange-500/10 border-orange-500/20 text-orange-400';
    return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
  };

  const getSeverityBadge = (severity: string) => {
    if (severity === 'critical') return <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/5">CRITICAL</Badge>;
    if (severity === 'high') return <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/5">HIGH</Badge>;
    if (severity === 'medium') return <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5">MEDIUM</Badge>;
    return <Badge variant="outline" className="border-slate-700 text-slate-400 bg-slate-800/10">LOW</Badge>;
  };

  const getRiskBadge = (risk: string) => {
    if (risk === 'high') return <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/5">HIGH RISK</Badge>;
    if (risk === 'medium') return <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5">MEDIUM RISK</Badge>;
    return <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5">LOW RISK</Badge>;
  };

  const filteredGA4 = availableGA4.filter(p => 
    p.name.toLowerCase().includes(ga4Search.toLowerCase()) || 
    p.id.toLowerCase().includes(ga4Search.toLowerCase())
  );

  const filteredGTM = availableGTM.filter(c => 
    c.name.toLowerCase().includes(gtmSearch.toLowerCase()) || 
    c.id.toLowerCase().includes(gtmSearch.toLowerCase()) ||
    (c.publicId && c.publicId.toLowerCase().includes(gtmSearch.toLowerCase()))
  );

  const user = client ? { email: client.createdBy } : null;

  return (
    <DashboardLayout>
      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">{client.name}</h1>
              {editingIndustry ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-slate-400 shrink-0">Workspace / Industry:</span>
                  <Input 
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    className="h-8 max-w-[200px] bg-slate-900 border-slate-800 text-slate-200 text-xs rounded-xl px-2.5"
                    disabled={savingIndustry}
                    placeholder="e.g. Ecommerce, SaaS"
                    autoFocus
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleSaveIndustry}
                    disabled={savingIndustry}
                    className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 rounded-md cursor-pointer shrink-0"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setEditingIndustry(false)}
                    disabled={savingIndustry}
                    className="h-7 w-7 text-red-400 hover:bg-red-400/10 rounded-md cursor-pointer shrink-0"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-slate-400">Workspace / Industry: <span className="font-semibold text-slate-200">{client.industry || 'Not Specified'}</span></p>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleStartEditIndustry}
                    className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md cursor-pointer"
                    title="Edit Industry"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/clients/${clientId}/gtm-agent`}>
                <Button className="bg-indigo-500/10 border border-indigo-500/40 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium gap-2 rounded-xl h-11 px-5 cursor-pointer">
                  <Bot className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                  <span>GTM Implementation Agent</span>
                </Button>
              </Link>
              <Button
                onClick={handleRunAudit}
                disabled={runningAudit}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-2 rounded-xl h-11 px-5 shadow-lg shadow-indigo-600/10 cursor-pointer"
              >
                {runningAudit ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                <span>Run Tracking Audit</span>
              </Button>
            </div>
          </div>

          {auditError && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{auditError}</p>
            </div>
          )}

           {/* Connections Section */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Google Account Connection */}
            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl flex flex-col h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-wider">Google OAuth</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                {googleConnected ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-200">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span>Google Account connected</span>
                      </div>
                      <p className="text-xs text-slate-500">Long-term offline background access granted.</p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-slate-900">
                      <a href={`/api/auth/google?clientId=${clientId}`} className="flex-1" target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="w-full border-indigo-500/30 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-indigo-400 text-xs h-8 rounded-xl cursor-pointer">
                          Reconnect
                        </Button>
                      </a>
                      <Button 
                        variant="outline" 
                        onClick={handleDisconnectGoogle}
                        className="flex-1 border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-500/5 text-rose-400 text-xs h-8 rounded-xl cursor-pointer"
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-400">Provide Google Account access to query Analytics and Tag Manager properties.</p>
                    <a href={`/api/auth/google?clientId=${clientId}`} className="block" target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="w-full border-indigo-500/30 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-indigo-400 text-sm h-10 rounded-xl cursor-pointer">
                        Connect Google Account
                      </Button>
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GA4 Connection */}
            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl flex flex-col h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-wider">GA4 Property</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                {ga4Connection ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-slate-200 font-semibold">
                        <BarChart3 className="h-5 w-5 text-indigo-400" />
                        <span className="truncate">{ga4Connection.propertyName}</span>
                      </div>
                      <p className="text-xs text-slate-500">ID: {ga4Connection.propertyId}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={handleDisconnectGA4}
                      className="w-full mt-2 border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-500/5 text-rose-400 text-xs h-8 rounded-xl cursor-pointer"
                    >
                      Disconnect Property
                    </Button>
                  </div>
                ) : googleConnected ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    {fetchingPlatforms ? (
                      <p className="text-xs text-slate-500">Loading properties...</p>
                    ) : (
                      <div className="space-y-3 flex-1 flex flex-col justify-between">
                        <Select onValueChange={(value) => setSelectedGA4(value as string)}>
                          <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-slate-300 text-sm rounded-xl py-6">
                            <SelectValue placeholder="Select GA4 Property" />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false} className="bg-slate-900 border-slate-800 text-slate-300 rounded-xl max-h-[300px]">
                            <div className="p-2 sticky top-0 bg-slate-900 border-b border-slate-800 z-10" onClick={(e) => e.stopPropagation()}>
                              <Input 
                                placeholder="Search properties..." 
                                value={ga4Search} 
                                onChange={(e) => setGa4Search(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500 rounded-lg px-2.5 w-full"
                              />
                            </div>
                            {filteredGA4.length === 0 ? (
                              <div className="text-xs text-slate-500 text-center py-4">
                                {availableGA4.length === 0 ? "No GA4 properties found" : "No matching properties"}
                              </div>
                            ) : (
                              filteredGA4.map(p => (
                                <SelectItem key={p.id} value={p.id} className="cursor-pointer hover:bg-slate-800/60 py-2.5">
                                  <div className="flex flex-col text-left">
                                    <span className="font-semibold text-slate-200">{p.name}</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">Property ID: {p.id}</span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <Button 
                          onClick={handleConnectGA4}
                          disabled={connectingGA4 || !selectedGA4}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm h-10 rounded-xl cursor-pointer"
                        >
                          {connectingGA4 ? 'Saving...' : 'Connect Property'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-500">Requires Google OAuth connection</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GTM Connection */}
            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl flex flex-col h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-300 uppercase tracking-wider">GTM Container</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                {gtmConnection ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-slate-200 font-semibold">
                        <Tag className="h-5 w-5 text-indigo-400" />
                        <span className="truncate">{gtmConnection.containerName}</span>
                      </div>
                      <p className="text-xs text-slate-500">ID: {gtmConnection.containerId}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={handleDisconnectGTM}
                      className="w-full mt-2 border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-500/5 text-rose-400 text-xs h-8 rounded-xl cursor-pointer"
                    >
                      Disconnect Container
                    </Button>
                  </div>
                ) : googleConnected ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    {fetchingPlatforms ? (
                      <p className="text-xs text-slate-500">Loading containers...</p>
                    ) : (
                      <div className="space-y-3 flex-1 flex flex-col justify-between">
                        <Select onValueChange={(value) => setSelectedGTM(value as string)}>
                          <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-slate-300 text-sm rounded-xl py-6">
                            <SelectValue placeholder="Select GTM Container" />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false} className="bg-slate-900 border-slate-800 text-slate-300 rounded-xl max-h-[300px]">
                            <div className="p-2 sticky top-0 bg-slate-900 border-b border-slate-800 z-10" onClick={(e) => e.stopPropagation()}>
                              <Input 
                                placeholder="Search containers..." 
                                value={gtmSearch} 
                                onChange={(e) => setGtmSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-8 text-xs bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500 rounded-lg px-2.5 w-full"
                              />
                            </div>
                            {filteredGTM.length === 0 ? (
                              <div className="text-xs text-slate-500 text-center py-4">
                                {availableGTM.length === 0 ? "No GTM containers found" : "No matching containers"}
                              </div>
                            ) : (
                              filteredGTM.map(c => (
                                <SelectItem key={c.id} value={c.id} className="cursor-pointer hover:bg-slate-800/60 py-2.5">
                                  <div className="flex flex-col text-left">
                                    <span className="font-semibold text-slate-200">{c.name}</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">Container ID: {c.id} {c.publicId ? `(${c.publicId})` : ''}</span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <Button 
                          onClick={handleConnectGTM}
                          disabled={connectingGTM || !selectedGTM}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm h-10 rounded-xl cursor-pointer"
                        >
                          {connectingGTM ? 'Saving...' : 'Connect Container'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-500">Requires Google OAuth connection</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="active-audit" className="space-y-6">
            <TabsList className="bg-slate-900/60 p-1 border border-slate-900 rounded-xl">
              <TabsTrigger value="active-audit" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Active Audit Report</TabsTrigger>
              <TabsTrigger value="audit-history" className="rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Audit History</TabsTrigger>
            </TabsList>

            <TabsContent value="active-audit" className="space-y-6">
              {latestAudit ? (
                <div className="grid gap-6 md:grid-cols-3">
                  <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl flex flex-col justify-center items-center p-8">
                    <div className="relative flex items-center justify-center">
                      {/* Circle Score Border */}
                      <div className="h-32 w-32 rounded-full border-4 border-slate-800 flex flex-col items-center justify-center bg-slate-950/60 shadow-inner">
                        <span className={`text-4xl font-black ${getScoreColor(latestAudit.score)}`}>
                          {latestAudit.score}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">Grade: {latestAudit.grade}</span>
                      </div>
                    </div>
                    <h2 className="mt-4 text-lg font-bold text-white">Tracking Health Score</h2>
                    <p className="text-xs text-slate-500 mt-1">Date: {latestAudit.createdAt?.toLocaleString()}</p>
                    <a href={`/api/reports/pdf?clientId=${clientId}`} className="mt-4 w-full">
                      <Button variant="outline" className="w-full border-slate-800 text-slate-300 hover:text-white rounded-xl gap-2 cursor-pointer">
                        <Download className="h-4 w-4" />
                        <span>Export PDF Report</span>
                      </Button>
                    </a>
                  </Card>

                  {/* Category Scores */}
                  <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-slate-300">Scoring Category Weighting</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {latestAudit.categoryScores && (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">GA4 Setup (Max 25pts)</span>
                              <span className="text-slate-200">{latestAudit.categoryScores.ga4Setup?.score || 0}/25</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((latestAudit.categoryScores.ga4Setup?.score || 0) / 25) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">GTM Setup (Max 25pts)</span>
                              <span className="text-slate-200">{latestAudit.categoryScores.gtmSetup?.score || 0}/25</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((latestAudit.categoryScores.gtmSetup?.score || 0) / 25) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">Conversion Tracking (Max 25pts)</span>
                              <span className="text-slate-200">{latestAudit.categoryScores.conversionTracking?.score || 0}/25</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((latestAudit.categoryScores.conversionTracking?.score || 0) / 25) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">Event Quality (Max 15pts)</span>
                              <span className="text-slate-200">{latestAudit.categoryScores.eventQuality?.score || 0}/15</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((latestAudit.categoryScores.eventQuality?.score || 0) / 15) * 100}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-400">Privacy & Consent (Max 10pts)</span>
                              <span className="text-slate-200">{latestAudit.categoryScores.privacyConsent?.score || 0}/10</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((latestAudit.categoryScores.privacyConsent?.score || 0) / 10) * 100}%` }} />
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
                  <CardHeader className="flex flex-col items-center">
                    <Activity className="h-12 w-12 text-slate-600 mb-2" />
                    <CardTitle className="text-xl font-bold text-white">No Audits Run</CardTitle>
                    <CardDescription className="text-slate-400 max-w-sm">
                      Click Run Tracking Audit to query GA4 & GTM APIs and evaluate the implementation health.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              {latestAudit && (
                <>
                  {/* Gemini Explain Card */}
                  <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl mt-6">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-indigo-400" />
                          <span>Gemini AI Explainers</span>
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                          Plain-English explanations, key findings, and recommended action steps.
                        </CardDescription>
                      </div>
                      {!explanation && (
                        <Button
                          onClick={handleGenerateExplanation}
                          disabled={generatingExplanation}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl h-10 px-4 cursor-pointer"
                        >
                          {generatingExplanation ? 'Explaining...' : 'Explain Audit'}
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-6">
                      {explanation ? (
                        <div className="space-y-6 text-sm">
                          <div className="space-y-2">
                            <h3 className="font-bold text-indigo-400">Executive Summary</h3>
                            <p className="text-slate-300 leading-relaxed">{explanation.executiveSummary}</p>
                          </div>
                          
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-3">
                              <h3 className="font-bold text-indigo-400">Key Findings</h3>
                              <div className="space-y-3">
                                {explanation.keyFindings?.map((kf: any, i: number) => (
                                  <div key={i} className="p-3.5 rounded-xl border border-slate-900 bg-slate-950/40 space-y-1">
                                    <p className="font-semibold text-slate-200">{kf.title}</p>
                                    <p className="text-slate-400 text-xs">{kf.explanation}</p>
                                    <p className="text-[10px] text-rose-400 font-medium mt-1">Impact: {kf.impact}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h3 className="font-bold text-indigo-400">Action Plan</h3>
                              <div className="space-y-2">
                                {explanation.actionPlan?.map((ap: any, i: number) => (
                                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-900 bg-slate-950/20">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-bold border border-indigo-500/20">
                                      {ap.step}
                                    </div>
                                    <div className="space-y-0.5">
                                      <p className="font-medium text-slate-200 text-xs">{ap.task}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-indigo-500/20 text-indigo-400">{ap.resource}</Badge>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/20 text-orange-400">{ap.priority.toUpperCase()}</Badge>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <HelpCircle className="h-8 w-8 text-slate-600 mb-2" />
                          <p className="text-sm text-slate-400">Generate an AI breakdown to understand what issues mean in plain English.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Audit Rules Table */}
                  <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl mt-6">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-white">Rule Evaluation Checklist</CardTitle>
                      <CardDescription className="text-slate-400">Checking deterministic requirements.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm text-left">
                          <thead>
                            <tr className="border-b border-slate-900 text-slate-400 font-medium">
                              <th className="px-6 py-4">Audit Check</th>
                              <th className="px-6 py-4">Category</th>
                              <th className="px-6 py-4">Severity</th>
                              <th className="px-6 py-4">Status</th>
                              <th className="px-6 py-4">Recommendation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900">
                            {latestAudit.results?.map((res: any) => (
                              <tr key={res.issueId} className="hover:bg-slate-900/10">
                                <td className="px-6 py-4 font-semibold text-slate-200">{res.title}</td>
                                <td className="px-6 py-4 text-slate-400">{res.category}</td>
                                <td className="px-6 py-4">{getSeverityBadge(res.severity)}</td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    {res.passed ? (
                                      <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400">PASSED</Badge>
                                    ) : (
                                      <>
                                        <Badge className="bg-rose-500/10 border-rose-500/20 text-rose-400">FAILED</Badge>
                                        {['lead-exists', 'conversions-configured', 'form-submit-exists', 'gtm-no-triggers', 'consent-mode'].includes(res.issueId) && (
                                          <Button 
                                            variant="outline" 
                                            onClick={() => handleImplementRecommendation(res)}
                                            className="h-7 text-[10px] px-2 bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-md cursor-pointer flex items-center gap-1 font-semibold"
                                          >
                                            <Sparkles className="h-3 w-3" />
                                            <span>Implement Fix</span>
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-400 max-w-xs">{res.recommendation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="audit-history" className="space-y-4">
              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-white">Historical Tracking Audits</CardTitle>
                  <CardDescription className="text-slate-400">Track and review optimization progress over time.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="space-y-4">
                    {auditHistory.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">No historical runs available.</p>
                    ) : (
                      auditHistory.map((run) => (
                        <div 
                          key={run.id}
                          className="flex items-center justify-between p-4 rounded-xl border border-slate-900 bg-slate-950/40"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-200">Audit Run #{run.id.slice(0, 6)}</p>
                            <p className="text-xs text-slate-500">{run.createdAt?.toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <Badge className={`font-semibold px-2 py-0.5 border ${getScoreBg(run.score)}`}>
                                Score: {run.score} ({run.grade})
                              </Badge>
                              <p className="text-[10px] text-slate-400 mt-0.5">{run.issues?.length || 0} issues</p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={async () => {
                                // Restore historical audit as latest
                                setLatestAudit(run);
                                setAuditHistory(prev => [latestAudit, ...prev.filter(x => x.id !== run.id)]);
                              }}
                              className="border-slate-800 text-xs text-slate-300 hover:text-white cursor-pointer"
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* AI Investigation Panel (Chat Interface) */}
          <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
            <CardHeader className="border-b border-slate-900">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-400" />
                <span>AI Investigation Panel</span>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Ask details about tracking health, drops in score, Consent Mode, or which issues to tackle first.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Messages Area */}
              <div className="h-64 overflow-y-auto p-6 space-y-4 bg-slate-950/20">
                {messages.map((msg, index) => (
                  <div 
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {sendingMessage && (
                  <div className="flex justify-start">
                    <div className="bg-slate-900 border border-slate-800 text-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-1">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"></div>
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 delay-100"></div>
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 delay-200"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="flex gap-2 p-4 border-t border-slate-900 bg-slate-950/40">
                <Input
                  placeholder="Ask a question about tracking status (e.g. 'Explain duplicate purchase events')..."
                  value={inputValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                  disabled={sendingMessage}
                  className="flex-1 bg-slate-950 border-slate-800 focus:border-indigo-500 text-white rounded-xl h-11 text-sm"
                />
                <Button 
                  type="submit"
                  disabled={sendingMessage || !inputValue.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 w-11 p-0 flex items-center justify-center cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
