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

    // Use .not('embedding', 'is', null) — .is('embedding', null) is unreliable for vector columns
    const { count: embedded, error: embeddedError } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embeddedError) {
      return NextResponse.json({ error: embeddedError.message }, { status: 500 });
    }

    const response = NextResponse.json({
      total: total || 0,
      embedded: embedded || 0,
      ready: (total || 0) > 0 && embedded === total,
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
