'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Activity, Check, Info } from 'lucide-react';

const LEAD_TYPES = [
  { id: 'registrations', label: 'Registrations', defaultEvent: 'complete_registration' },
  { id: 'sign_ups', label: 'Sign ups', defaultEvent: 'sign_up' },
  { id: 'contacts', label: 'Contacts', defaultEvent: 'contact' },
  { id: 'submit_applications', label: 'Submit applications', defaultEvent: 'submit_application' },
  { id: 'book_appointment', label: 'Book appointment', defaultEvent: 'book_appointment' },
  { id: 'schedule_a_call', label: 'Schedule a call', defaultEvent: 'schedule_a_call' },
  { id: 'newsletter_subscription', label: 'Newsletter subscription', defaultEvent: 'newsletter_subscription' },
  { id: 'download_ebook_pdf', label: 'Download ebook/pdf', defaultEvent: 'download_ebook_pdf' },
  { id: 'lead', label: 'Lead', defaultEvent: 'generate_lead' },
];

interface AuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    leadTypes: string[];
    leadEventNames: Record<string, string>;
    purchaseEventName: string;
    pageViewEventName: string;
  }) => void;
  initialData?: {
    leadTypes?: string[];
    leadEventNames?: Record<string, string>;
    purchaseEventName?: string;
    pageViewEventName?: string;
    industry?: string;
  };
  isLoading?: boolean;
}

export function AuditModal({ isOpen, onClose, onSubmit, initialData, isLoading }: AuditModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [leadEventNames, setLeadEventNames] = useState<Record<string, string>>({});
  
  // E-commerce tracking toggle
  const [trackPurchase, setTrackPurchase] = useState(true);
  const [purchaseEventName, setPurchaseEventName] = useState('purchase');
  const [pageViewEventName, setPageViewEventName] = useState('page_view');

  // Populate initial data when modal opens
  useEffect(() => {
    if (isOpen) {
      const types = initialData?.leadTypes || ['lead']; // default to 'lead'
      setSelectedTypes(types);

      const eventNamesMap: Record<string, string> = {};
      LEAD_TYPES.forEach(t => {
        eventNamesMap[t.id] = initialData?.leadEventNames?.[t.id] || t.defaultEvent;
      });
      setLeadEventNames(eventNamesMap);

      const savedPurchaseName = initialData?.purchaseEventName;
      // If there's an explicit purchaseEventName stored, use it.
      if (savedPurchaseName !== undefined) {
        setPurchaseEventName(savedPurchaseName);
        setTrackPurchase(savedPurchaseName.trim().length > 0);
      } else {
        // Fallback default based on industry if available
        const isEcommerce = initialData?.industry?.toLowerCase().includes('ecommerce') || 
                            initialData?.industry?.toLowerCase().includes('shop') || 
                            initialData?.industry?.toLowerCase().includes('retail');
        setPurchaseEventName('purchase');
        setTrackPurchase(isEcommerce ?? true);
      }

      setPageViewEventName(initialData?.pageViewEventName || 'page_view');
    }
  }, [isOpen, initialData]);

  const handleCheckboxChange = (id: string) => {
    setSelectedTypes(prev => {
      if (prev.includes(id)) {
        return prev.filter(t => t !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleEventNameChange = (id: string, value: string) => {
    setLeadEventNames(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter event names to only those selected
    const filteredEventNames: Record<string, string> = {};
    selectedTypes.forEach(t => {
      filteredEventNames[t] = leadEventNames[t]?.trim() || '';
    });

    onSubmit({
      leadTypes: selectedTypes,
      leadEventNames: filteredEventNames,
      purchaseEventName: trackPurchase ? purchaseEventName.trim() : '',
      pageViewEventName: pageViewEventName.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-slate-950 border border-slate-900 text-slate-100 p-6 rounded-2xl shadow-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            Audit Parameters Setup
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs mt-1">
            Customize the conversion and event tracking goals to run a targeted tracking audit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Lead Types Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lead Type(s)</Label>
            <div className="grid grid-cols-2 gap-2 bg-slate-900/30 p-3 rounded-xl border border-slate-900/60 max-h-[160px] overflow-y-auto">
              {LEAD_TYPES.map(type => {
                const isChecked = selectedTypes.includes(type.id);
                return (
                  <label
                    key={type.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-all ${
                      isChecked
                        ? 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-200'
                        : 'border border-transparent hover:bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCheckboxChange(type.id)}
                      className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <span>{type.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Dynamic Lead Event Names */}
          {selectedTypes.length > 0 && (
            <div className="space-y-3 bg-slate-900/20 p-3.5 rounded-xl border border-slate-900/80 max-h-[180px] overflow-y-auto">
              <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lead Event Names</Label>
              <div className="space-y-3">
                {selectedTypes.map(typeId => {
                  const type = LEAD_TYPES.find(t => t.id === typeId);
                  return (
                    <div key={typeId} className="flex flex-col gap-1.5">
                      <Label htmlFor={`event-${typeId}`} className="text-[11px] text-slate-400 font-medium">
                        GA4 Event Name for <span className="text-slate-300 font-semibold">{type?.label}</span>
                      </Label>
                      <Input
                        id={`event-${typeId}`}
                        value={leadEventNames[typeId] || ''}
                        onChange={(e) => handleEventNameChange(typeId, e.target.value)}
                        placeholder={`e.g. ${type?.defaultEvent}`}
                        required
                        className="h-9 text-xs bg-slate-950 border border-slate-900 text-slate-200 rounded-lg focus-visible:ring-indigo-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Purchase Event Toggle & Dynamic Input */}
          <div className="space-y-3 bg-slate-900/10 p-3.5 rounded-xl border border-slate-900/40">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={trackPurchase}
                onChange={() => setTrackPurchase(!trackPurchase)}
                className="rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Track E-commerce/Purchases</span>
            </label>

            {trackPurchase && (
              <div className="flex flex-col gap-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <Label htmlFor="purchase-event" className="text-[11px] text-slate-400 font-medium">
                  GA4 Purchase Event Name
                </Label>
                <Input
                  id="purchase-event"
                  value={purchaseEventName}
                  onChange={(e) => setPurchaseEventName(e.target.value)}
                  placeholder="e.g. purchase"
                  required={trackPurchase}
                  className="h-9 text-xs bg-slate-950 border border-slate-900 text-slate-200 rounded-lg focus-visible:ring-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Page View Event Name */}
          <div className="flex flex-col gap-1.5 bg-slate-900/10 p-3.5 rounded-xl border border-slate-900/40">
            <div className="flex items-center justify-between">
              <Label htmlFor="page-view-event" className="text-xs font-bold text-slate-300 uppercase tracking-wider">Page View Event</Label>
              <span className="text-[10px] text-slate-500 font-medium">(Optional Custom)</span>
            </div>
            <Input
              id="page-view-event"
              value={pageViewEventName}
              onChange={(e) => setPageViewEventName(e.target.value)}
              placeholder="e.g. page_view"
              className="h-9 text-xs bg-slate-950 border border-slate-900 text-slate-200 rounded-lg focus-visible:ring-indigo-500"
            />
          </div>

          <DialogFooter className="mt-6 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 border border-slate-900 text-slate-400 hover:text-white rounded-xl h-10 cursor-pointer text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 cursor-pointer font-semibold shadow-lg shadow-indigo-600/20 text-xs"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
              ) : (
                'Run Audit'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
