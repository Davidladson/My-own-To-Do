/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  const { task_text, reminder_time, user_email } = await req.json();

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Malveon Tasks <reminders@malveon.com>',
      to: [user_email],
      subject: `Reminder: ${task_text.substring(0, 30)}...`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Task Reminder</h2>
          <p>This is a fallback email notification for your task:</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>${task_text}</strong>
          </div>
          <p>Scheduled for: <strong>${reminder_time}</strong></p>
          <hr>
          <p style="font-size: 12px; color: #666;">Malveon Tasks PWA - Resilience Fallback</p>
        </div>
      `,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
});
