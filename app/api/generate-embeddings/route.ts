import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { contactToText, generateEmbeddings } from '@/lib/embeddings';
import { Contact } from '@/lib/supabase';

export const maxDuration = 300;

export async function POST() {
  try {
    // Get contacts without embeddings (process up to 100 per invocation for serverless timeout safety)
    const { data: contacts, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .is('embedding', null)
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ message: 'All contacts have embeddings', processed: 0, done: true });
    }

    const batchSize = 20;
    let processed = 0;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize) as Contact[];
      const texts = batch.map((c) => contactToText(c));

      try {
        const embeddings = await generateEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          const { error: updateError } = await supabaseAdmin
            .from('contacts')
            .update({ embedding: embeddings[j] as unknown as string })
            .eq('id', batch[j].id);

          if (updateError) {
            console.error(`Failed to update embedding for ${batch[j].id}:`, updateError);
          } else {
            processed++;
          }
        }
      } catch (embError) {
        console.error('Embedding batch error:', embError);
      }
    }

    // Check if there are more contacts to process
    const { count: remaining } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .is('embedding', null);

    return NextResponse.json({ processed, total: contacts.length, remaining: remaining || 0, done: (remaining || 0) === 0 });
  } catch (error) {
    console.error('Generate embeddings error:', error);
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
