import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 60;

// Token estimation: ~4 chars per token, 2000 token buffer for prompt
const CHARS_PER_TOKEN = 4;
const MAX_TOKENS = 180000;
const PROMPT_BUFFER_TOKENS = 2000;
const MAX_CONTACT_CHARS = (MAX_TOKENS - PROMPT_BUFFER_TOKENS) * CHARS_PER_TOKEN;

/**
 * Compress a contact into a tight single-line string.
 * Format: id|name|company|title|where_met|topics|notes
 * Empty fields are omitted entirely (no trailing pipes).
 */
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
  const sanitize = (s: string | null) => s?.replace(/[\n\r|]/g, ' ').trim() || '';
  const parts = [
    c.id,
    [sanitize(c.first_name), sanitize(c.last_name)].filter(Boolean).join(' '),
    sanitize(c.company),
    sanitize(c.job_title),
    sanitize(c.where_met),
    sanitize(c.topics),
    sanitize(c.ooth_notes),
  ];
  // Remove trailing empty fields
  while (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts.join('|');
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

    // Load all contacts (lightweight fields only) for compression
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

    // Build compressed contact list
    const compressedLines = allContacts.map((c) => compressContact(c));
    const fullCompressedList = compressedLines.join('\n');

    // Check if we need to truncate
    let compressedList = fullCompressedList;
    let truncated = false;
    let includedCount = allContacts.length;

    if (fullCompressedList.length > MAX_CONTACT_CHARS) {
      // Truncate to fit within token limit
      truncated = true;
      let charCount = 0;
      includedCount = 0;
      for (const line of compressedLines) {
        if (charCount + line.length + 1 > MAX_CONTACT_CHARS) break;
        charCount += line.length + 1; // +1 for newline
        includedCount++;
      }
      compressedList = compressedLines.slice(0, includedCount).join('\n');
    }

    // Build owner map for contacts we're searching
    const contactOwnerMap = new Map<string, string>();
    for (const c of allContacts) {
      contactOwnerMap.set(c.id, c.user_id);
    }

    // Send entire compressed list to Claude
    const claudePrompt = `You are a strict personal network search assistant. The user is searching their contacts for: '${query}'.

Here is their ${truncated ? 'partial' : 'complete'} contact list in compressed format (id|name|company|title|where_met|topics|notes):
${compressedList}

IMPORTANT RULES:
- ONLY return contacts whose actual data fields (name, company, title, where_met, topics, notes) directly match the search query.
- For company searches (e.g. "people at X"), only return contacts whose company field contains that company name or a known alias (e.g. "a16z" = "Andreessen Horowitz").
- Do NOT infer, guess, or speculate about connections. If the data doesn't explicitly mention it, don't include the contact.
- Do NOT include contacts who merely work in the same industry, at similar companies, or who might theoretically know someone at the target company.
- When in doubt, leave the contact OUT. Precision matters more than recall.
- If no contacts match, return an empty array [].

Return a JSON array of matching contact IDs ranked by relevance.
Format: [{"id": "uuid", "reasoning": "explanation citing the specific field that matched"}]
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
      if (!Array.isArray(rankedResults)) {
        console.error('Claude response is not an array:', typeof rankedResults);
        return NextResponse.json({ results: [], mode: 'ai' });
      }
    } catch {
      console.error('Failed to parse Claude response:', responseText);
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    // Fetch full contact details for matched IDs with authorization filter
    const matchedIds = rankedResults.map((r) => r.id);
    if (matchedIds.length === 0) {
      return NextResponse.json({ results: [], mode: 'ai' });
    }

    const { data: fullContacts } = await supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, user_id')
      .in('id', matchedIds)
      .in('user_id', searchUserIds);

    const contactMap = new Map(
      (fullContacts || []).map((c) => [c.id, c])
    );

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

    const response: { results: typeof results; mode: string; warning?: string } = {
      results,
      mode: 'ai',
    };

    if (truncated) {
      response.warning = `Note: your full network exceeds the search limit. Showing results from your first ${includedCount.toLocaleString()} contacts only.`;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
