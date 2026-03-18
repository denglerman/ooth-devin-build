import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/profiles/search?username=x — find user by username or email
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = request.nextUrl.searchParams.get('username');

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username or email is required' }, { status: 400 });
    }

    const input = username.trim().toLowerCase();
    const isEmail = input.includes('@');

    let profile = null;

    if (isEmail) {
      // Look up by email in auth.users, then get their profile
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authData?.users?.find((u) => u.email?.toLowerCase() === input);
      if (authUser) {
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name')
          .eq('id', authUser.id)
          .single();
        profile = data;
      }
    }

    if (!profile) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, username, full_name')
        .eq('username', input)
        .single();
      profile = data;
    }

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile search error:', error);
    return NextResponse.json({ error: 'Failed to search profiles' }, { status: 500 });
  }
}
