'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ContactCard from '@/components/ContactCard';
import SearchBar from '@/components/SearchBar';
import ImportModal from '@/components/ImportModal';
import ThemeToggle from '@/components/ThemeToggle';

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  source: string | null;
  reasoning?: string;
  degree?: number;
  via_friend?: string | null;
  via_friend_username?: string | null;
};

type NetworkFilter = 'mine' | 'all' | 'friends';

type Toast = {
  message: string;
  type: 'success' | 'error';
};

export default function Home() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('mine');
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [contactLimitWarning, setContactLimitWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const networkFilterRef = useRef<NetworkFilter>(networkFilter);
  networkFilterRef.current = networkFilter;

  const fetchContacts = useCallback(async (pageNum: number = 1, append: boolean = false, filter?: NetworkFilter) => {
    try {
      setIsLoading(true);
      const activeFilter = filter ?? networkFilterRef.current;
      const response = await fetch(`/api/contacts?page=${pageNum}&limit=50&filter=${activeFilter}`);
      const data = await response.json();

      if (append) {
        setContacts((prev) => [...prev, ...data.contacts]);
      } else {
        setContacts(data.contacts);
      }
      setTotal(data.total);
      setHasMore(pageNum * 50 < data.total);

      // Check if contact count exceeds search limit (~180k tokens at ~4 chars/token)
      // Rough estimate: average ~80 chars per compressed contact line
      const estimatedTokens = (data.total * 80) / 4;
      if (estimatedTokens > 180000) {
        const maxContacts = Math.floor((180000 * 4) / 80);
        setContactLimitWarning(
          `Your network has ${data.total.toLocaleString()} contacts which exceeds the search limit. Search may only see a portion of your contacts. For best results, keep your total contacts under ${maxContacts.toLocaleString()}. You can delete contacts to improve search accuracy.`
        );
      } else {
        setContactLimitWarning(null);
      }
    } catch {
      showToast('Failed to load contacts', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSearch = async (query: string) => {
    // Cancel any in-flight search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsSearching(true);
    setSearchMode(true);
    setSearchQuery(query);
    setContacts([]);
    setTotal(0);
    setHasMore(false);
    setSearchWarning(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, includeNetwork: networkFilter !== 'mine' }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        showToast(data.error || 'Search failed', 'error');
        setIsSearching(false);
        return;
      }

      // Handle SSE streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        showToast('Search failed: no response stream', 'error');
        setIsSearching(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (currentEvent === 'result') {
                setContacts((prev) => [...prev, parsed]);
                setTotal((prev) => prev + 1);
              } else if (currentEvent === 'update') {
                // Update reasoning for an already-streamed contact
                setContacts((prev) =>
                  prev.map((c) =>
                    c.id === parsed.id ? { ...c, reasoning: parsed.reasoning } : c
                  )
                );
              } else if (currentEvent === 'done') {
                setTotal(parsed.total);
              } else if (currentEvent === 'error') {
                showToast(parsed.error || 'Search failed', 'error');
              }
            } catch {
              // Skip malformed JSON
            }
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Search was cancelled — ignore
        return;
      }
      showToast('Search failed', 'error');
    } finally {
      // Only clean up if this is still the active search
      if (abortControllerRef.current === abortController) {
        setIsSearching(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancelSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSearching(false);
  };

  const handleClearSearch = () => {
    // Abort any in-flight SSE search stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSearching(false);
    setSearchMode(false);
    setSearchWarning(null);
    setSearchQuery('');
    setPage(1);
    fetchContacts(1);
  };

  const handleFilterChange = (filter: NetworkFilter) => {
    setNetworkFilter(filter);
    setSearchMode(false);
    setPage(1);
    fetchContacts(1, false, filter);
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      showToast('Failed to log out', 'error');
    }
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const response = await fetch('/api/contacts', { method: 'DELETE' });
      if (response.ok) {
        setContacts([]);
        setTotal(0);
        setHasMore(false);
        setPage(1);
        showToast(`All contacts deleted`);
      } else {
        showToast('Failed to delete contacts', 'error');
      }
    } catch {
      showToast('Failed to delete contacts', 'error');
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f1a]">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#0f0f1a]/80 backdrop-blur-lg border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-navy dark:text-white tracking-tight">ooth</h1>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <button
                onClick={() => setShowDeleteAll(true)}
                className="px-4 py-2.5 text-red-500 border border-red-200 dark:border-red-800 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                Delete All
              </button>
            )}
            <Link
              href="/friends"
              className="px-4 py-2.5 text-navy dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Friends
            </Link>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Import Contacts
            </button>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            onCancel={handleCancelSearch}
            isSearching={isSearching}
          />
        </div>

        {contactLimitWarning && !searchMode && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            {contactLimitWarning}
          </div>
        )}

        {searchWarning && searchMode && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            {searchWarning}
          </div>
        )}

        {!searchMode && (
          <div className="mb-6 flex items-center gap-2">
            {(['mine', 'all', 'friends'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  networkFilter === f
                    ? 'bg-navy text-white'
                    : 'bg-card dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {f === 'mine' ? 'My Contacts' : f === 'all' ? 'All Network' : 'Friends Only'}
              </button>
            ))}
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {searchMode ? (
              <>{total} result{total !== 1 ? 's' : ''} found</>
            ) : (
              <>{total.toLocaleString()} contact{total !== 1 ? 's' : ''}</>
            )}
          </p>
          {searchMode && (
            <button
              onClick={handleClearSearch}
              className="text-sm text-accent hover:text-accent/80 font-medium transition-colors dark:text-accent"
            >
              Clear search
            </button>
          )}
        </div>

        {isSearching && contacts.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card dark:bg-gray-800/50 rounded-2xl p-6 shadow-card animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isLoading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : contacts.length === 0 && !isSearching ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-card dark:bg-gray-800 mx-auto mb-4 flex items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            {searchMode ? (
              <>
                <h2 className="text-xl font-semibold text-navy dark:text-white mb-2">No contacts found for &apos;{searchQuery}&apos;</h2>
                <p className="text-gray-400 dark:text-gray-500 mb-6">Try searching by name, company, job title, or where you met someone.</p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-navy dark:text-white mb-2">No contacts yet</h2>
                <p className="text-gray-400 dark:text-gray-500 mb-6">Import your contacts from Google or LinkedIn to get started.</p>
                <button
                  onClick={() => setIsImportOpen(true)}
                  className="px-6 py-3 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  Import Contacts
                </button>
              </>
            )}
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
                  degree={contact.degree}
                  via_friend={contact.via_friend}
                />
              ))}
            </div>
            {hasMore && !searchMode && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="px-6 py-3 bg-card dark:bg-gray-800 text-navy dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImportComplete={handleImportComplete} />

      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDeleteAll(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-navy dark:text-white mb-2">Delete All Contacts</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Are you sure you want to delete all {total.toLocaleString()} contacts? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteAll(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteAll} disabled={isDeletingAll} className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-50 transition-colors">
                {isDeletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-6 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-navy text-white' : 'bg-red-500 text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
