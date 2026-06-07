'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Download, ExternalLink, Calendar } from 'lucide-react';
import Link from 'next/link';

export default function AuditsPage() {
  const { user } = useAuth();
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchAllAudits = async () => {
      try {
        setLoading(true);
        const clientsQuery = query(collection(db, 'clients'), where('createdBy', '==', user.uid));
        const clientsSnap = await getDocs(clientsQuery);
        const clientsList = clientsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));

        if (clientsList.length === 0) {
          setLoading(false);
          return;
        }

        const clientIds = clientsList.map(c => c.id);
        const clientsMap: { [id: string]: string } = {};
        clientsList.forEach(c => {
          clientsMap[c.id] = c.name;
        });

        const auditsQuery = query(
          collection(db, 'audit_runs'),
          where('clientId', 'in', clientIds),
          orderBy('createdAt', 'desc')
        );
        const auditsSnap = await getDocs(auditsQuery);
        const list = auditsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          clientName: clientsMap[doc.data().clientId] || 'Unknown Client',
          createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
        }));

        setAudits(list);
      } catch (err) {
        console.error('Error fetching audits:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllAudits();
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
            Audit Run Logs
          </h1>
          <p className="text-sm text-slate-400">
            Historical log of all Google Analytics and Tag Manager audits.
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : audits.length === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
            <CardHeader className="flex flex-col items-center">
              <Activity className="h-12 w-12 text-slate-600 mb-2" />
              <CardTitle className="text-xl font-bold text-white">No Audit Logs Found</CardTitle>
              <CardDescription className="text-slate-400">
                Register a client and run an audit to generate logs.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm text-left">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 font-medium">
                      <th className="px-6 py-4">Run Date</th>
                      <th className="px-6 py-4">Client Name</th>
                      <th className="px-6 py-4">Health Score</th>
                      <th className="px-6 py-4">Issues Found</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {audits.map((run) => (
                      <tr key={run.id} className="hover:bg-slate-900/10 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-300 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span>{run.createdAt.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-200 font-semibold">{run.clientName}</td>
                        <td className="px-6 py-4">
                          <Badge className={`font-semibold px-2 py-0.5 border ${getScoreBg(run.score)}`}>
                            {run.score} / 100 ({run.grade})
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <span className={run.issues?.length > 0 ? 'text-amber-500 font-medium' : 'text-emerald-500'}>
                            {run.issues?.length || 0} issues detected
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <a href={`/api/reports/pdf?clientId=${run.clientId}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white rounded-lg cursor-pointer">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                            <Link href={`/clients/${run.clientId}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-400 rounded-lg cursor-pointer">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
