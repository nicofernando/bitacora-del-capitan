import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Hash token with SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Look up token in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokenRecord, error: tokenError } = await supabase
      .from('api_tokens')
      .select('user_id')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenError || !tokenRecord) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const userId = tokenRecord.user_id;

    // Update last_used_at
    await supabase
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash);

    // Parse query params
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'segments';

    switch (action) {
      case 'segments': {
        const category = url.searchParams.get('category');
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const limit = parseInt(url.searchParams.get('limit') || '50');

        let query = supabase
          .from('segments')
          .select('*')
          .eq('user_id', userId)
          .order('entry_date', { ascending: false })
          .limit(limit);

        if (category) query = query.eq('category_slug', category);
        if (from) query = query.gte('entry_date', from);
        if (to) query = query.lte('entry_date', to);

        const { data, error } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ action: 'segments', count: data.length, data });
      }

      case 'goals': {
        const { data: goals } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);

        const goalsWithStreaks = await Promise.all(
          (goals || []).map(async (goal: any) => {
            const { data: streak } = await supabase.rpc('get_goal_streak', {
              p_goal_id: goal.id,
            });
            return { ...goal, streak: streak ?? 0 };
          }),
        );

        return jsonResponse({ action: 'goals', data: goalsWithStreaks });
      }

      case 'summary': {
        const days = parseInt(url.searchParams.get('days') || '30');
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);

        const { data: segments } = await supabase
          .from('segments')
          .select('category_slug, sentiment')
          .eq('user_id', userId)
          .gte('entry_date', fromDate.toISOString().split('T')[0]);

        // Build summary
        const summary: Record<string, { count: number; sentiments: Record<string, number> }> = {};
        for (const seg of segments || []) {
          if (!summary[seg.category_slug]) {
            summary[seg.category_slug] = { count: 0, sentiments: {} };
          }
          summary[seg.category_slug].count++;
          if (seg.sentiment) {
            summary[seg.category_slug].sentiments[seg.sentiment] =
              (summary[seg.category_slug].sentiments[seg.sentiment] || 0) + 1;
          }
        }

        return jsonResponse({ action: 'summary', days, data: summary });
      }

      case 'export': {
        const { data: entries } = await supabase
          .from('raw_entries')
          .select('*, segments(*)')
          .eq('user_id', userId)
          .order('device_datetime', { ascending: false });

        return jsonResponse({ action: 'export', count: entries?.length || 0, data: entries });
      }

      default:
        return jsonResponse(
          { error: `Unknown action: ${action}. Valid: segments, goals, summary, export` },
          400,
        );
    }
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
