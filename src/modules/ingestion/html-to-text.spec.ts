// Flattening a posting's HTML without destroying its structure.
//
// The bug this replaces: every tag became a space and `/\s+/g -> ' '` collapsed the rest,
// so 43 of 43 ingested jobs held ZERO newlines and rendered as one unreadable paragraph.
// The detail page already renders with `whitespace-pre-line`, so the newlines were the
// only missing piece.

import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  describe('structure it must keep', () => {
    it('separates paragraphs with a blank line', () => {
      expect(htmlToText('<p>First para.</p><p>Second para.</p>')).toBe(
        'First para.\n\nSecond para.',
      );
    });

    it('turns list items into bullets on their own lines', () => {
      expect(
        htmlToText('<ul><li>Ship features</li><li>Mentor the team</li></ul>'),
      ).toBe('• Ship features\n• Mentor the team');
    });

    it('breaks on <br>', () => {
      expect(htmlToText('Line one<br>Line two<br/>Line three')).toBe(
        'Line one\nLine two\nLine three',
      );
    });

    it('puts a heading on its own line', () => {
      expect(htmlToText('<h3>Required Qualifications</h3><p>10+ years.</p>')).toBe(
        'Required Qualifications\n\n10+ years.',
      );
    });

    it('separates blocks even when the source never closes its <p>', () => {
      // Real postings do this constantly.
      expect(htmlToText('<p>One<p>Two<p>Three')).toBe('One\nTwo\nThree');
    });

    it('keeps the real posting readable end to end', () => {
      const html =
        '<p>Directors of Production lead teams.</p>' +
        '<p><strong>Responsibilities:</strong></p>' +
        '<ul><li>Creates and drives a multi-year vision</li>' +
        '<li>Partners with Product Management</li></ul>' +
        '<p><strong>Required Qualifications:</strong></p>' +
        '<ul><li>10+ years experience in software/game development</li></ul>';

      expect(htmlToText(html)).toBe(
        'Directors of Production lead teams.\n' +
          '\n' +
          'Responsibilities:\n' +
          '\n' +
          '• Creates and drives a multi-year vision\n' +
          '• Partners with Product Management\n' +
          '\n' +
          'Required Qualifications:\n' +
          '\n' +
          '• 10+ years experience in software/game development',
      );
    });
  });

  describe('what it must NOT do', () => {
    it('never emits markup — these postings are third-party input', () => {
      const out = htmlToText('<p onclick="x()">Hi</p><script>alert(1)</script>');
      expect(out).toBe('Hi');
      expect(out).not.toContain('<');
      expect(out).not.toContain('alert');
    });

    it('drops <style> and <script> CONTENT, not just their tags', () => {
      expect(htmlToText('<style>.a{color:red}</style><p>Real text</p>')).toBe('Real text');
    });

    it('does not insert a space inside a word split by inline tags', () => {
      // "<b>Java</b>Script" is one word; the old version made it "Java Script".
      expect(htmlToText('<b>Java</b>Script')).toBe('JavaScript');
    });

    it('decodes &amp; last, so &amp;lt; does not become a tag', () => {
      expect(htmlToText('R&amp;D and &amp;lt;p&amp;gt;')).toBe('R&D and &lt;p&gt;');
    });

    it('does not leave a stray bullet for an empty list item', () => {
      expect(htmlToText('<ul><li></li><li>Real</li></ul>')).toBe('• Real');
    });

    it('never runs to more than one blank line between blocks', () => {
      expect(htmlToText('<div><p>A</p></div><div><p>B</p></div>')).toBe('A\n\nB');
    });
  });

  describe('edge cases', () => {
    it('handles empty and whitespace-only input', () => {
      expect(htmlToText('')).toBe('');
      expect(htmlToText('   \n  ')).toBe('');
      expect(htmlToText('<p></p>')).toBe('');
    });

    it('leaves plain text with no markup alone', () => {
      expect(htmlToText('Just a sentence.')).toBe('Just a sentence.');
    });

    it('decodes the entities postings actually contain', () => {
      expect(htmlToText('Ben&rsquo;s &mdash; 401k &amp; dental&hellip;')).toBe(
        'Ben’s — 401k & dental…',
      );
    });

    it('collapses runs of spaces and tabs but keeps line breaks', () => {
      expect(htmlToText('<p>A   \t  B</p><p>C</p>')).toBe('A B\n\nC');
    });
  });
});
