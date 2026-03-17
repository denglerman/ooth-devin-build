import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { contactToText, generateEmbeddings } from '@/lib/embeddings';
import { Contact } from '@/lib/supabase';

export const maxDuration = 300;

export async function POST() {
  try {
    // Get contacts without embeddings
    const { data: contacts, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .is('embedding', null)
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ message: 'All contacts have embeddings', processed: 0 });
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

    return NextResponse.json({ processed, total: contacts.length });
  } catch (error) {
    console.error('Generate embeddings error:', error);
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
