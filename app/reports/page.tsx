'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Download, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchReportsData = async () => {
      try {
        setLoading(true);
        const clientsQuery = query(collection(db, 'clients'), where('createdBy', '==', user.uid));
        const clientsSnap = await getDocs(clientsQuery);
        const clientsList: any[] = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (clientsList.length === 0) {
          setLoading(false);
          return;
        }

        const clientIds = clientsList.map(c => c.id);

        const auditsQuery = query(
          collection(db, 'audit_runs'),
          where('clientId', 'in', clientIds),
          orderBy('createdAt', 'desc')
        );
        const auditsSnap = await getDocs(auditsQuery);
        const auditsList: any[] = auditsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const latestAuditsMap: { [clientId: string]: any } = {};
        auditsList.forEach(audit => {
          if (!latestAuditsMap[audit.clientId]) {
            latestAuditsMap[audit.clientId] = audit;
          }
        });

        const formatted = clientsList.map((client: any) => {
          const audit = latestAuditsMap[client.id] || null;
          return {
            ...client,
            latestAudit: audit
          };
        });

        setReports(formatted);
      } catch (err) {
        console.error('Error fetching reports:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportsData();
  }, [user]);

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
            Client Weekly Reports
          </h1>
          <p className="text-sm text-slate-400">
            Download print-friendly white layout PDF audit reports for client presentations.
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
            <CardHeader className="flex flex-col items-center">
              <FileText className="h-12 w-12 text-slate-600 mb-2" />
              <CardTitle className="text-xl font-bold text-white">No Client Reports</CardTitle>
              <CardDescription className="text-slate-400">
                You must add clients to generate PDF reports.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((rep) => (
              <Card 
                key={rep.id}
                className="border-slate-900 bg-slate-900/20 flex flex-col justify-between overflow-hidden group"
              >
                <CardHeader>
                  <CardTitle className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {rep.name}
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs mt-1">
                    Industry: {rep.industry}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 space-y-4">
                  {rep.latestAudit ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Latest Health Status:</span>
                        <Badge className={`font-semibold px-2 py-0.5 border ${getScoreBg(rep.latestAudit.score)}`}>
                          Score: {rep.latestAudit.score} ({rep.latestAudit.grade})
                        </Badge>
                      </div>
                      
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-900">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {rep.latestAudit.issues?.length > 0 ? (
                            <>
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                              <span>{rep.latestAudit.issues.length} unresolved tracking issues</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                              <span>GA4 & GTM tracking healthy</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-slate-950/20 rounded-xl border border-slate-900">
                      <p className="text-xs text-slate-500">No audits run yet.</p>
                      <Link href={`/clients/${rep.id}`} className="mt-2 inline-block">
                        <span className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
                          Go run an audit
                        </span>
                      </Link>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="border-t border-slate-900 bg-slate-950/20 py-4 gap-2">
                  {rep.latestAudit ? (
                    <a href={`/api/reports/pdf?clientId=${rep.id}`} className="flex-1">
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-2 rounded-xl h-10 cursor-pointer">
                        <Download className="h-4 w-4" />
                        <span>Export PDF</span>
                      </Button>
                    </a>
                  ) : (
                    <Button disabled className="flex-1 bg-slate-800 text-slate-600 rounded-xl h-10">
                      <span>No PDF Available</span>
                    </Button>
                  )}
                  <Link href={`/clients/${rep.id}`}>
                    <Button variant="outline" size="icon" className="h-10 w-10 border-slate-800 text-slate-400 hover:text-white rounded-xl cursor-pointer">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
