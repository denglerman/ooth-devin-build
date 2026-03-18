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

    // First try to find as user's own contact (1st degree)
    const { data: ownContact } = await supabaseAdmin
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, created_at, user_id'
      )
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (ownContact) {
      return NextResponse.json({ ...ownContact, degree: 1, via_friend: null, via_friend_username: null, read_only: false });
    }

    // Check if it belongs to a friend (2nd degree)
    const { data: friendships } = await supabaseAdmin
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const friendIds = (friendships || []).map((f) => f.friend_id);

    if (friendIds.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { data: friendContact } = await supabaseAdmin
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, company, job_title, original_notes, source, where_met, when_met, how_met, topics, relationship_strength, ooth_notes, created_at, user_id'
      )
      .eq('id', params.id)
      .in('user_id', friendIds)
      .single();

    if (!friendContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Get the friend's profile info
    const { data: friendProfile } = await supabaseAdmin
      .from('profiles')
      .select('username, full_name')
      .eq('id', friendContact.user_id)
      .single();

    return NextResponse.json({
      ...friendContact,
      degree: 2,
      via_friend: friendProfile?.full_name || friendProfile?.username || null,
      via_friend_username: friendProfile?.username || null,
      read_only: true,
    });
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
