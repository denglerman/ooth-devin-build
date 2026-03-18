import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 60;

// Token limit for compressed contact list (~4 chars per token)
const MAX_TOKEN_ESTIMATE = 180000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKEN_ESTIMATE * CHARS_PER_TOKEN;

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

function compressContact(c: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  where_met: string | null;
  topics: string | null;
  ooth_notes: string | null;
}): string {
  const parts = [
    c.id,
    [c.first_name, c.last_name].filter(Boolean).join(' ') || '',
    c.company ?? '',
    c.job_title ?? '',
    c.where_met ?? '',
    c.topics ?? '',
    c.ooth_notes ?? '',
  ];
  return parts.join(' | ');
}

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

    // Load compressed contact index for all searchable users
    // Supabase PostgREST defaults to 1000 rows — set explicit high limit to avoid silent truncation
    const { data: allContacts, error: contactsError } = await supabaseAdmin
      .from('contacts')
      .select('id, user_id, first_name, last_name, company, job_title, where_met, topics, ooth_notes')
      .in('user_id', searchUserIds)
      .limit(50000);

    if (contactsError) {
      console.error('Failed to load contacts:', contactsError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    if (!allContacts || allContacts.length === 0) {
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    // Build compressed contact lines
    const compressedLines = allContacts.map((c) => compressContact(c));
    const compressedList = compressedLines.join('\n');
    const estimatedChars = compressedList.length;

    // If compressed list exceeds token limit, fall back to embedding search
    if (estimatedChars > MAX_CHARS) {
      return await embeddingFallbackSearch(query, user.id, searchUserIds, friendProfileMap);
    }

    // Build a map from contact ID to user_id for degree info
    const contactOwnerMap = new Map<string, string>();
    for (const c of allContacts) {
      contactOwnerMap.set(c.id, c.user_id);
    }

    // Send entire compressed list to Claude
    const claudePrompt = `You are a personal network search assistant. 
The user is searching for: '${query}'

Here is their complete contact list in compressed format (id | name | company | title | where met | topics | notes):
${compressedList}

Return a JSON array of the IDs of contacts that are relevant to this search query, ranked by relevance, with a 1-2 sentence explanation for each.
Format: [{"id": "uuid", "reasoning": "explanation"}]
Only include genuinely relevant contacts.
Return JSON only.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: claudePrompt }],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let rankedResults: { id: string; reasoning: string }[] = [];
    try {
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      rankedResults = JSON.parse(cleanedText);
    } catch {
      console.error('Failed to parse Claude response:', responseText);
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    if (rankedResults.length === 0) {
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    // Fetch full contact details for matched IDs
    const matchedIds = rankedResults.map((r) => r.id);
    const { data: fullContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, user_id')
      .in('id', matchedIds)
      .in('user_id', searchUserIds);

    const contactMap = new Map((fullContacts || []).map((c) => [c.id, c]));

    const results = rankedResults
      .filter((r) => contactMap.has(r.id))
      .map((r) => {
        const contact = contactMap.get(r.id)!;
        const isOwn = contact.user_id === user.id;
        const friendProfile = !isOwn ? friendProfileMap.get(contact.user_id) : null;
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

// Embedding-based fallback for users with extremely large contact lists
async function embeddingFallbackSearch(
  query: string,
  userId: string,
  searchUserIds: string[],
  friendProfileMap: Map<string, { username: string; full_name: string | null }>
) {
  // Check if embeddings are ready
  const { count: embeddedCount } = await supabaseAdmin
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .in('user_id', searchUserIds)
    .not('embedding', 'is', null);

  if (!embeddedCount || embeddedCount === 0) {
    // Text search fallback if no embeddings exist
    const words = query.split(/\s+/).filter((w: string) => w.length > 2);
    const searchTerms = words.length > 0 ? words : [query];

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
        const isOwn = c.user_id === userId;
        const friendProfile = !isOwn ? friendProfileMap.get(c.user_id) : null;
        return {
          ...c,
          degree: isOwn ? 1 : 2,
          via_friend: friendProfile?.full_name || friendProfile?.username || null,
          via_friend_username: friendProfile?.username || null,
          reasoning: 'Matched by text search (contact list too large for AI search, embeddings still building)',
        };
      }),
      mode: 'text',
      warning: 'Your contact list is very large. Using embedding-based search as fallback.',
    });
  }

  // Use embedding search
  const queryEmbedding = await generateEmbedding(query);

  const { data: allMatches, error: matchError } = await supabaseAdmin.rpc(
    'match_contacts',
    {
      query_embedding: queryEmbedding,
      match_count: 200,
    }
  );

  if (matchError) {
    console.error('Match error:', matchError);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  // Filter to allowed users
  const contactOwnerMap = new Map<string, string>();
  const { data: allowedContacts } = await supabaseAdmin
    .from('contacts')
    .select('id, user_id')
    .in('user_id', searchUserIds)
    .limit(50000);
  if (allowedContacts) {
    for (const c of allowedContacts) {
      contactOwnerMap.set(c.id, c.user_id);
    }
  }

  const matches = (allMatches || []).filter(
    (m: MatchContact) => contactOwnerMap.has(m.id)
  ).slice(0, 30);

  if (!matches || matches.length === 0) {
    return NextResponse.json({
      results: [],
      mode: 'ai',
      warning: 'Your contact list is very large. Using embedding-based search as fallback.',
    });
  }

  // Send to Claude for ranking
  const contactsForClaude = (matches as MatchContact[]).map((c) => {
    const ownerId = contactOwnerMap.get(c.id);
    const isOwn = ownerId === userId;
    const friendProfile = !isOwn && ownerId ? friendProfileMap.get(ownerId) : null;
    const degreeLabel = isOwn
      ? '1st degree (your contact)'
      : `2nd degree contact via ${friendProfile?.full_name || friendProfile?.username || 'a friend'}`;
    return {
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
      company: c.company,
      job_title: c.job_title,
      where_met: c.where_met,
      topics: c.topics,
      notes: c.ooth_notes || c.original_notes,
      similarity: c.similarity,
      degree: degreeLabel,
    };
  });

  const claudePrompt = `You are a personal network assistant. The user searched for: '${query}'. Here are the most semantically similar contacts from their network:
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
    const cleanedText = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    rankedResults = JSON.parse(cleanedText);
  } catch {
    console.error('Failed to parse Claude response:', responseText);
    return NextResponse.json({
      results: (matches as MatchContact[]).slice(0, 10).map((c) => ({
        ...c,
        reasoning: 'Semantically similar to your search query',
      })),
      mode: 'ai',
      warning: 'Your contact list is very large. Using embedding-based search as fallback.',
    });
  }

  const contactMap = new Map<string, MatchContact>(
    (matches as MatchContact[]).map((c) => [c.id, c])
  );

  const results = rankedResults
    .filter((r) => contactMap.has(r.id))
    .map((r) => {
      const contact = contactMap.get(r.id)!;
      const ownerId = contactOwnerMap.get(r.id);
      const isOwn = ownerId === userId;
      const friendProfile = !isOwn && ownerId ? friendProfileMap.get(ownerId) : null;
      return {
        ...contact,
        reasoning: r.reasoning,
        degree: isOwn ? 1 : 2,
        via_friend: friendProfile?.full_name || friendProfile?.username || null,
        via_friend_username: friendProfile?.username || null,
      };
    });

  return NextResponse.json({
    results,
    mode: 'ai',
    warning: 'Your contact list is very large. Using embedding-based search as fallback.',
  });
}
