'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuditModal } from '@/components/audit-modal';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard-layout';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  RefreshCw,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Brain,
  Download,
  Target,
  BarChart3,
  Globe,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Building2,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fl = (v?: string) =>
  v?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';

const scoreColor = (s: number) =>
  s >= 90 ? 'text-emerald-400' : s >= 80 ? 'text-indigo-400' : s >= 70 ? 'text-amber-400' : s >= 60 ? 'text-orange-400' : 'text-rose-400';

const scoreBg = (s: number) =>
  s >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' :
  s >= 80 ? 'bg-indigo-500/10 border-indigo-500/30' :
  s >= 70 ? 'bg-amber-500/10 border-amber-500/30' :
  s >= 60 ? 'bg-orange-500/10 border-orange-500/30' :
  'bg-rose-500/10 border-rose-500/30';

const barColor = (s: number) =>
  s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-amber-500' : 'bg-rose-500';

const SeverityBadge = ({ s }: { s: string }) => {
  const map: Record<string, string> = {
    critical: 'border-rose-500/30 text-rose-400 bg-rose-500/5',
    high:     'border-orange-500/30 text-orange-400 bg-orange-500/5',
    medium:   'border-amber-500/30 text-amber-400 bg-amber-500/5',
    low:      'border-slate-700 text-slate-400',
    info:     'border-sky-500/30 text-sky-400 bg-sky-500/5',
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-bold tracking-wide ${map[s] ?? map.low}`}>
      {s.toUpperCase()}
    </Badge>
  );
};

const StatusDot = ({ label, color }: { label: string; color: string }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${color}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
    {label}
  </span>
);

// ─── collapsible recommendation card ─────────────────────────────────────────

function RecCard({ rec, onImplement, idx }: { rec: any; onImplement: (r: any) => void; idx: number }) {
  const [open, setOpen] = useState(idx < 3); // first 3 open by default

  return (
    <div className={`rounded-xl border transition-colors ${
      rec.severity === 'critical' ? 'border-rose-500/20 bg-rose-500/5' :
      rec.severity === 'high'     ? 'border-orange-500/20 bg-orange-500/5' :
      'border-slate-800 bg-slate-950/30'
    }`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 p-4 text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
            {idx + 1}
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-100 text-sm">{rec.title}</span>
              <SeverityBadge s={rec.severity} />
              {rec.canAutoImplement ? (
                <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[9px]">AUTO FIX</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-700 text-slate-500 text-[9px]">MANUAL</Badge>
              )}
            </div>
            {!open && (
              <p className="text-xs text-slate-500 truncate max-w-lg">{rec.whyItMatters}</p>
            )}
          </div>
        </div>
        <span className="text-slate-500 shrink-0 mt-1">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800/60 pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Why It Matters</p>
              <p className="text-sm text-slate-300 leading-relaxed">{rec.whyItMatters}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Recommended Fix</p>
              <p className="text-sm text-slate-300 leading-relaxed">{rec.recommendedFix}</p>
            </div>
          </div>
          {rec.businessImpact && (
            <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/20 px-3 py-2">
              <p className="text-xs text-indigo-400">
                <span className="font-bold">Business Impact: </span>
                {rec.businessImpact}
              </p>
            </div>
          )}
          {Object.entries(rec.evidence || {}).length > 0 && (
            <div className="grid gap-2 md:grid-cols-3">
              {Object.entries(rec.evidence || {}).slice(0, 6).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-900/80 border border-slate-800 p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{fl(k)}</p>
                  <p className="text-xs text-slate-300 mt-1 break-words">{String(v)}</p>
                </div>
              ))}
            </div>
          )}
          {rec.canAutoImplement && (
            <div className="flex justify-end">
              <Button
                onClick={() => onImplement(rec)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-2 text-sm cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                Implement Fix in GTM Agent
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PersonalisedAuditPage() {
  const params   = useParams();
  const router   = useRouter();
  const clientId = params.id as string;

  const [clientName, setClientName]       = useState('');
  const [clientProfile, setClientProfile] = useState<any>(null);
  const [clientData, setClientData]       = useState<any>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [audit, setAudit]                 = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (clientDoc.exists()) {
        setClientName(clientDoc.data().name || '');
        setClientData(clientDoc.data());
      }
      const [pRes, aRes] = await Promise.all([
        fetch(`/api/client-intelligence/profile/${clientId}`),
        fetch(`/api/audit/personalised/${clientId}`),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setClientProfile(d.profile || null); }
      if (aRes.ok) { const d = await aRes.json(); setAudit(d.auditRun || null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [clientId]);

  const handleRun = async (params?: {
    leadTypes: string[];
    leadEventNames: Record<string, string>;
    purchaseEventName: string;
    pageViewEventName: string;
  }) => {
    setRunning(true); setError(null);
    try {
      const res  = await fetch('/api/audit/personalised/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          refreshProfile: !clientProfile,
          ...params
        }),
      });
      const data = await res.json();
      if (data.success) {
        setClientProfile(data.profile);
        setAudit(data.auditRun);
        if (params) {
          setClientData((prev: any) => ({
            ...prev,
            ...params
          }));
        }
        setIsAuditModalOpen(false);
      }
      else setError(data.error || 'Failed to run audit.');
    } catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  };

  const handleImplement = async (rec: any) => {
    try {
      const res = await fetch(`/api/audit/personalised/recommendations/${rec.id}/implement`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed.');
      router.push(`/clients/${clientId}/gtm-agent?command=${encodeURIComponent(d.command)}&requestId=${encodeURIComponent(d.requestId)}&recIssueId=${encodeURIComponent(rec.ruleId)}&recText=${encodeURIComponent(rec.recommendedFix)}&recPayload=${encodeURIComponent(JSON.stringify(rec))}`);
    } catch (e) { alert((e as Error).message); }
  };

  // ── derived values ────────────────────────────────────────────────────────

  const gaps      = audit?.gaps || [];
  const recs      = audit?.recommendations || [];
  const critical  = recs.filter((r: any) => r.severity === 'critical').length;
  const high      = recs.filter((r: any) => r.severity === 'high').length;
  const autoFix   = recs.filter((r: any) => r.canAutoImplement).length;

  const expectedEventStatus = (eventName: string) => {
    if (gaps.some((g: any) => g.ruleId === 'expected-critical-event-missing' && g.evidence?.expectedEvent === eventName))
      return { label: 'Missing', color: 'text-rose-400' };
    if (gaps.some((g: any) => g.ruleId === 'expected-event-not-key-event' && g.evidence?.eventName === eventName))
      return { label: 'Not key event', color: 'text-amber-400' };
    return audit ? { label: 'Covered', color: 'text-emerald-400' } : { label: 'Pending', color: 'text-slate-500' };
  };

  const ctaStatus = (cta: any) => {
    const gtm = gaps.some((g: any) => g.ruleId === 'cta-no-gtm-trigger' && g.evidence?.label === cta.label && g.evidence?.pageUrl === cta.pageUrl);
    const ga4 = gaps.some((g: any) => g.ruleId === 'cta-no-ga4-event'   && g.evidence?.label === cta.label && g.evidence?.pageUrl === cta.pageUrl);
    if (gtm && ga4) return { label: 'GA4 + GTM missing', color: 'text-rose-400' };
    if (gtm)        return { label: 'GTM trigger missing', color: 'text-amber-400' };
    if (ga4)        return { label: 'GA4 event missing', color: 'text-amber-400' };
    return audit    ? { label: 'Covered', color: 'text-emerald-400' } : { label: 'Pending', color: 'text-slate-500' };
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl mx-auto">

        {/* ── Top bar ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <Link href={`/clients/${clientId}`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <ArrowLeft className="h-3 w-3" />
              {clientName || 'Client Workspace'}
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Brain className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none">
                  Personalised Audit
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  {clientName && <span className="text-slate-200 font-medium">{clientName} · </span>}
                  Adaptive tracking analysis
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {audit && (
              <a href={`/api/reports/personalised-pdf?clientId=${clientId}`} download>
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 rounded-xl gap-2 h-10 cursor-pointer">
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </a>
            )}
            <Button
              onClick={() => setIsAuditModalOpen(true)}
              disabled={running}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-2 rounded-xl h-10 px-4 shadow-lg shadow-emerald-600/10 cursor-pointer"
            >
              {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {running ? 'Running…' : clientProfile ? 'Refresh' : 'Run Audit'}
            </Button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" /><p>{error}</p>
          </div>
        )}

        {/* ── States ── */}
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : !clientProfile && !audit ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/10 p-16 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-slate-600 mb-4" />
            <p className="text-lg font-bold text-white">No Profile Yet</p>
            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
              Click <strong className="text-slate-200">Run Audit</strong> to crawl the website, classify
              the business model, and generate fully adaptive tracking expectations.
            </p>
          </div>
        ) : (

          <div className="space-y-10">

            {/* ════════════════════════════════════════════════════════════
                § 1  SCORE OVERVIEW
            ════════════════════════════════════════════════════════════ */}
            {audit && (
              <section>
                <SectionHeader icon={<BarChart3 className="h-4 w-4" />} title="Health Score" />

                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  {/* Big score */}
                  <div className={`rounded-2xl border p-6 flex flex-col items-center justify-center ${scoreBg(audit.score)}`}>
                    <p className={`text-6xl font-black leading-none ${scoreColor(audit.score)}`}>{audit.score}</p>
                    <p className={`text-sm font-bold mt-2 ${scoreColor(audit.score)}`}>Grade {audit.grade}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">out of 100</p>
                  </div>

                  {/* Category bars */}
                  <div className="md:col-span-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
                    {Object.entries(audit.categoryScores || {}).map(([cat, val]) => {
                      const pct = Math.round(Number(val));
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs font-medium mb-1">
                            <span className="text-slate-300">{fl(cat)}</span>
                            <span className="text-slate-400">{pct}<span className="text-slate-600">/100</span></span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                          </div>
                          {audit.personalisedWeights?.[cat] !== undefined && (
                            <p className="text-[9px] text-slate-600 mt-0.5">Weight: {audit.personalisedWeights[cat]}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {audit.scoreExplanation && (
                  <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                    <p className="text-xs font-bold text-indigo-400 mb-1">Why this score is personalised</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{audit.scoreExplanation}</p>
                  </div>
                )}

                {/* Quick stats */}
                {recs.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { label: 'Critical', value: critical, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
                      { label: 'High Priority', value: high, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                      { label: 'Auto-Fixable', value: autoFix, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} className={`rounded-xl border p-4 text-center ${bg}`}>
                        <p className={`text-2xl font-black ${color}`}>{value}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ════════════════════════════════════════════════════════════
                § 2  CLIENT PROFILE
            ════════════════════════════════════════════════════════════ */}
            {clientProfile && (
              <section>
                <SectionHeader icon={<Building2 className="h-4 w-4" />} title="Client Profile" />

                <div className="mt-4 space-y-4">
                  {/* Classification cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ['Industry',       fl(clientProfile.industry)],
                      ['Business Model', fl(clientProfile.businessModel)],
                      ['Funnel Type',    fl(clientProfile.funnelType)],
                      ['Confidence',     `${Math.round((clientProfile.confidence || 0) * 100)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
                        <p className="mt-1.5 text-sm font-bold text-slate-200">{value}</p>
                      </div>
                    ))}
                  </div>

                  {clientProfile.reasoningSummary && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Classification Reasoning</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{clientProfile.reasoningSummary}</p>
                    </div>
                  )}

                  {/* Goals */}
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { title: 'Primary Conversion Goals', items: clientProfile.primaryConversionGoals, cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
                      { title: 'Secondary Goals',          items: clientProfile.secondaryConversionGoals, cls: 'border-slate-700 text-slate-300' },
                    ].map(({ title, items, cls }) => (
                      <div key={title} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">{title}</p>
                        <div className="flex flex-wrap gap-2">
                          {items?.map((g: string) => (
                            <Badge key={g} variant="outline" className={cls}>{fl(g)}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ════════════════════════════════════════════════════════════
                § 3  RECOMMENDATIONS
            ════════════════════════════════════════════════════════════ */}
            {audit && (
              <section>
                <SectionHeader
                  icon={<Lightbulb className="h-4 w-4" />}
                  title="Recommendations"
                  badge={recs.length > 0 ? `${recs.length} gaps found` : undefined}
                  badgeClass="bg-rose-500/10 border-rose-500/20 text-rose-400"
                />

                <div className="mt-4 space-y-2">
                  {recs.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
                      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
                      <p className="font-semibold text-slate-200">No gaps detected — tracking looks great!</p>
                    </div>
                  ) : (
                    recs.map((rec: any, i: number) => (
                      <RecCard key={rec.id} rec={rec} onImplement={handleImplement} idx={i} />
                    ))
                  )}
                </div>
              </section>
            )}

            {/* ════════════════════════════════════════════════════════════
                § 4  MEASUREMENT COVERAGE
            ════════════════════════════════════════════════════════════ */}
            {clientProfile?.expectedEvents?.length > 0 && (
              <section>
                <SectionHeader icon={<Target className="h-4 w-4" />} title="Measurement Coverage" />

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60">
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Event</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Priority</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Why It Applies</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {clientProfile.expectedEvents.map((ev: any) => {
                        const st = expectedEventStatus(ev.eventName);
                        return (
                          <tr key={ev.eventName} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-5 py-3">
                              <code className="text-xs font-mono bg-slate-900/60 border border-slate-800 rounded px-1.5 py-0.5 text-indigo-300">
                                {ev.eventName}
                              </code>
                            </td>
                            <td className="px-5 py-3"><SeverityBadge s={ev.priority} /></td>
                            <td className="px-5 py-3">
                              <StatusDot label={st.label} color={st.color} />
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-400 max-w-xs leading-relaxed">{ev.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ════════════════════════════════════════════════════════════
                § 5  CTA TRACKING
            ════════════════════════════════════════════════════════════ */}
            {clientProfile?.detectedCTAs?.length > 0 && (
              <section>
                <SectionHeader icon={<Globe className="h-4 w-4" />} title="Website CTA Tracking" />

                {/* CTA type summary */}
                <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-8">
                  {['form', 'whatsapp', 'phone', 'email', 'booking', 'checkout', 'signup', 'download'].map((type) => {
                    const count = clientProfile.detectedCTAs.filter((c: any) => c.type === type).length;
                    return (
                      <div key={type} className={`rounded-xl border p-3 text-center ${count > 0 ? 'border-slate-700 bg-slate-900/40' : 'border-slate-800/40 bg-transparent opacity-40'}`}>
                        <p className="text-lg font-black text-white">{count}</p>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">{fl(type)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60">
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">CTA Label</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Page</th>
                        <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Tracking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {clientProfile.detectedCTAs.slice(0, 50).map((cta: any, i: number) => {
                        const st = ctaStatus(cta);
                        return (
                          <tr key={`${cta.label}-${i}`} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-5 py-3 font-medium text-slate-200">{cta.label}</td>
                            <td className="px-5 py-3">
                              <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">{fl(cta.type)}</Badge>
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate">{cta.pageUrl}</td>
                            <td className="px-5 py-3">
                              {st.label === 'Covered' ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" />{st.label}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-xs ${st.color}`}>
                                  <XCircle className="h-3 w-3" />{st.label}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

          </div>
        )}
      </div>
      <AuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onSubmit={handleRun}
        initialData={clientData}
        isLoading={running}
      />
    </DashboardLayout>
  );
}

// ─── reusable section header ─────────────────────────────────────────────────

function SectionHeader({
  icon, title, badge, badgeClass,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
        {icon}
      </div>
      <h2 className="text-base font-bold text-white">{title}</h2>
      {badge && (
        <Badge variant="outline" className={`text-[10px] ml-1 ${badgeClass}`}>{badge}</Badge>
      )}
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}
