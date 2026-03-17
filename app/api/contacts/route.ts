import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE() {
  try {
    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('contacts')
      .select('id, first_name, last_name, email, phone, company, job_title, source, created_at', {
        count: 'exact',
      });

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

    return NextResponse.json({
      contacts: data || [],
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
