// src/shared/services/email-templates.spec.ts
//
// The templates are pure, so these check the things a visual review cannot: that
// user-supplied text is escaped, and that every email carries what the reader needs.

import {
  employerActivationEmail,
  employerMoreInfoEmail,
  employerRejectedEmail,
  escapeHtml,
  passwordChangedEmail,
  passwordResetCodeEmail,
  verificationCodeEmail,
} from './email-templates';

const APP = 'https://jobfit.example';
const HOSTILE = 'Acme & Sons <a href="https://evil.example">click</a>';

describe('email templates', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it.each([
    ['verification', verificationCodeEmail(APP, '482913', '10 minutes')],
    ['password reset', passwordResetCodeEmail(APP, '715204', '10 minutes')],
  ])('%s email shows the code and its expiry in both parts', (_name, mail) => {
    const code = mail.text.match(/\d{6}/)![0];
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(code);
      expect(body).toContain('This code expires in 10 minutes.');
    }
  });

  it('puts the code in the inbox preview line', () => {
    const { html } = verificationCodeEmail(APP, '482913', '10 minutes');
    expect(html).toMatch(/display: none[^>]*>Your JobFit verification code is 482913/);
  });

  it('never lets a company name, question or reason inject markup', () => {
    const mails = [
      employerActivationEmail(APP, '903162', HOSTILE, '24 hours', `${APP}/employer/activate`),
      employerMoreInfoEmail(APP, HOSTILE, HOSTILE),
      employerRejectedEmail(APP, HOSTILE, HOSTILE),
    ];
    for (const { html, text } of mails) {
      expect(html).not.toContain('evil.example">click');
      expect(html).toContain('Acme &amp; Sons &lt;a href=&quot;https://evil.example&quot;&gt;');
      // The plain-text part is not HTML, so it keeps the words exactly as written.
      expect(text).toContain(HOSTILE);
    }
  });

  it('keeps the line breaks in an admin question', () => {
    const { html } = employerMoreInfoEmail(APP, 'Acme', 'First?\nSecond?');
    expect(html).toContain('First?<br>Second?');
  });

  it('links the activation button and gives the raw URL as a fallback', () => {
    const url = `${APP}/employer/activate?email=hr%40acme.com`;
    const { html, text } = employerActivationEmail(APP, '903162', 'Acme', '24 hours', url);
    expect(html.match(new RegExp(`href="${url.replace(/[?.]/g, '\\$&')}"`, 'g'))).toHaveLength(2);
    expect(text).toContain(`Activate my account: ${url}`);
  });

  it('points "wasn\'t you?" at the forgot-password page', () => {
    const { html, text } = passwordChangedEmail(APP);
    expect(html).toContain(`href="${APP}/forgot-password"`);
    expect(text).toContain(`${APP}/forgot-password`);
  });

  it('loads the logo from the site and still names the brand in text', () => {
    const { html } = verificationCodeEmail(APP, '482913', '10 minutes');
    expect(html).toContain(`src="${APP}/logo/icon-192.png"`);
    expect(html).toMatch(/>JobFit<\/span>/);
  });
});
