import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';
import { contactToText, generateEmbedding } from '@/lib/embeddings';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, created_at'
      )
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Contact fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contact' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'first_name',
      'last_name',
      'email',
      'phone',
      'company',
      'job_title',
      'where_met',
      'when_met',
      'how_met',
      'topics',
      'relationship_strength',
      'ooth_notes',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select(
        'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, created_at'
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Regenerate embedding for this contact in background
    try {
      const text = contactToText(data);
      const embedding = await generateEmbedding(text);
      await supabaseAdmin
        .from('contacts')
        .update({ embedding: embedding as unknown as string })
        .eq('id', params.id);
    } catch (embError) {
      console.error('Failed to regenerate embedding:', embError);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Contact update error:', error);
    return NextResponse.json(
      { error: 'Failed to update contact' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    );
  }
}
