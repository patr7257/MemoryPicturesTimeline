// Outbound magic-link email over ZeptoMail's HTTPS Email API, dependency-free
// fetch POST (same pattern as PatrickRobelWeb's hub email sender).
//
// WHY THIS SHAPE: outbound SMTP ports are commonly blocked on managed hosts,
// so SMTP transports time out in production. A plain fetch POST to ZeptoMail
// goes over HTTPS, which is never blocked. Raw token in env, the code adds the
// "Zoho-enczapikey " prefix, EU data center by default.
//
// Env:
//   ZEPTOMAIL_TOKEN     - the "Send Mail" token, stored RAW
//   ZEPTOMAIL_FROM      - verified-domain From address
//   ZEPTOMAIL_BASE_URL  - API base, default https://api.zeptomail.eu/v1.1
//
// Returns false when unconfigured or on any failure, so the caller can respond
// generically without leaking whether the mail actually went out.

const DEFAULT_BASE_URL = "https://api.zeptomail.eu/v1.1";
const FROM_NAME = "Family Memories";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<boolean> {
  const token = process.env.ZEPTOMAIL_TOKEN;
  const from = process.env.ZEPTOMAIL_FROM;
  if (!token || !from) {
    console.warn("email: ZEPTOMAIL_TOKEN or ZEPTOMAIL_FROM not set, skipping send");
    return false;
  }
  const baseUrl = process.env.ZEPTOMAIL_BASE_URL || DEFAULT_BASE_URL;

  const text = `Open this link to sign in to Family Memories:\n\n${url}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html><html><body style="margin:0;background:#f5efe3;padding:32px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fffdf8;border:1px solid #e7dcc8;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:28px 32px;">
        <p style="margin:0 0 4px;color:#b3562e;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Family Memories</p>
        <h1 style="margin:0 0 16px;color:#4a3b2c;font-size:20px;font-weight:600;">Your sign-in link</h1>
        <p style="margin:0 0 20px;color:#6b5b46;font-size:14px;line-height:1.6;">Click the button below to sign in. No password needed.</p>
        <div style="margin:0 0 20px;text-align:center;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;background:#b3562e;color:#fffdf8;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Open Memories</a>
        </div>
        <p style="margin:0;color:#8d7c63;font-size:13px;line-height:1.6;">The link expires in 10 minutes. If you did not request this, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    const res = await fetch(`${baseUrl}/email`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { address: from, name: FROM_NAME },
        to: [{ email_address: { address: to } }],
        subject: "Your Family Memories sign-in link",
        htmlbody: html,
        textbody: text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("email: ZeptoMail send failed:", res.status, detail);
      return false;
    }
    return true;
  } catch (err) {
    console.error("email: ZeptoMail send error:", err);
    return false;
  }
}
