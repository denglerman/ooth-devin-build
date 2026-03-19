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

    // Text pre-filter: find contacts where query terms appear in their fields.
    // This catches exact matches that Claude might miss in large lists.
    const STOP_WORDS = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was',
      'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see',
      'way', 'who', 'did', 'get', 'let', 'say', 'she', 'too', 'use', 'any', 'each',
      'people', 'person', 'that', 'this', 'with', 'have', 'from', 'they', 'been', 'said',
      'will', 'find', 'work', 'here', 'know', 'take', 'want', 'does', 'make', 'like',
      'just', 'over', 'such', 'than', 'them', 'very', 'some', 'what', 'about', 'which',
      'when', 'where', 'their', 'there', 'would', 'could', 'should', 'those', 'these',
      'working', 'works', 'worked',
    ]);
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2 && !STOP_WORDS.has(t));
    const textMatchIds = new Set<string>();
    const textMatchReasons = new Map<string, string>();
    for (const contact of allContacts) {
      const fields = [
        { name: 'name', value: [contact.first_name, contact.last_name].filter(Boolean).join(' ') },
        { name: 'company', value: contact.company },
        { name: 'job title', value: contact.job_title },
        { name: 'where met', value: contact.where_met },
        { name: 'topics', value: contact.topics },
        { name: 'notes', value: contact.ooth_notes },
      ];
      for (const field of fields) {
        if (!field.value) continue;
        const fieldLower = field.value.toLowerCase();
        // Check if any query term appears in the field
        const matchingTerms = queryTerms.filter((term: string) => new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(fieldLower));
        if (matchingTerms.length > 0) {
          textMatchIds.add(contact.id);
          textMatchReasons.set(contact.id, `Text match: ${field.name} field contains '${field.value}'`);
          break; // One match per contact is enough
        }
      }
    }

    // Send entire compressed list to Claude
    const claudePrompt = `You are a personal network search assistant.
The user is searching for: '${query}'

Here is their ${truncated ? 'partial' : 'complete'} contact list in compressed format (id|name|company|title|where_met|topics|notes):
${compressedList}

RULES:
- Only return contacts where the data EXPLICITLY supports the match
- Base matches on the actual data fields: name, company, job title, where met, topics, notes
- Common abbreviations and alternate names for companies are valid matches (e.g. a16z = Andreessen Horowitz, Google = Alphabet, Meta = Facebook). Use your general knowledge of well-known company aliases to recognize these — but only match on company identity, not industry proximity
- Do NOT return someone because they work in a similar industry or might know someone at the searched company
- Do NOT infer or hallucinate connections that aren't in the data
- For company searches: only match contacts whose company field is that company or a known alias of it
- For role searches: only match contacts whose job title explicitly matches
- For location searches: only match contacts whose where_met field mentions that location
- For topic searches: match contacts whose topics or notes mention that subject
- If no contacts genuinely match, return []

Return format: [{"id": "uuid", "reasoning": "explanation citing the specific data field that matched"}]
Return JSON only. No other text.`;

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
        rankedResults = [];
      }
    } catch {
      console.error('Failed to parse Claude response:', responseText);
      rankedResults = [];
    }

    // Merge Claude results with text pre-filter results (text matches fill gaps Claude missed)
    const claudeIds = new Set(rankedResults.map((r) => r.id));
    const textMatchArray = Array.from(textMatchIds);
    for (let i = 0; i < textMatchArray.length; i++) {
      const textId = textMatchArray[i];
      if (!claudeIds.has(textId)) {
        rankedResults.push({ id: textId, reasoning: textMatchReasons.get(textId) || 'Text match' });
      }
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
      response.warning = `Note: AI search covered your first ${includedCount.toLocaleString()} contacts only. Some additional results may have been found via text matching.`;
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
