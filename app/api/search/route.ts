import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 60;

type MatchContact = {
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
  similarity: number;
};

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Check if embeddings are ready
    const { count: embeddedCount } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (!embeddedCount || embeddedCount === 0) {
      // Fallback to full-text search — split query into words for better matching
      const words = query.split(/\s+/).filter((w: string) => w.length > 2);
      const searchTerms = words.length > 0 ? words : [query];

      // Build OR conditions for each word across all searchable fields
      const orConditions = searchTerms
        .flatMap((term: string) => [
          `first_name.ilike.%${term}%`,
          `last_name.ilike.%${term}%`,
          `email.ilike.%${term}%`,
          `company.ilike.%${term}%`,
          `job_title.ilike.%${term}%`,
          `topics.ilike.%${term}%`,
          `ooth_notes.ilike.%${term}%`,
          `original_notes.ilike.%${term}%`,
        ])
        .join(',');

      const { data: textResults } = await supabaseAdmin
        .from('contacts')
        .select(
          'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes'
        )
        .or(orConditions)
        .limit(30);

      return NextResponse.json({
        results: (textResults || []).map((c) => ({
          ...c,
          reasoning: 'Matched by text search (embeddings still building — AI search will be available soon)',
        })),
        mode: 'text',
      });
    }

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Call Supabase match_contacts function
    const { data: matches, error: matchError } = await supabaseAdmin.rpc(
      'match_contacts',
      {
        query_embedding: queryEmbedding,
        match_count: 30,
      }
    );

    if (matchError) {
      console.error('Match error:', matchError);
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    // Prepare contacts for Claude
    const contactsForClaude = (matches as MatchContact[]).map(
      (c) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        email: c.email,
        company: c.company,
        job_title: c.job_title,
        where_met: c.where_met,
        how_met: c.how_met,
        topics: c.topics,
        notes: c.ooth_notes || c.original_notes,
        similarity: c.similarity,
      })
    );

    // Send to Claude for ranking
    const claudePrompt = `You are a personal network assistant. The user searched for: '${query}'. Here are the 30 most semantically similar contacts from their network:
${JSON.stringify(contactsForClaude, null, 2)}

Return a JSON array of the most relevant contacts in ranked order. Only include contacts that are genuinely relevant to the query.
Format: [{"id": "uuid", "reasoning": "1-2 sentences explaining why this person is relevant"}]
Return JSON only, no other text.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: claudePrompt }],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let rankedResults: { id: string; reasoning: string }[] = [];
    try {
      // Try parsing the response, handle potential markdown code blocks
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      rankedResults = JSON.parse(cleanedText);
    } catch {
      console.error('Failed to parse Claude response:', responseText);
      // Fallback: return matches with generic reasoning
      return NextResponse.json({
        results: (matches as MatchContact[]).slice(0, 10).map(
          (c) => ({
            ...c,
            reasoning: 'Semantically similar to your search query',
          })
        ),
        mode: 'ai',
      });
    }

    // Merge ranked results with full contact data
    const contactMap = new Map<string, MatchContact>(
      (matches as MatchContact[]).map(
        (c) => [c.id, c]
      )
    );

    const results = rankedResults
      .filter((r) => contactMap.has(r.id))
      .map((r) => {
        const contact = contactMap.get(r.id)!;
        return { ...contact, reasoning: r.reasoning };
      });

    return NextResponse.json({ results, mode: 'ai' });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
