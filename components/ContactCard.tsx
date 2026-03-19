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
  degree?: number;
  via_friend?: string | null;
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
  degree,
  via_friend,
}: ContactCardProps) {
  const fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Unknown';
  const initials = `${(first_name || '?')[0]}${(last_name || '?')[0]}`.toUpperCase();

  return (
    <Link href={`/contact/${id}`}>
      <div className="bg-card dark:bg-gray-800/50 rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer group animate-fade-in">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <span className="text-accent font-semibold text-sm">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-navy dark:text-white text-base truncate group-hover:text-accent transition-colors">
                {fullName}
              </h3>
              {degree && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  degree === 1
                    ? 'bg-navy/10 text-navy'
                    : 'bg-accent/10 text-accent'
                }`}>
                  {degree === 1 ? '1st' : degree === 2 ? '2nd' : '3rd+'}
                </span>
              )}
            </div>
            {job_title && (
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{job_title}</p>
            )}
            {company && (
              <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{company}</p>
            )}
            {email && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-2">{email}</p>
            )}
            {via_friend && degree === 2 && (
              <p className="text-xs text-accent/70 truncate mt-1">via {via_friend}</p>
            )}
          </div>
          {source && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
              {source}
            </span>
          )}
        </div>
        {reasoning && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed">{reasoning}</p>
          </div>
        )}
      </div>
    </Link>
  );
}
