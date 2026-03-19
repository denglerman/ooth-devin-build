import { NextRequest } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/embeddings';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  id: string;
  score: number;
  source: 'fts' | 'fuzzy' | 'alias' | 'semantic';
}

type FullContact = {
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
  user_id: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compressContact(c: {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  where_met: string | null;
  how_met: string | null;
  topics: string | null;
  original_notes: string | null;
  ooth_notes: string | null;
}): string {
  const sanitize = (s: string | null) => s?.replace(/[\n\r|]/g, ' ').trim() || '';
  const parts = [
    c.id,
    [sanitize(c.first_name), sanitize(c.last_name)].filter(Boolean).join(' '),
    sanitize(c.company),
    sanitize(c.job_title),
    sanitize(c.where_met),
    sanitize(c.how_met),
    sanitize(c.topics),
    sanitize(c.original_notes),
    sanitize(c.ooth_notes),
  ];
  while (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts.join('|');
}

async function getFriendContext(userId: string) {
  const { data: friendships } = await supabaseAdmin
    .from('friendships')
    .select('friend_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  const friendIds = (friendships || []).map((f) => f.friend_id);

  let friendProfileMap = new Map<string, { username: string; full_name: string | null }>();
  if (friendIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name')
      .in('id', friendIds);
    friendProfileMap = new Map(
      (profiles || []).map((p) => [p.id, { username: p.username, full_name: p.full_name }])
    );
  }

  return { friendIds, friendProfileMap };
}

// ---------------------------------------------------------------------------
// Layer 1 — Structured Database Search
// ---------------------------------------------------------------------------

async function layer1Search(
  query: string,
  userIds: string[]
): Promise<ScoredCandidate[]> {
  const candidates: ScoredCandidate[] = [];
  const seen = new Set<string>();

  // 1a. Look up company aliases
  const { data: aliases } = await supabaseAdmin
    .from('company_aliases')
    .select('alias, canonical_name');

  const queryLower = query.toLowerCase();
  const queryWords = new Set(queryLower.split(/\s+/));
  const canonicalNames: string[] = [];
  if (aliases) {
    for (const a of aliases) {
      const aliasLower = a.alias.toLowerCase();
      const canonicalLower = a.canonical_name.toLowerCase();
      // Use word-boundary matching to avoid false positives with short aliases
      const aliasRegex = new RegExp(`\\b${aliasLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (queryWords.has(aliasLower) || aliasRegex.test(queryLower)) {
        canonicalNames.push(a.canonical_name);
      }
      const canonicalRegex = new RegExp(`\\b${canonicalLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (queryWords.has(canonicalLower) || canonicalRegex.test(queryLower)) {
        canonicalNames.push(a.alias);
      }
    }
  }

  // 1b. Full text search using tsvector
  const ftsPromise = supabaseAdmin.rpc('search_contacts_fts', {
    search_query: query,
    user_ids: userIds,
    result_limit: 50,
  });

  // 1c. Fuzzy company match
  const fuzzyPromise = supabaseAdmin.rpc('search_contacts_fuzzy_company', {
    company_term: query,
    user_ids: userIds,
    similarity_threshold: 0.3,
    result_limit: 50,
  });

  // 1d. Canonical name ILIKE search (if alias found)
  const aliasPromises = canonicalNames.map((name) =>
    supabaseAdmin
      .from('contacts')
      .select('id')
      .in('user_id', userIds)
      .ilike('company', `%${name}%`)
      .limit(50)
  );

  // Run all in parallel
  const [ftsResult, fuzzyResult, ...aliasResults] = await Promise.all([
    ftsPromise,
    fuzzyPromise,
    ...aliasPromises,
  ]);

  // Process FTS results
  if (ftsResult.data) {
    for (const row of ftsResult.data) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push({
          id: row.id,
          score: Math.min((row.rank as number) * 2, 1.0),
          source: 'fts',
        });
      }
    }
  }

  // Process fuzzy company results
  if (fuzzyResult.data) {
    for (const row of fuzzyResult.data) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push({
          id: row.id,
          score: 0.7 * (row.sim as number),
          source: 'fuzzy',
        });
      } else {
        const existing = candidates.find((c) => c.id === row.id);
        if (existing) {
          existing.score = Math.min(existing.score + 0.3 * (row.sim as number), 1.0);
        }
      }
    }
  }

  // Process alias/canonical results (exact match = 1.0)
  for (const aliasResult of aliasResults) {
    if (aliasResult.data) {
      for (const row of aliasResult.data) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          candidates.push({ id: row.id, score: 1.0, source: 'alias' });
        } else {
          const existing = candidates.find((c) => c.id === row.id);
          if (existing) existing.score = 1.0;
        }
      }
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Layer 2 — Vector Semantic Search
// ---------------------------------------------------------------------------

async function layer2Search(
  query: string,
  userIds: string[]
): Promise<ScoredCandidate[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc('match_contacts_by_user', {
      query_embedding: queryEmbedding,
      match_count: 50,
      user_ids: userIds,
    });

    if (error || !data) {
      console.error('Layer 2 semantic search error:', error);
      return [];
    }

    return data.map((row: { id: string; similarity: number }) => ({
      id: row.id,
      score: 0.6 * row.similarity,
      source: 'semantic' as const,
    }));
  } catch (err) {
    console.error('Layer 2 embedding generation error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Merge & Score
// ---------------------------------------------------------------------------

function mergeAndScore(
  layer1: ScoredCandidate[],
  layer2: ScoredCandidate[]
): { id: string; combinedScore: number }[] {
  const scoreMap = new Map<string, number>();

  for (const c of layer1) {
    scoreMap.set(c.id, (scoreMap.get(c.id) || 0) + c.score);
  }

  for (const c of layer2) {
    scoreMap.set(c.id, (scoreMap.get(c.id) || 0) + c.score);
  }

  const merged = Array.from(scoreMap.entries())
    .map(([id, combinedScore]) => ({ id, combinedScore }))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 100);

  return merged;
}

// ---------------------------------------------------------------------------
// Layer 3 — Claude AI Ranking
// ---------------------------------------------------------------------------

function buildClaudePrompt(
  query: string,
  contacts: FullContact[]
): { system: string; userMsg: string } {
  const compressedLines = contacts.map((c) => compressContact(c));

  const system = `You are a precise personal network search assistant. Your ONLY job is to rank and explain the pre-filtered contacts provided to you. You must NOT add contacts not in this list. You must NOT hallucinate connections. You must NOT infer that someone is relevant because they work in a related industry — only return contacts with explicit data matches to the query.`;

  const userMsg = `The user searched for: '${query}'

Here are pre-filtered contacts that have already passed structured and semantic search filters. Each line is:
id|name|company|title|where_met|how_met|topics|original_notes|ooth_notes

${compressedLines.join('\n')}

Return ONLY the contacts that genuinely match this query.
Rank them by relevance.
For each match, cite the specific field that matched (e.g. 'Company field shows Andreessen Horowitz').
Do not include contacts where the match is speculative or inferred.
If fewer than 5 contacts genuinely match, return only those — do not pad results.

Return JSON only:
[{"id": "contact_id", "reasoning": "Specific field match explanation"}]`;

  return { system, userMsg };
}

// ---------------------------------------------------------------------------
// POST /api/search — SSE Streaming Response
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { query, includeNetwork } = await request.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get friend context if searching network
    const { friendIds, friendProfileMap } = includeNetwork
      ? await getFriendContext(user.id)
      : { friendIds: [] as string[], friendProfileMap: new Map<string, { username: string; full_name: string | null }>() };

    const searchUserIds = includeNetwork ? [user.id, ...friendIds] : [user.id];

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Run Layer 1 and Layer 2 in parallel
          const [layer1Results, layer2Results] = await Promise.all([
            layer1Search(query, searchUserIds),
            layer2Search(query, searchUserIds),
          ]);

          // Merge and score
          const merged = mergeAndScore(layer1Results, layer2Results);

          if (merged.length === 0) {
            controller.enqueue(
              encoder.encode(`event: done\ndata: ${JSON.stringify({ total: 0 })}\n\n`)
            );
            controller.close();
            return;
          }

          // Fetch full contact details for top candidates
          const candidateIds = merged.map((m) => m.id);
          const { data: fullContacts } = await supabaseAdmin
            .from('contacts')
            .select('id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, user_id')
            .in('id', candidateIds)
            .in('user_id', searchUserIds);

          if (!fullContacts || fullContacts.length === 0) {
            controller.enqueue(
              encoder.encode(`event: done\ndata: ${JSON.stringify({ total: 0 })}\n\n`)
            );
            controller.close();
            return;
          }

          const contactMap = new Map(fullContacts.map((c) => [c.id, c]));

          // Simple query optimization: if Layer 1 has high-confidence
          // matches (score >= 1.0), stream those immediately
          const highConfidence = merged.filter((m) => m.combinedScore >= 1.0);
          const isSimpleQuery = highConfidence.length > 0 && highConfidence.length <= 10;
          const earlyStreamedIds = new Set<string>();

          if (isSimpleQuery) {
            for (const item of highConfidence) {
              const contact = contactMap.get(item.id);
              if (!contact) continue;

              const isOwn = contact.user_id === user.id;
              const friendProfile = !isOwn ? friendProfileMap.get(contact.user_id) : null;

              const result = {
                ...contact,
                reasoning: 'Searching for more details...',
                degree: isOwn ? 1 : 2,
                via_friend: friendProfile?.full_name || friendProfile?.username || null,
                via_friend_username: friendProfile?.username || null,
              };

              controller.enqueue(
                encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`)
              );
              earlyStreamedIds.add(item.id);
            }
          }

          // Build Claude prompt with top candidates
          const claudeContacts = merged
            .map((m) => contactMap.get(m.id))
            .filter((c): c is FullContact => c != null);

          const { system, userMsg } = buildClaudePrompt(query, claudeContacts);

          // Stream Claude response
          let fullResponse = '';
          const claudeStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: userMsg }],
          });

          for await (const event of claudeStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullResponse += event.delta.text;
            }
          }

          // Parse Claude's response — extract the JSON array even if
          // Claude appended explanatory text after it (e.g. "[] \n\nThe query...")
          let claudeResults: { id: string; reasoning: string }[] = [];
          let claudeParseFailed = false;
          try {
            const cleanedText = fullResponse
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim();
            claudeResults = JSON.parse(cleanedText);
            if (!Array.isArray(claudeResults)) {
              claudeResults = [];
              claudeParseFailed = true;
            }
          } catch {
            // Claude may return JSON followed by explanatory text — try
            // to extract the leading JSON array with a bracket-matching scan.
            const trimmed = fullResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const start = trimmed.indexOf('[');
            if (start !== -1) {
              let depth = 0;
              let end = -1;
              for (let i = start; i < trimmed.length; i++) {
                if (trimmed[i] === '[') depth++;
                else if (trimmed[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
              }
              if (end !== -1) {
                try {
                  claudeResults = JSON.parse(trimmed.slice(start, end + 1));
                  if (!Array.isArray(claudeResults)) {
                    claudeResults = [];
                    claudeParseFailed = true;
                  }
                } catch {
                  claudeResults = [];
                  claudeParseFailed = true;
                }
              } else {
                claudeParseFailed = true;
              }
            } else {
              claudeParseFailed = true;
            }
            if (claudeParseFailed) {
              console.error('Failed to parse Claude response:', fullResponse.slice(0, 500));
            }
          }

          // Stream Claude-ranked results
          let totalStreamed = earlyStreamedIds.size;
          const claudeIncludedIds = new Set(claudeResults.map((r) => r.id));
          for (const result of claudeResults) {
            const contact = contactMap.get(result.id);
            if (!contact) continue;

            const isOwn = contact.user_id === user.id;
            const friendProfile = !isOwn ? friendProfileMap.get(contact.user_id) : null;

            if (earlyStreamedIds.has(result.id)) {
              // Update reasoning for already-streamed result
              controller.enqueue(
                encoder.encode(`event: update\ndata: ${JSON.stringify({ id: result.id, reasoning: result.reasoning })}\n\n`)
              );
            } else {
              const rankedContact = {
                ...contact,
                reasoning: result.reasoning,
                degree: isOwn ? 1 : 2,
                via_friend: friendProfile?.full_name || friendProfile?.username || null,
                via_friend_username: friendProfile?.username || null,
              };

              controller.enqueue(
                encoder.encode(`event: result\ndata: ${JSON.stringify(rankedContact)}\n\n`)
              );
              totalStreamed++;
            }
          }

          // Update reasoning for early-streamed contacts that Claude didn't include
          for (const earlyId of Array.from(earlyStreamedIds)) {
            if (!claudeIncludedIds.has(earlyId)) {
              controller.enqueue(
                encoder.encode(`event: update\ndata: ${JSON.stringify({ id: earlyId, reasoning: 'Matched via structured search' })}\n\n`)
              );
            }
          }

          // Only fall back to pre-filtered results if Claude's response
          // failed to parse. If Claude successfully returned [] it means
          // it evaluated candidates and found none relevant — respect that.
          if (claudeParseFailed && merged.length > 0) {
            for (const item of merged.slice(0, 20)) {
              if (earlyStreamedIds.has(item.id)) continue;
              const contact = contactMap.get(item.id);
              if (!contact) continue;

              const isOwn = contact.user_id === user.id;
              const friendProfile = !isOwn ? friendProfileMap.get(contact.user_id) : null;

              const rankedContact = {
                ...contact,
                reasoning: 'Matched via structured search',
                degree: isOwn ? 1 : 2,
                via_friend: friendProfile?.full_name || friendProfile?.username || null,
                via_friend_username: friendProfile?.username || null,
              };

              controller.enqueue(
                encoder.encode(`event: result\ndata: ${JSON.stringify(rankedContact)}\n\n`)
              );
              totalStreamed++;
            }
          }

          controller.enqueue(
            encoder.encode(`event: done\ndata: ${JSON.stringify({ total: totalStreamed })}\n\n`)
          );
          controller.close();
        } catch (err) {
          console.error('Search stream error:', err);
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Search failed' })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Search failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
