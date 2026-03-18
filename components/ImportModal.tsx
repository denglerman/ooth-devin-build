'use client';

import { useState, useCallback, useRef } from 'react';

type ImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (result: { imported: number; skipped: number; source: string }) => void;
};

export default function ImportModal({ isOpen, onClose, onImportComplete }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setError('Please upload a CSV file');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Import failed');
          return;
        }

        onImportComplete({
          imported: data.imported,
          skipped: data.skipped,
          source: data.source,
        });

      } catch {
        setError('Failed to upload file. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [onImportComplete]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-8 max-w-lg w-full mx-4 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-navy mb-2">Import Contacts</h2>
        <p className="text-gray-500 text-sm mb-6">
          Upload a CSV from Google Contacts or LinkedIn. We&apos;ll auto-detect the format.
        </p>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-accent bg-accent/5'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <svg
                className="animate-spin h-8 w-8 text-accent"
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
              <p className="text-navy font-medium">Importing contacts...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <svg
                className="h-10 w-10 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-navy font-medium">Drop your CSV here</p>
                <p className="text-gray-400 text-sm mt-1">or click to browse</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 rounded-xl text-red-600 text-sm">{error}</div>
        )}

        <p className="mt-4 text-xs text-gray-400 text-center">
          Supports Google Contacts and LinkedIn CSV exports
        </p>
      </div>
    </div>
  );
}
