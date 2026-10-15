type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000')
    .replace(/\/+$/, '');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendEmail(input: SendEmailInput): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Email delivery is not configured.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text
    }),
    cache: 'no-store'
  });

  const result = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !result?.id) {
    throw new Error(result?.message || result?.error?.message || `Resend returned ${response.status}`);
  }
  return result.id;
}

export function emailFrame(content: string, unsubscribeUrl?: string): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f6f5;color:#1f2925;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px">
    <div style="font-size:18px;font-weight:700;margin-bottom:22px">PriceTracker</div>
    <div style="background:#ffffff;border:1px solid #dfe5e1;border-radius:16px;padding:26px">
      ${content}
    </div>
    <p style="margin:18px 4px 0;color:#68736e;font-size:12px;line-height:1.6">
      Sent by PriceTracker because you enabled this notification.
      ${unsubscribeUrl ? `<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#356b55">Unsubscribe without signing in</a>` : ''}
    </p>
  </div>
</body>
</html>`;
}
