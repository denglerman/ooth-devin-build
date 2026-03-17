import OpenAI from 'openai';
import { Contact } from './supabase';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function contactToText(contact: Partial<Contact>): string {
  const parts: string[] = [];

  if (contact.first_name || contact.last_name) {
    parts.push(`${contact.first_name || ''} ${contact.last_name || ''}`.trim());
  }

  if (contact.company) {
    parts.push(`works at ${contact.company}`);
  }

  if (contact.job_title) {
    parts.push(`as ${contact.job_title}`);
  }

  if (contact.where_met) {
    parts.push(`Met at ${contact.where_met}`);
  }

  if (contact.how_met) {
    parts.push(`via ${contact.how_met}`);
  }

  if (contact.topics) {
    parts.push(`Topics: ${contact.topics}`);
  }

  if (contact.ooth_notes) {
    parts.push(contact.ooth_notes);
  }

  if (contact.original_notes) {
    parts.push(contact.original_notes);
  }

  if (contact.email) {
    parts.push(`Email: ${contact.email}`);
  }

  if (contact.source) {
    parts.push(`Source: ${contact.source}`);
  }

  return parts.join('. ');
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
