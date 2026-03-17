'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Friend = {
  id: string;
  friend_id: string;
  username: string;
  full_name: string | null;
  created_at: string;
};

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchFriends = useCallback(async () => {
    try {
      const response = await fetch('/api/friends');
      if (response.status === 401) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setFriends(data.friends || []);
    } catch {
      setError('Failed to load friends');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username.trim()) return;

    setIsAdding(true);

    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to add friend');
        setIsAdding(false);
        return;
      }

      setSuccess(`Added ${data.friend.username} as a friend!`);
      setUsername('');
      fetchFriends();
    } catch {
      setError('Failed to add friend');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveFriend = async (friendshipId: string, friendUsername: string) => {
    try {
      const response = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        setError('Failed to remove friend');
        return;
      }

      setSuccess(`Removed ${friendUsername} from friends`);
      setFriends((prev) => prev.filter((f) => f.id !== friendshipId));
    } catch {
      setError('Failed to remove friend');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-navy tracking-tight">ooth</Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2.5 text-navy border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Contacts
            </Link>
            <Link
              href="/friends"
              className="px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Friends
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 text-gray-500 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-xl font-bold text-navy mb-6">Friends</h2>

        {/* Add Friend Form */}
        <form onSubmit={handleAddFriend} className="mb-8">
          <label className="block text-sm font-medium text-navy mb-2">Add a friend by username</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
                setSuccess('');
              }}
              placeholder="Enter username"
              className="flex-1 px-4 py-2.5 bg-card rounded-xl border border-gray-200 text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 text-sm"
            />
            <button
              type="submit"
              disabled={isAdding || !username.trim()}
              className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
        </form>

        {/* Friends List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-card mx-auto mb-4 flex items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-navy mb-2">No friends yet</h3>
            <p className="text-gray-400 text-sm">Add friends by their username above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-4">{friends.length} friend{friends.length !== 1 ? 's' : ''}</p>
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-4 bg-card rounded-xl"
              >
                <div>
                  <p className="text-sm font-medium text-navy">@{friend.username}</p>
                  {friend.full_name && (
                    <p className="text-xs text-gray-400 mt-0.5">{friend.full_name}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveFriend(friend.id, friend.username)}
                  className="px-3 py-1.5 text-red-500 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
