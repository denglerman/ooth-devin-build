'use client';

import { useState, useEffect, useCallback } from 'react';
import ContactCard from '@/components/ContactCard';
import SearchBar from '@/components/SearchBar';
import ImportModal from '@/components/ImportModal';
import EmbeddingProgress from '@/components/EmbeddingProgress';

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  source: string | null;
  reasoning?: string;
};

type Toast = {
  message: string;
  type: 'success' | 'error';
};

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchContacts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/contacts?page=${pageNum}&limit=50`);
      const data = await response.json();

      if (append) {
        setContacts((prev) => [...prev, ...data.contacts]);
      } else {
        setContacts(data.contacts);
      }
      setTotal(data.total);
      setHasMore(pageNum * 50 < data.total);
    } catch {
      showToast('Failed to load contacts', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    setSearchMode(true);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast(data.error || 'Search failed', 'error');
        return;
      }

      setContacts(data.results || []);
      setTotal(data.results?.length || 0);
      setHasMore(false);
    } catch {
      showToast('Search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchMode(false);
    setPage(1);
    fetchContacts(1);
  };

  const handleImportComplete = (result: { imported: number; skipped: number; source: string }) => {
    setIsImportOpen(false);
    showToast(
      `Imported ${result.imported} contacts from ${result.source}.${
        result.skipped > 0 ? ` ${result.skipped} skipped.` : ''
      }`
    );
    setPage(1);
    fetchContacts(1);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchContacts(nextPage, true);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy tracking-tight">ooth</h1>
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Import Contacts
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            isSearching={isSearching}
          />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {searchMode ? (
              <>{total} result{total !== 1 ? 's' : ''} found</>
            ) : (
              <>{total.toLocaleString()} contact{total !== 1 ? 's' : ''}</>
            )}
          </p>
          {searchMode && (
            <button
              onClick={handleClearSearch}
              className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Clear search
            </button>
          )}
        </div>

        {isLoading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-card mx-auto mb-4 flex items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-navy mb-2">No contacts yet</h2>
            <p className="text-gray-400 mb-6">Import your contacts from Google or LinkedIn to get started.</p>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-6 py-3 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Import Contacts
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  id={contact.id}
                  first_name={contact.first_name}
                  last_name={contact.last_name}
                  email={contact.email}
                  company={contact.company}
                  job_title={contact.job_title}
                  source={contact.source}
                  reasoning={contact.reasoning}
                />
              ))}
            </div>
            {hasMore && !searchMode && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="px-6 py-3 bg-card text-navy rounded-xl text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImportComplete={handleImportComplete} />
      <EmbeddingProgress />

      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-navy text-white' : 'bg-red-500 text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
