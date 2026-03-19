import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import { parseCSV } from '@/lib/csvParser';
import { generateEmbeddingsForContacts } from '@/lib/embeddings';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvText = await file.text();
    const { contacts, source, skipped } = parseCSV(csvText);

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'No valid contacts found in CSV' },
        { status: 400 }
      );
    }

    // Get existing emails to skip duplicates (for this user only)
    const emails = contacts
      .map((c) => c.email)
      .filter((e): e is string => e !== null && e !== '');

    let existingEmails = new Set<string>();
    if (emails.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('email')
        .eq('user_id', user.id)
        .in('email', emails);

      existingEmails = new Set(
        (existing || []).map((e: { email: string }) => e.email)
      );
    }

    // Filter out duplicates
    const newContacts = contacts.filter(
      (c) => !c.email || !existingEmails.has(c.email)
    );
    const duplicateCount = contacts.length - newContacts.length;

    // Attach user_id to each contact
    const contactsWithUser = newContacts.map((c) => ({
      ...c,
      user_id: user.id,
    }));

    // Batch insert in chunks of 500, collecting inserted contacts for embedding generation
    const chunkSize = 500;
    let imported = 0;
    const allInserted: { id: string; first_name: string | null; last_name: string | null; company: string | null; job_title: string | null; where_met: string | null; how_met: string | null; topics: string | null; ooth_notes: string | null; original_notes: string | null }[] = [];

    for (let i = 0; i < contactsWithUser.length; i += chunkSize) {
      const chunk = contactsWithUser.slice(i, i + chunkSize);
      const { data: insertedChunk, error } = await supabaseAdmin
        .from('contacts')
        .insert(chunk)
        .select('id, first_name, last_name, company, job_title, where_met, how_met, topics, ooth_notes, original_notes');

      if (error) {
        console.error('Insert error:', error);
        return NextResponse.json(
          { error: `Failed to insert contacts: ${error.message}` },
          { status: 500 }
        );
      }

      imported += chunk.length;
      if (insertedChunk) {
        allInserted.push(...insertedChunk);
      }
    }

    // Generate embeddings in background (fire-and-forget, don't block the response)
    if (allInserted.length > 0) {
      generateEmbeddingsForContacts(allInserted).catch((err) =>
        console.error('Background embedding generation failed:', err)
      );
    }

    return NextResponse.json({
      imported,
      skipped: skipped + duplicateCount,
      source,
      total: contacts.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to process CSV file' },
      { status: 500 }
    );
  }
}
