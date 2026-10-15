import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';

import { createAdminSupabaseClient } from '@/lib/supabase/admin';

type ResendWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    to?: string[];
  };
};

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const payload = await request.text();
  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': request.headers.get('svix-id') || '',
      'svix-timestamp': request.headers.get('svix-timestamp') || '',
      'svix-signature': request.headers.get('svix-signature') || ''
    }) as unknown as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  const providerMessageId = event.data?.email_id || null;
  const admin = createAdminSupabaseClient();
  let outboxId: string | null = null;
  let userId: string | null = null;
  if (providerMessageId) {
    const { data: outbox } = await admin
      .from('email_outbox')
      .select('id, user_id')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle();
    outboxId = outbox?.id || null;
    userId = outbox?.user_id || null;
  }

  await admin.from('email_delivery_events').insert({
    outbox_id: outboxId,
    provider_message_id: providerMessageId,
    event_type: event.type,
    provider_payload: event
  });

  if (outboxId && ['email.bounced', 'email.complained'].includes(event.type)) {
    await admin
      .from('email_outbox')
      .update({ status: 'failed', last_error: event.type })
      .eq('id', outboxId);
  }
  if (userId && event.type === 'email.bounced') {
    await admin
      .from('notification_preferences')
      .update({ target_price_email: false })
      .eq('user_id', userId);
  }
  if (userId && event.type === 'email.complained') {
    await admin
      .from('notification_preferences')
      .update({
        target_price_email: false,
        popular_deals_email: false,
        personalised_recommendations_email: false
      })
      .eq('user_id', userId);
  }

  return NextResponse.json({ received: true });
}
