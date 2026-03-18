import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/friends — list current user's friends
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: friendships, error } = await supabaseAdmin
      .from('friendships')
      .select('id, friend_id, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!friendships || friendships.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    // Fetch profiles for all friends
    const friendIds = friendships.map((f) => f.friend_id);
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name')
      .in('id', friendIds);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, p])
    );

    const friends = friendships.map((f) => {
      const profile = profileMap.get(f.friend_id);
      return {
        id: f.id,
        friend_id: f.friend_id,
        username: profile?.username || 'unknown',
        full_name: profile?.full_name || null,
        created_at: f.created_at,
      };
    });

    return NextResponse.json({ friends });
  } catch (error) {
    console.error('Friends list error:', error);
    return NextResponse.json({ error: 'Failed to load friends' }, { status: 500 });
  }
}

// POST /api/friends — add friend by username or email
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username } = await request.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username or email is required' }, { status: 400 });
    }

    const input = username.trim().toLowerCase();
    const isEmail = input.includes('@');

    let profile = null;

    if (isEmail) {
      // Look up by email using DB function (queries auth.users directly, no pagination issues)
      const { data: userId } = await supabaseAdmin.rpc('get_user_id_by_email', { lookup_email: input });
      if (userId) {
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name')
          .eq('id', userId)
          .single();
        profile = data;
      }
    }

    if (!profile) {
      // Fall back to username lookup
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name')
        .eq('username', input)
        .single();
      profile = data;
    }

    if (!profile) {
      return NextResponse.json({ error: 'User not found. Try their username or email.' }, { status: 404 });
    }

    // Can't friend yourself
    if (profile.id === user.id) {
      return NextResponse.json({ error: 'You cannot add yourself as a friend' }, { status: 400 });
    }

    // Check if already friends
    const { data: existing } = await supabaseAdmin
      .from('friendships')
      .select('id')
      .eq('user_id', user.id)
      .eq('friend_id', profile.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Already friends with this user' }, { status: 409 });
    }

    // Create friendship
    const { error: insertError } = await supabaseAdmin
      .from('friendships')
      .insert({
        user_id: user.id,
        friend_id: profile.id,
        status: 'active',
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      friend: {
        friend_id: profile.id,
        username: profile.username,
        full_name: profile.full_name,
      },
    });
  } catch (error) {
    console.error('Add friend error:', error);
    return NextResponse.json({ error: 'Failed to add friend' }, { status: 500 });
  }
}
