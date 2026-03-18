import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';

export async function DELETE() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete all contacts error:', error);
    return NextResponse.json(
      { error: 'Failed to delete all contacts' },
      { status: 500 }
    );
  }
}

// Helper to get friend IDs for the current user
async function getFriendIds(userId: string): Promise<string[]> {
  const { data: friendships } = await supabaseAdmin
    .from('friendships')
    .select('friend_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  return (friendships || []).map((f) => f.friend_id);
}

// Helper to get friend profiles mapped by user ID
async function getFriendProfiles(friendIds: string[]): Promise<Map<string, { username: string; full_name: string | null }>> {
  if (friendIds.length === 0) return new Map();
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name')
    .in('id', friendIds);
  return new Map((profiles || []).map((p) => [p.id, { username: p.username, full_name: p.full_name }]));
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const filter = searchParams.get('filter') || 'mine'; // mine | all | friends
    const offset = (page - 1) * limit;

    if (filter === 'mine') {
      // Original behavior: only user's own contacts (1st degree)
      let query = supabaseAdmin
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company, job_title, source, created_at, user_id', {
          count: 'exact',
        })
        .eq('user_id', user.id);

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,job_title.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const contacts = (data || []).map((c) => ({
        ...c,
        degree: 1 as number,
        via_friend: null as string | null,
        via_friend_username: null as string | null,
      }));

      return NextResponse.json({
        contacts,
        total: count || 0,
        page,
        limit,
      });
    }

    // For 'all' or 'friends' filter, we need to fetch friends' contacts too
    const friendIds = await getFriendIds(user.id);
    const friendProfiles = await getFriendProfiles(friendIds);

    if (filter === 'friends') {
      // Only friends' contacts (2nd degree)
      if (friendIds.length === 0) {
        return NextResponse.json({ contacts: [], total: 0, page, limit });
      }

      let query = supabaseAdmin
        .from('contacts')
        .select('id, first_name, last_name, email, phone, company, job_title, source, created_at, user_id', {
          count: 'exact',
        })
        .in('user_id', friendIds);

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,job_title.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const contacts = (data || []).map((c) => {
        const friendProfile = friendProfiles.get(c.user_id);
        return {
          ...c,
          degree: 2 as number,
          via_friend: friendProfile?.full_name || friendProfile?.username || null,
          via_friend_username: friendProfile?.username || null,
        };
      });

      return NextResponse.json({
        contacts,
        total: count || 0,
        page,
        limit,
      });
    }

    // filter === 'all': combine user's contacts + friends' contacts
    const allUserIds = [user.id, ...friendIds];

    let query = supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, email, phone, company, job_title, source, created_at, user_id', {
        count: 'exact',
      })
      .in('user_id', allUserIds);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%,job_title.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const contacts = (data || []).map((c) => {
      const isOwn = c.user_id === user.id;
      const friendProfile = !isOwn ? friendProfiles.get(c.user_id) : null;
      return {
        ...c,
        degree: isOwn ? 1 : 2,
        via_friend: friendProfile?.full_name || friendProfile?.username || null,
        via_friend_username: friendProfile?.username || null,
      };
    });

    return NextResponse.json({
      contacts,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Contacts list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
