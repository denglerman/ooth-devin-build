import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getAuthUser } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/profiles/search?username=x — find user by username
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = request.nextUrl.searchParams.get('username');

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile search error:', error);
    return NextResponse.json({ error: 'Failed to search profiles' }, { status: 500 });
  }
}
