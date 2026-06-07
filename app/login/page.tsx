'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, BarChart3, Tag, MessageSquare, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleLogin = async () => {
    try {
      setError(null);
      setSigningIn(true);
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Failed to sign in with Google');
    } finally {
      setSigningIn(false);
    }
  };

  if (loading || (user && !signingIn)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute -left-1/4 -top-1/4 h-[500px] w-[500px] rounded-full bg-indigo-500/10 blur-[120px]" />
      <div className="absolute -right-1/4 -bottom-1/4 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[120px]" />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300">
            Tracking Health AI
          </h2>
          <p className="mt-2 text-sm text-slate-400 max-w-sm">
            Audits your Google Analytics 4 and Tag Manager implementations automatically. Explains findings in natural language.
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-white">Agency Portal Access</CardTitle>
            <CardDescription className="text-slate-400">Sign in with your Google account to manage GA4 and GTM tracking audits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                <BarChart3 className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>GA4 Audit Engine</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                <Tag className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>GTM Tag Validation</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 col-span-2">
                <MessageSquare className="h-4 w-4 text-indigo-400 shrink-0" />
                <span>Gemini 2.5 Explainers & Chat Panel</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors h-11 font-medium shadow-md shadow-indigo-600/15 cursor-pointer" 
              onClick={handleLogin}
              disabled={signingIn}
            >
              {signingIn ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign in with Google</span>
                </div>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
