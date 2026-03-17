import { NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import { contactToText, generateEmbeddings } from '@/lib/embeddings';
import { Contact } from '@/lib/supabase';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get contacts without embeddings for this user — process 50 per call
    const { data: contacts, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .is('embedding', null)
      .limit(50);

    if (error) {
      console.error('Fetch contacts error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ processed: 0, done: true });
    }

    let processed = 0;
    const batch = contacts as Contact[];
    const texts = batch.map((c) => contactToText(c));

    try {
      const embeddings = await generateEmbeddings(texts);

      // Update all contacts in parallel for speed
      const updatePromises = batch.map((contact, j) =>
        supabaseAdmin
          .from('contacts')
          .update({ embedding: embeddings[j] as unknown as string })
          .eq('id', contact.id)
      );

      const results = await Promise.all(updatePromises);
      processed = results.filter((r) => !r.error).length;

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        console.error('Some embedding updates failed:', errors.map((r) => r.error));
      }
    } catch (embError) {
      console.error('Embedding generation error:', embError);
      return NextResponse.json({ error: 'Embedding generation failed', processed }, { status: 500 });
    }

    // Check remaining
    const { count: remaining } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    return NextResponse.json({
      processed,
      remaining: remaining || 0,
      done: (remaining || 0) === 0,
    });
  } catch (error) {
    console.error('Generate embeddings error:', error);
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
