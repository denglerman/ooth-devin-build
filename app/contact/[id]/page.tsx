'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

type ContactDetail = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  original_notes: string | null;
  source: string | null;
  where_met: string | null;
  when_met: string | null;
  how_met: string | null;
  topics: string | null;
  relationship_strength: string | null;
  ooth_notes: string | null;
  created_at: string;
};

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Core fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Ooth context fields
  const [whereMet, setWhereMet] = useState('');
  const [whenMet, setWhenMet] = useState('');
  const [howMet, setHowMet] = useState('');
  const [topics, setTopics] = useState('');
  const [relationshipStrength, setRelationshipStrength] = useState('');
  const [oothNotes, setOothNotes] = useState('');

  const fetchContact = useCallback(async () => {
    try {
      const response = await fetch(`/api/contacts/${id}`);
      if (!response.ok) {
        router.push('/');
        return;
      }
      const data = await response.json();
      setContact(data);
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setCompany(data.company || '');
      setJobTitle(data.job_title || '');
      setWhereMet(data.where_met || '');
      setWhenMet(data.when_met || '');
      setHowMet(data.how_met || '');
      setTopics(data.topics || '');
      setRelationshipStrength(data.relationship_strength || '');
      setOothNotes(data.ooth_notes || '');
    } catch {
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName || null,
          last_name: lastName || null,
          email: email || null,
          phone: phone || null,
          company: company || null,
          job_title: jobTitle || null,
          where_met: whereMet || null,
          when_met: whenMet || null,
          how_met: howMet || null,
          topics: topics || null,
          relationship_strength: relationshipStrength || null,
          ooth_notes: oothNotes || null,
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        setContact(updated);
        setToast('Contact saved successfully');
        setTimeout(() => setToast(null), 3000);
      } else {
        setToast('Failed to save');
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast('Failed to save');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/');
      } else {
        setToast('Failed to delete contact');
        setTimeout(() => setToast(null), 3000);
        setShowDeleteConfirm(false);
      }
    } catch {
      setToast('Failed to delete contact');
      setTimeout(() => setToast(null), 3000);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!contact) return null;

  const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
  const initials = `${(firstName || '?')[0]}${(lastName || '?')[0]}`.toUpperCase();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-navy transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-navy tracking-tight">ooth</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start gap-5 mb-8">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-bold text-xl">{initials}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold text-navy">{fullName}</h2>
              {contact.source && (
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">{contact.source}</span>
              )}
            </div>
            {jobTitle && <p className="text-gray-500 text-lg mt-1">{jobTitle}</p>}
            {company && <p className="text-gray-400 text-base">{company}</p>}
          </div>
        </div>

        <div className="bg-card rounded-2xl p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Contact Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">First Name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Job Title</label>
              <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
          </div>
          {contact.original_notes && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-navy mb-1.5">Original Notes</label>
              <p className="text-sm text-gray-500">{contact.original_notes}</p>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">Ooth Context</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Where we met</label>
              <input type="text" value={whereMet} onChange={(e) => setWhereMet(e.target.value)} placeholder="e.g. TechCrunch Disrupt 2024" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">When we met</label>
              <input type="date" value={whenMet} onChange={(e) => setWhenMet(e.target.value)} className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">How we met</label>
              <select value={howMet} onChange={(e) => setHowMet(e.target.value)} className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm">
                <option value="">Select...</option>
                <option value="In Person">In Person</option>
                <option value="Introduction">Introduction</option>
                <option value="Online">Online</option>
                <option value="Conference">Conference</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Topics discussed</label>
              <input type="text" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. AI, climate tech, series A fundraising" className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Relationship strength</label>
              <select value={relationshipStrength} onChange={(e) => setRelationshipStrength(e.target.value)} className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm">
                <option value="">Select...</option>
                <option value="Weak">Weak</option>
                <option value="Familiar">Familiar</option>
                <option value="Close">Close</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1.5">Personal notes</label>
              <textarea value={oothNotes} onChange={(e) => setOothNotes(e.target.value)} placeholder="Your private notes about this person..." rows={4} className="w-full px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm resize-none" />
            </div>
            <div className="pt-2 flex items-center gap-3">
              <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} className="px-6 py-2.5 bg-white text-red-500 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                Delete Contact
              </button>
            </div>
          </div>
        </div>
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-navy mb-2">Delete Contact</h3>
            <p className="text-gray-500 text-sm mb-6">
              Are you sure you want to delete {fullName}? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-50 transition-colors">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-6 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium bg-navy text-white">{toast}</div>
      )}
    </div>
  );
}
