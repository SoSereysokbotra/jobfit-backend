import { inferJobSlices } from './job-slices';

describe('inferJobSlices', () => {
  it('detects Khmer script as language "km", else "en"', () => {
    expect(inferJobSlices({ title: 'Backend Engineer' }).language).toBe('en');
    expect(inferJobSlices({ title: 'អ្នកអភិវឌ្ឍន៍', description: 'ការងារ' }).language).toBe('km');
    // Mixed content counts as km (any Khmer present).
    expect(inferJobSlices({ title: 'Engineer', description: 'ភ្នំពេញ' }).language).toBe('km');
  });

  it('infers seniority from the title', () => {
    expect(inferJobSlices({ title: 'Senior Backend Engineer' }).seniority).toBe('senior');
    expect(inferJobSlices({ title: 'Junior Developer' }).seniority).toBe('entry');
    expect(inferJobSlices({ title: 'Software Engineering Intern' }).seniority).toBe('intern');
    expect(inferJobSlices({ title: 'Engineering Manager' }).seniority).toBe('lead');
    expect(inferJobSlices({ title: 'Software Engineer' }).seniority).toBe('mid');
  });

  it('infers category, preferring specific families over the engineer catch-all', () => {
    expect(inferJobSlices({ title: 'Data Engineer' }).category).toBe('data');
    expect(inferJobSlices({ title: 'DevOps Engineer' }).category).toBe('devops');
    expect(inferJobSlices({ title: 'Senior Backend Engineer' }).category).toBe('software-eng');
    expect(inferJobSlices({ title: 'UX Designer' }).category).toBe('design');
    expect(inferJobSlices({ title: 'Product Manager' }).category).toBe('product');
    expect(inferJobSlices({ title: 'Warehouse Associate' }).category).toBe('other');
  });
});
