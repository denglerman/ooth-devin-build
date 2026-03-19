import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Standalone supabase admin for embedding writes (avoids circular imports)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const embeddingDb = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : createClient(supabaseUrl, supabaseAnonKey);

type ContactFields = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  where_met?: string | null;
  how_met?: string | null;
  topics?: string | null;
  ooth_notes?: string | null;
  original_notes?: string | null;
  email?: string | null;
  source?: string | null;
};

export function contactToText(contact: ContactFields): string {
  const parts: string[] = [];

  if (contact.first_name || contact.last_name) {
    parts.push(`${contact.first_name || ''} ${contact.last_name || ''}`.trim());
  }
  if (contact.company) parts.push(contact.company);
  if (contact.job_title) parts.push(contact.job_title);
  if (contact.where_met) parts.push(contact.where_met);
  if (contact.how_met) parts.push(contact.how_met);
  if (contact.topics) parts.push(contact.topics);
  if (contact.ooth_notes) parts.push(contact.ooth_notes);
  if (contact.original_notes) parts.push(contact.original_notes);

  return parts.join(' | ');
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });

  return response.data.map((d) => d.embedding);
}

/**
 * Generate and store embedding for a single contact.
 * Designed to run in the background — never blocks the caller.
 */
export async function generateEmbeddingForContact(
  contact: ContactFields
): Promise<void> {
  if (!contact.id) return;
  const text = contactToText(contact);
  if (!text.trim()) return;

  const embedding = await generateEmbedding(text);

  await embeddingDb
    .from('contacts')
    .update({ embedding })
    .eq('id', contact.id);
}

/**
 * Generate and store embeddings for multiple contacts in batches.
 * Designed to run in the background after CSV import.
 */
export async function generateEmbeddingsForContacts(
  contacts: ContactFields[]
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => contactToText(c) || 'empty');

    try {
      const embeddings = await generateEmbeddings(texts);

      const updates = batch.map((c, idx) => ({
        id: c.id!,
        embedding: embeddings[idx],
      }));

      // Update each contact's embedding
      for (const update of updates) {
        await embeddingDb
          .from('contacts')
          .update({ embedding: update.embedding })
          .eq('id', update.id);
      }
    } catch (err) {
      console.error(`Embedding batch ${i}-${i + BATCH_SIZE} failed:`, err);
    }
  }
}
