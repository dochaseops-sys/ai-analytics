'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  Tag, 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink,
  Users
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [clientsCount, setClientsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [avgScore, setAvgScore] = useState(0);
  const [totalIssues, setTotalIssues] = useState(0);
  const [criticalIssuesCount, setCriticalIssuesCount] = useState(0);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [connectedGA4Count, setConnectedGA4Count] = useState(0);
  const [connectedGTMCount, setConnectedGTMCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const clientsQuery = query(collection(db, 'clients'), where('createdBy', '==', user.uid));
        const clientsSnap = await getDocs(clientsQuery);
        const clientsList: any[] = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClientsCount(clientsList.length);

        if (clientsList.length === 0) {
          setLoading(false);
          return;
        }

        const clientIds = clientsList.map(c => c.id);

        const ga4Snap = await getDocs(query(collection(db, 'ga4_properties'), where('clientId', 'in', clientIds)));
        setConnectedGA4Count(ga4Snap.size);

        const gtmSnap = await getDocs(query(collection(db, 'gtm_containers'), where('clientId', 'in', clientIds)));
        setConnectedGTMCount(gtmSnap.size);

        const auditsQuery = query(collection(db, 'audit_runs'), where('clientId', 'in', clientIds), orderBy('createdAt', 'desc'));
        const auditsSnap = await getDocs(auditsQuery);
        const auditsList: any[] = auditsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() }));

        const latestAuditsMap: { [clientId: string]: any } = {};
        auditsList.forEach(audit => {
          if (!latestAuditsMap[audit.clientId]) {
            latestAuditsMap[audit.clientId] = audit;
          }
        });

        const latestAudits = Object.values(latestAuditsMap);

        if (latestAudits.length > 0) {
          const totalScore = latestAudits.reduce((sum, a) => sum + a.score, 0);
          setAvgScore(Math.round(totalScore / latestAudits.length));

          let issuesSum = 0;
          let criticalSum = 0;
          latestAudits.forEach(audit => {
            const issues = audit.issues || [];
            issuesSum += issues.length;
            criticalSum += issues.filter((i: any) => i.severity === 'critical').length;
          });

          setTotalIssues(issuesSum);
          setCriticalIssuesCount(criticalSum);
        }

        const clientsMap: { [id: string]: string } = {};
        clientsList.forEach((c: any) => {
          clientsMap[c.id] = c.name;
        });

        const formattedRecent = auditsList.slice(0, 5).map(audit => ({
          ...audit,
          clientName: clientsMap[audit.clientId] || 'Unknown Client'
        }));
        setRecentAudits(formattedRecent);

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Dashboard Overview
          </h1>
          <p className="text-sm text-slate-400">
            Real-time aggregate status of your tracking architectures.
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : clientsCount === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
            <CardHeader className="flex flex-col items-center">
              <Users className="h-12 w-12 text-slate-600 mb-2" />
              <CardTitle className="text-xl font-bold text-white">No Clients Found</CardTitle>
              <CardDescription className="text-slate-400 max-w-sm">
                Get started by creating a client module and connecting your Google Analytics and GTM properties.
              </CardDescription>
            </CardHeader>
            <div className="mt-4">
              <Link href="/clients">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-all cursor-pointer">
                  Create Your First Client
                </span>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">Average Health Score</span>
                    <Activity className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className={`text-4xl font-black ${getScoreColor(avgScore)}`}>
                      {avgScore || 0}
                    </span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Across all active audits</p>
                </CardContent>
              </Card>

              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">Active Issues</span>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-4xl font-black text-white">{totalIssues}</span>
                    <span className="text-xs text-slate-500">unresolved</span>
                  </div>
                  <p className="text-xs text-rose-400 mt-2 font-medium">
                    {criticalIssuesCount} Critical severity issues
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">GA4 Properties</span>
                    <BarChart3 className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-4xl font-black text-white">{connectedGA4Count}</span>
                    <span className="text-xs text-slate-500">connected</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {clientsCount - connectedGA4Count} clients missing GA4
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-400">GTM Containers</span>
                    <Tag className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-4xl font-black text-white">{connectedGTMCount}</span>
                    <span className="text-xs text-slate-500">connected</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {clientsCount - connectedGTMCount} clients missing GTM
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-white">Recent Audit Runs</CardTitle>
                  <CardDescription className="text-slate-400">Latest deterministic auditing actions taken.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="space-y-4">
                    {recentAudits.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">No audits run yet.</p>
                    ) : (
                      recentAudits.map((run) => (
                        <div 
                          key={run.id}
                          className="flex items-center justify-between p-4 rounded-xl border border-slate-900 bg-slate-950/40"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">{run.clientName}</p>
                            <p className="text-xs text-slate-400">
                              {run.createdAt?.toLocaleDateString()} at {run.createdAt?.toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <Badge className={`font-semibold px-2 py-0.5 border ${getScoreBg(run.score)}`}>
                                Score: {run.score} ({run.grade})
                              </Badge>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {run.issues?.length || 0} issues detected
                              </p>
                            </div>
                            <Link href={`/clients/${run.clientId}`}>
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer">
                                <ExternalLink className="h-4 w-4" />
                              </span>
                            </Link>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-white">Platform Coverage</CardTitle>
                  <CardDescription className="text-slate-400">Property and container coverage.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">GA4 Connectivity</span>
                      <span className="font-semibold text-white">
                        {Math.round((connectedGA4Count / clientsCount) * 100) || 0}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500" 
                        style={{ width: `${(connectedGA4Count / clientsCount) * 100 || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">GTM Connectivity</span>
                      <span className="font-semibold text-white">
                        {Math.round((connectedGTMCount / clientsCount) * 100) || 0}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500" 
                        style={{ width: `${(connectedGTMCount / clientsCount) * 100 || 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-900 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Role-based Firestore security rules enabled</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>Gemini 2.5 Flash explainers ready</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
