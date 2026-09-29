// src/shared/services/email-templates.ts
//
// HTML + plain-text bodies for every transactional email. Pure functions: no I/O, no
// config — EmailService passes in the site URL — so they can be unit-tested and rendered
// to a file for preview without an SMTP server.
//
// EMAIL HTML IS NOT WEB HTML. Gmail strips <style> in some views, Outlook renders with
// Word's engine, and most clients ignore flexbox, grid and CSS variables. So: tables for
// layout, every style inline, a 600px fixed-width card, and nothing that only works in
// a browser. The logo is an <img> with alt text, because many clients block images by
// default — the wordmark beside it still carries the brand when they do.
//
// ESCAPE EVERYTHING THAT IS NOT OURS. Company names, an admin's question and a rejection
// reason are user-supplied. Interpolated raw, "A&B <Holdings>" breaks the markup and a
// crafted name injects links into mail that arrives under our name.

export interface MailBody {
  text: string;
  html: string;
}

/** Brand palette — mirrors jobfit-frontend/src/app/globals.css (--color-primary-*). */
const C = {
  primary: '#5A189A', // primary-700
  primaryMid: '#7B2CBF', // primary-600
  tint: '#F8F4FE', // primary-50
  tintBorder: '#EDE0FA', // primary-100
  page: '#F4F1F8',
  card: '#FFFFFF',
  text: '#1F1A2E',
  muted: '#5B5570',
  subtle: '#8A8499',
  rule: '#ECE8F2',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FCA5A5',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

const BRAND = 'JobFit';

/** Escape user-supplied text for HTML element content and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape, then keep the author's line breaks — an admin's question is often a list. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

// ─── Building blocks ─────────────────────────────────────────────────────────────────

function paragraph(html: string): string {
  return `<p style="margin: 0 0 16px; font-family: ${FONT}; font-size: 15px; line-height: 24px; color: ${C.muted};">${html}</p>`;
}

function heading(text: string): string {
  return `<h1 style="margin: 0 0 12px; font-family: ${FONT}; font-size: 22px; line-height: 30px; font-weight: 700; color: ${C.text};">${escapeHtml(text)}</h1>`;
}

/** The one-time code: large, monospaced, spaced so it reads digit by digit. */
function codeBlock(code: string, ttlText: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 24px;">
      <tr>
        <td align="center" style="background: ${C.tint}; border: 1px solid ${C.tintBorder}; border-radius: 12px; padding: 24px 16px;">
          <div style="font-family: ${FONT}; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${C.subtle}; margin-bottom: 10px;">Your code</div>
          <div style="font-family: ${MONO}; font-size: 36px; line-height: 44px; font-weight: 700; letter-spacing: 10px; color: ${C.primary}; padding-left: 10px;">${escapeHtml(code)}</div>
          <div style="font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${C.muted}; margin-top: 10px;">This code expires in ${escapeHtml(ttlText)}.</div>
        </td>
      </tr>
    </table>`;
}

/**
 * A "bulletproof" button: the link is the padded block itself, so it stays clickable
 * in Outlook, which ignores padding on <a>.
 */
function button(url: string, label: string): string {
  const href = escapeHtml(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 20px;">
      <tr>
        <td align="center" bgcolor="${C.primary}" style="border-radius: 10px;">
          <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: ${FONT}; font-size: 15px; line-height: 20px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 10px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 20px; font-family: ${FONT}; font-size: 12px; line-height: 18px; color: ${C.subtle}; word-break: break-all;">Button not working? Paste this link into your browser:<br><a href="${href}" style="color: ${C.primaryMid}; text-decoration: underline;">${href}</a></p>`;
}

/** A quoted block for words that are someone else's — an admin's question or reason. */
function callout(
  labelText: string,
  bodyHtml: string,
  tone: 'brand' | 'danger' = 'brand',
): string {
  const bg = tone === 'danger' ? C.dangerBg : C.tint;
  const bar = tone === 'danger' ? C.dangerBorder : C.primaryMid;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 4px 0 20px;">
      <tr>
        <td style="background: ${bg}; border-left: 4px solid ${bar}; border-radius: 8px; padding: 16px 18px;">
          <div style="font-family: ${FONT}; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${C.subtle}; margin-bottom: 6px;">${escapeHtml(labelText)}</div>
          <div style="font-family: ${FONT}; font-size: 15px; line-height: 23px; color: ${C.text};">${bodyHtml}</div>
        </td>
      </tr>
    </table>`;
}

/** A small "didn't ask for this?" line, visually separated from the main message. */
function securityNote(text: string): string {
  return `<p style="margin: 8px 0 0; padding-top: 16px; border-top: 1px solid ${C.rule}; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${C.subtle};">${text}</p>`;
}

interface LayoutOptions {
  appUrl: string;
  /** Inbox preview line shown after the subject; hidden in the opened mail. */
  preheader: string;
  body: string;
  /** Why this person got this mail — every transactional mail should say. */
  reason: string;
}

function layout({ appUrl, preheader, body, reason }: LayoutOptions): string {
  const logo = escapeHtml(`${appUrl}/logo/icon-192.png`);
  const home = escapeHtml(appUrl);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${BRAND}</title>
</head>
<body style="margin: 0; padding: 0; background: ${C.page}; -webkit-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${escapeHtml(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${C.page};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
          <tr>
            <td style="padding: 0 4px 20px;">
              <a href="${home}" target="_blank" style="text-decoration: none;">
                <img src="${logo}" width="36" height="36" alt="" style="display: inline-block; vertical-align: middle; border: 0; border-radius: 8px;">
                <span style="display: inline-block; vertical-align: middle; margin-left: 10px; font-family: ${FONT}; font-size: 20px; font-weight: 800; color: ${C.primary}; letter-spacing: -0.3px;">${BRAND}</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background: ${C.card}; border-radius: 16px; border-top: 4px solid ${C.primary}; padding: 36px 36px 28px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 8px 0; font-family: ${FONT}; font-size: 12px; line-height: 18px; color: ${C.subtle}; text-align: center;">
              ${escapeHtml(reason)}<br>
              Questions? Just reply to this email.<br><br>
              &copy; ${year} ${BRAND} &middot; <a href="${home}" style="color: ${C.subtle}; text-decoration: underline;">${escapeHtml(appUrl.replace(/^https?:\/\//, ''))}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text part: same message, same order, signed — for clients that show no HTML. */
function plain(lines: string[], reason: string): string {
  return [...lines, '', '—', `The ${BRAND} team`, '', reason].join('\n');
}

// ─── The emails ──────────────────────────────────────────────────────────────────────

export function verificationCodeEmail(
  appUrl: string,
  code: string,
  ttlText: string,
): MailBody {
  const reason = `You're receiving this because this address was used to sign up for ${BRAND}.`;
  return {
    html: layout({
      appUrl,
      preheader: `Your ${BRAND} verification code is ${code}`,
      reason,
      body:
        heading('Verify your email') +
        paragraph(
          `Welcome to ${BRAND}! Enter the code below on the verification page to confirm this is your email address.`,
        ) +
        codeBlock(code, ttlText) +
        securityNote(
          `Didn't create a ${BRAND} account? You can safely ignore this email — no account will be activated without this code.`,
        ),
    }),
    text: plain(
      [
        'Verify your email',
        '',
        `Welcome to ${BRAND}! Enter this code on the verification page to confirm your email address:`,
        '',
        `    ${code}`,
        '',
        `This code expires in ${ttlText}.`,
        '',
        `Didn't create a ${BRAND} account? You can safely ignore this email.`,
      ],
      reason,
    ),
  };
}

export function passwordResetCodeEmail(
  appUrl: string,
  code: string,
  ttlText: string,
): MailBody {
  const reason = `You're receiving this because a password reset was requested for your ${BRAND} account.`;
  return {
    html: layout({
      appUrl,
      preheader: `Your ${BRAND} password reset code is ${code}`,
      reason,
      body:
        heading('Reset your password') +
        paragraph(
          'We received a request to reset the password for your account. Enter the code below to choose a new one.',
        ) +
        codeBlock(code, ttlText) +
        securityNote(
          "Didn't request this? Ignore this email and your password will stay the same. Never share this code with anyone — our team will never ask for it.",
        ),
    }),
    text: plain(
      [
        'Reset your password',
        '',
        'We received a request to reset the password for your account. Enter this code to choose a new one:',
        '',
        `    ${code}`,
        '',
        `This code expires in ${ttlText}.`,
        '',
        "Didn't request this? Ignore this email and your password will stay the same. Never share this code with anyone.",
      ],
      reason,
    ),
  };
}

export function passwordChangedEmail(appUrl: string): MailBody {
  const reason = `You're receiving this security notice because the password on your ${BRAND} account changed.`;
  const resetUrl = `${appUrl}/forgot-password`;
  return {
    html: layout({
      appUrl,
      preheader: `Your ${BRAND} password was just changed.`,
      reason,
      body:
        heading('Your password was changed') +
        paragraph(
          `The password for your ${BRAND} account was changed successfully. You can now sign in with your new password.`,
        ) +
        callout(
          "Wasn't you?",
          'Reset your password right away to secure your account, then reply to this email so we can help.',
          'danger',
        ) +
        button(resetUrl, 'Reset my password'),
    }),
    text: plain(
      [
        'Your password was changed',
        '',
        `The password for your ${BRAND} account was changed successfully.`,
        '',
        `Wasn't you? Reset your password right away: ${resetUrl}`,
        'Then reply to this email so we can help.',
      ],
      reason,
    ),
  };
}

export function employerActivationEmail(
  appUrl: string,
  code: string,
  companyName: string,
  ttlText: string,
  activateUrl: string,
): MailBody {
  const reason = `You're receiving this because an employer account was requested for ${companyName} on ${BRAND}.`;
  return {
    html: layout({
      appUrl,
      preheader: `${companyName} is approved — activate your employer account.`,
      reason,
      body:
        heading('Your employer account is approved') +
        paragraph(
          `Good news — the request for <strong style="color: ${C.text};">${escapeHtml(companyName)}</strong> has been approved. Use the code below to set your password and sign in.`,
        ) +
        codeBlock(code, ttlText) +
        button(activateUrl, 'Activate my account') +
        securityNote(
          `By activating this account you agree to the ${BRAND} Employer Terms of Service. If the code expires, reply to this email and we'll send a new one.`,
        ),
    }),
    text: plain(
      [
        'Your employer account is approved',
        '',
        `The request for ${companyName} has been approved. Use this code to set your password and sign in:`,
        '',
        `    ${code}`,
        '',
        `This code expires in ${ttlText}.`,
        '',
        `Activate my account: ${activateUrl}`,
        '',
        `By activating this account you agree to the ${BRAND} Employer Terms of Service.`,
      ],
      reason,
    ),
  };
}

/**
 * No status link: the frontend has no employer-facing request page (the old link,
 * /employer/request/:id, was a 404), and a reply is the answer channel anyway.
 */
export function employerMoreInfoEmail(
  appUrl: string,
  companyName: string,
  question: string,
): MailBody {
  const reason = `You're receiving this because you requested an employer account for ${companyName} on ${BRAND}.`;
  return {
    html: layout({
      appUrl,
      preheader: `One question about the ${companyName} request before we can decide.`,
      reason,
      body:
        heading('We need a little more information') +
        paragraph(
          `We're reviewing the employer request for <strong style="color: ${C.text};">${escapeHtml(companyName)}</strong> and need one more thing before we can decide.`,
        ) +
        callout('Our question', escapeMultiline(question)) +
        paragraph(
          "<strong style=\"color: " +
            C.text +
            ';">Reply to this email</strong> with the details and we\'ll pick it up from there. Your request stays open in the meantime.',
        ),
    }),
    text: plain(
      [
        'We need a little more information',
        '',
        `We're reviewing the employer request for ${companyName} and need one more thing before we can decide.`,
        '',
        question,
        '',
        "Reply to this email with the details and we'll pick it up from there. Your request stays open in the meantime.",
      ],
      reason,
    ),
  };
}

export function employerRejectedEmail(
  appUrl: string,
  companyName: string,
  reasonText: string,
): MailBody {
  const reason = `You're receiving this because you requested an employer account for ${companyName} on ${BRAND}.`;
  return {
    html: layout({
      appUrl,
      preheader: `An update on the ${companyName} employer request.`,
      reason,
      body:
        heading('About your employer request') +
        paragraph(
          `Thank you for your interest in ${BRAND}. We reviewed the employer request for <strong style="color: ${C.text};">${escapeHtml(companyName)}</strong> and can't approve it at this time.`,
        ) +
        callout('Reason', escapeMultiline(reasonText), 'danger') +
        paragraph(
          "If you think this is a mistake or your circumstances have changed, reply to this email with more detail and we'll take another look.",
        ),
    }),
    text: plain(
      [
        'About your employer request',
        '',
        `Thank you for your interest in ${BRAND}. We reviewed the employer request for ${companyName} and can't approve it at this time.`,
        '',
        `Reason: ${reasonText}`,
        '',
        "If you think this is a mistake, reply to this email with more detail and we'll take another look.",
      ],
      reason,
    ),
  };
}
