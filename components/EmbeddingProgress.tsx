'use client';

import { useState, useEffect, useCallback } from 'react';

export default function EmbeddingProgress() {
  const [status, setStatus] = useState<{
    total: number;
    embedded: number;
    ready: boolean;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);

  const triggerGeneration = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      await fetch('/api/generate-embeddings', { method: 'POST' });
    } catch {
      // Silently fail
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/embedding-status');
      const data = await response.json();
      setStatus(data);

      if (data.total > 0 && !data.ready) {
        setIsVisible(true);
        // Trigger embedding generation if not already in progress
        triggerGeneration();
      } else {
        setIsVisible(false);
      }
    } catch {
      // Silently fail
    }
  }, [triggerGeneration]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (!isVisible || !status) return null;

  const percentage = status.total > 0 ? Math.round((status.embedded / status.total) * 100) : 0;

  return (
    <div className="fixed bottom-6 right-6 bg-white rounded-2xl shadow-lg p-4 flex items-center gap-3 z-40 border border-gray-100">
      <svg
        className="animate-spin h-4 w-4 text-accent flex-shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <div>
        <p className="text-sm text-navy font-medium">
          Building search index...
        </p>
        <p className="text-xs text-gray-400">
          {status.embedded.toLocaleString()} of {status.total.toLocaleString()} ({percentage}%)
        </p>
      </div>
    </div>
  );
}
