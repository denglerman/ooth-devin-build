import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { count: total, error: totalError } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true });

    if (totalError) {
      return NextResponse.json({ error: totalError.message }, { status: 500 });
    }

    const { count: unembedded, error: unembeddedError } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    if (unembeddedError) {
      return NextResponse.json({ error: unembeddedError.message }, { status: 500 });
    }

    // Also count contacts WITH embeddings directly for cross-check
    const { count: withEmbedding, error: withError } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    const embedded = withEmbedding ?? ((total || 0) - (unembedded || 0));

    const response = NextResponse.json({
      total: total || 0,
      embedded: embedded || 0,
      ready: (total || 0) > 0 && embedded === total,
      debug: { unembedded, withEmbedding, withError: withError?.message },
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('Embedding status error:', error);
    return NextResponse.json(
      { error: 'Failed to get embedding status' },
      { status: 500 }
    );
  }
}
