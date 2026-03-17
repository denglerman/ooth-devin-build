'use client';

import Link from 'next/link';

type ContactCardProps = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  source?: string | null;
  reasoning?: string;
};

export default function ContactCard({
  id,
  first_name,
  last_name,
  email,
  company,
  job_title,
  source,
  reasoning,
}: ContactCardProps) {
  const fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown';
  const initials = `${(first_name || '?')[0]}${(last_name || '?')[0]}`.toUpperCase();

  return (
    <Link href={`/contact/${id}`}>
      <div className="bg-card rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer group">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-semibold text-sm">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-navy text-base truncate group-hover:text-accent transition-colors">
              {fullName}
            </h3>
            {job_title && (
              <p className="text-sm text-gray-500 truncate mt-0.5">{job_title}</p>
            )}
            {company && (
              <p className="text-sm text-gray-400 truncate">{company}</p>
            )}
            {email && (
              <p className="text-xs text-gray-400 truncate mt-2">{email}</p>
            )}
          </div>
          {source && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
              {source}
            </span>
          )}
        </div>
        {reasoning && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 italic leading-relaxed">{reasoning}</p>
          </div>
        )}
      </div>
    </Link>
  );
}
