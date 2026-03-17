import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    const embedded = (total || 0) - (unembedded || 0);

    return NextResponse.json({
      total: total || 0,
      embedded: embedded || 0,
      ready: (total || 0) > 0 && total === embedded,
    });
  } catch (error) {
    console.error('Embedding status error:', error);
    return NextResponse.json(
      { error: 'Failed to get embedding status' },
      { status: 500 }
    );
  }
}
