'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Plus, ArrowRight, Building2, Calendar } from 'lucide-react';
import Link from 'next/link';

export default function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchClients = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const q = query(collection(db, 'clients'), where('createdBy', '==', user.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)
      }));
      setClients(list);
    } catch (err) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [user]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name || !industry) return;

    try {
      setCreating(true);
      const newClient = {
        name,
        industry,
        createdBy: user.uid,
        members: {
          [user.uid]: 'owner'
        },
        createdAt: new Date()
      };
      
      await addDoc(collection(db, 'clients'), newClient);
      
      setName('');
      setIndustry('');
      setOpen(false);
      await fetchClients();
    } catch (err) {
      console.error('Error creating client:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Client Management
            </h1>
            <p className="text-sm text-slate-400">
              Manage your agency client accounts and tracking connections.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium gap-2 rounded-xl cursor-pointer">
                <Plus className="h-4 w-4" />
                <span>Add Client</span>
              </Button>
            } />
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
              <form onSubmit={handleCreateClient}>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">Create Client Profile</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Add a new client to begin GA4 and GTM auditing.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-300">Client Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Acme Corp"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry" className="text-slate-300">Industry</Label>
                    <Input
                      id="industry"
                      placeholder="e.g. E-commerce, SaaS, Finance"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    className="text-slate-400 hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
                    disabled={creating}
                  >
                    {creating ? 'Creating...' : 'Create Profile'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : clients.length === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-900/10 p-12 text-center">
            <CardHeader className="flex flex-col items-center">
              <Users className="h-12 w-12 text-slate-600 mb-2" />
              <CardTitle className="text-xl font-bold text-white">No Clients Available</CardTitle>
              <CardDescription className="text-slate-400">
                You have not registered any clients yet.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <Card 
                key={client.id}
                className="border-slate-900 bg-slate-900/20 hover:bg-slate-900/40 hover:border-slate-800/80 transition-all duration-300 flex flex-col justify-between overflow-hidden relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/3 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                      {client.name}
                    </CardTitle>
                  </div>
                  <CardDescription className="flex items-center gap-1.5 text-slate-400 text-xs mt-1">
                    <Building2 className="h-3.5 w-3.5 text-indigo-400/80" />
                    <span>{client.industry}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Created: {client.createdAt.toLocaleDateString()}</span>
                  </div>
                </CardContent>

                <CardFooter className="border-t border-slate-900 bg-slate-950/20 py-4">
                  <Link href={`/clients/${client.id}`} className="w-full">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between text-indigo-400 group-hover:text-indigo-300 group-hover:bg-indigo-600/5 transition-all p-0 px-3 h-10 rounded-xl cursor-pointer"
                    >
                      <span>Manage Client Workspace</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
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
