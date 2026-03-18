import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
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
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, includeNetwork } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Get friend IDs if searching the network
    let friendIds: string[] = [];
    let friendProfileMap = new Map<string, { username: string; full_name: string | null }>();
    if (includeNetwork) {
      const { data: friendships } = await supabaseAdmin
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'active');
      friendIds = (friendships || []).map((f) => f.friend_id);

      if (friendIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name')
          .in('id', friendIds);
        friendProfileMap = new Map((profiles || []).map((p) => [p.id, { username: p.username, full_name: p.full_name }]));
      }
    }

    const searchUserIds = includeNetwork ? [user.id, ...friendIds] : [user.id];

    // Check if embeddings are ready
    const { count: embeddedCount } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .in('user_id', searchUserIds)
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
          'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, user_id'
        )
        .in('user_id', searchUserIds)
        .or(orConditions)
        .limit(30);

      return NextResponse.json({
        results: (textResults || []).map((c) => {
          const isOwn = c.user_id === user.id;
          const friendProfile = !isOwn ? friendProfileMap.get(c.user_id) : null;
          return {
            ...c,
            degree: isOwn ? 1 : 2,
            via_friend: friendProfile?.full_name || friendProfile?.username || null,
            via_friend_username: friendProfile?.username || null,
            reasoning: 'Matched by text search (embeddings still building)',
          };
        }),
        mode: 'text',
      });
    }

    // Hybrid search: run vector search AND text search in parallel, then merge
    const queryEmbedding = await generateEmbedding(query);

    // Extract meaningful search terms for text matching
    const stopWords = new Set(['people', 'person', 'who', 'that', 'work', 'works', 'worked', 'working', 'at', 'in', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'for', 'with', 'from', 'and', 'or', 'of', 'to', 'do', 'does', 'did', 'have', 'has', 'had', 'my', 'their', 'our', 'know', 'knows', 'knew', 'met', 'meet', 'find', 'search', 'look', 'looking']);
    const queryWords = query.split(/\s+/).filter((w: string) => w.length > 1 && !stopWords.has(w.toLowerCase()));
    const textSearchTerms = queryWords.length > 0 ? queryWords : [query];

    // Build OR conditions for text search across all searchable fields
    const textOrConditions = textSearchTerms
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

    // Run vector search and text search in parallel
    const [vectorResult, textResult, allowedResult] = await Promise.all([
      supabaseAdmin.rpc('match_contacts', {
        query_embedding: queryEmbedding,
        match_count: 200,
      }),
      supabaseAdmin
        .from('contacts')
        .select(
          'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, user_id'
        )
        .in('user_id', searchUserIds)
        .or(textOrConditions)
        .limit(30),
      supabaseAdmin
        .from('contacts')
        .select('id, user_id')
        .in('user_id', searchUserIds),
    ]);

    if (vectorResult.error) {
      console.error('Match error:', vectorResult.error);
      return NextResponse.json(
        { error: 'Search failed' },
        { status: 500 }
      );
    }

    // Build a set of allowed contact IDs and a map from contact ID to user_id
    const contactOwnerMap = new Map<string, string>();
    if (allowedResult.data) {
      for (const c of allowedResult.data) {
        contactOwnerMap.set(c.id, c.user_id);
      }
    }

    // Filter vector results to allowed contacts
    const vectorMatches = (vectorResult.data || []).filter(
      (m: MatchContact) => contactOwnerMap.has(m.id)
    );

    // Merge: start with vector matches, then add text-only matches not already present
    const seenIds = new Set<string>(vectorMatches.map((m: MatchContact) => m.id));
    const textOnlyMatches: MatchContact[] = [];
    for (const c of (textResult.data || [])) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        textOnlyMatches.push({
          ...c,
          similarity: 0.5, // baseline similarity for text matches
        } as MatchContact);
      }
    }

    const matches = [...vectorMatches, ...textOnlyMatches].slice(0, 30);

    if (!matches || matches.length === 0) {
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    // Prepare contacts for Claude with degree context
    const contactsForClaude = (matches as MatchContact[]).map(
      (c) => {
        const ownerId = contactOwnerMap.get(c.id);
        const isOwn = ownerId === user.id;
        const friendProfile = !isOwn && ownerId ? friendProfileMap.get(ownerId) : null;
        const degreeLabel = isOwn ? '1st degree (your contact)' : `2nd degree contact via ${friendProfile?.full_name || friendProfile?.username || 'a friend'}`;
        return {
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
          degree: degreeLabel,
        };
      }
    );

    // Send to Claude for ranking
    const claudePrompt = `You are a personal network assistant. The user searched for: '${query}'. Here are the most semantically similar contacts from their network (including 1st degree contacts they know directly and 2nd degree contacts via friends):
${JSON.stringify(contactsForClaude, null, 2)}

Return a JSON array of the most relevant contacts in ranked order. Only include contacts that are genuinely relevant to the query. For 2nd degree contacts, mention in the reasoning that they are connected via a friend.
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

    // Merge ranked results with full contact data + degree info
    const contactMap = new Map<string, MatchContact>(
      (matches as MatchContact[]).map(
        (c) => [c.id, c]
      )
    );

    const results = rankedResults
      .filter((r) => contactMap.has(r.id))
      .map((r) => {
        const contact = contactMap.get(r.id)!;
        const ownerId = contactOwnerMap.get(r.id);
        const isOwn = ownerId === user.id;
        const friendProfile = !isOwn && ownerId ? friendProfileMap.get(ownerId) : null;
        return {
          ...contact,
          reasoning: r.reasoning,
          degree: isOwn ? 1 : 2,
          via_friend: friendProfile?.full_name || friendProfile?.username || null,
          via_friend_username: friendProfile?.username || null,
        };
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
