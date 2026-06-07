'use client';

import DashboardLayout from '@/components/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Mail, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, role } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Workspace Settings
          </h1>
          <p className="text-sm text-slate-400">
            Configure your user profile, roles, and API integrations.
          </p>
        </div>

        {user && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-white">Your Profile</CardTitle>
                <CardDescription className="text-slate-400">Personal details and authentication status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-300">Email:</span>
                  <span className="font-semibold text-slate-200">{user.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-300">Role:</span>
                  <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/5">
                    {role?.toUpperCase() || 'MEMBER'}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-slate-300">Status:</span>
                  <span className="text-emerald-400 font-semibold">Active & Authenticated</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-900 bg-slate-900/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-white">System API Keys</CardTitle>
                <CardDescription className="text-slate-400">Global environment configurations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2 p-3.5 rounded-xl border border-slate-900 bg-slate-950/40">
                  <p className="font-semibold text-slate-300">Firebase configuration</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Automatically initialized using client-side keys: NEXT_PUBLIC_FIREBASE_API_KEY
                  </p>
                </div>
                
                <div className="space-y-2 p-3.5 rounded-xl border border-slate-900 bg-slate-950/40">
                  <p className="font-semibold text-slate-300">Google OAuth API Client</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Client ID and Secret configured via server variables. Allows fetching properties and offline container tag listings.
                  </p>
                </div>

                <div className="space-y-2 p-3.5 rounded-xl border border-slate-900 bg-slate-950/40">
                  <p className="font-semibold text-slate-300">Gemini 2.5 Flash</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    AI capabilities powered by GEMINI_API_KEY. Used to analyze deterministic findings and output summaries.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
