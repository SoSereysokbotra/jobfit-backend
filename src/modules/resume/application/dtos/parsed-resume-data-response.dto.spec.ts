import { ParsedResumeData as PrismaParsedResumeData } from '@prisma/client';
import { ParsedResumeDataResponseDto } from './parsed-resume-data-response.dto';

const base: PrismaParsedResumeData = {
  id: 'p1',
  resumeId: 'r1',
  fullName: 'Jane Doe',
  email: 'jane@x.com',
  phone: null,
  location: null,
  summary: null,
  experiences: null,
  educations: null,
  skills: null,
  certifications: null,
  rawText: null,
  parsedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as PrismaParsedResumeData;

describe('ParsedResumeDataResponseDto', () => {
  it('maps AI structured experiences/educations (objects) with formatted dates', () => {
    const dto = new ParsedResumeDataResponseDto({
      ...base,
      parsedBy: 'ai',
      skills: JSON.stringify(['TypeScript', 'NestJS']),
      experiences: JSON.stringify([
        { company: 'Acme', title: 'Backend Dev', startDate: '2021-01', endDate: null },
        { company: 'Globex', title: 'Engineer', startDate: '2019-01', endDate: '2020-12' },
      ]),
      educations: JSON.stringify([
        { institution: 'RUPP', degree: 'BSc CS', graduationYear: 2020 },
      ]),
      certifications: JSON.stringify(['AWS Certified']),
    });

    expect(dto.skills).toEqual(['TypeScript', 'NestJS']);
    expect(dto.experiences).toEqual([
      { company: 'Acme', title: 'Backend Dev', dates: '2021-01 — Present' },
      { company: 'Globex', title: 'Engineer', dates: '2019-01 — 2020-12' },
    ]);
    expect(dto.educations).toEqual([
      { institution: 'RUPP', degree: 'BSc CS', dates: '2020' },
    ]);
    expect(dto.certifications).toEqual(['AWS Certified']);
    expect(dto.parsedBy).toBe('ai');
  });

  it('maps heuristic string-array experiences into title-only rows', () => {
    const dto = new ParsedResumeDataResponseDto({
      ...base,
      parsedBy: 'heuristic',
      skills: JSON.stringify(['Go', 'Kubernetes']),
      experiences: JSON.stringify(['Acme Corp - Senior Dev (2021-Present)']),
      educations: JSON.stringify(['RUPP, BSc CS, 2020']),
    });

    expect(dto.experiences).toEqual([
      { company: '', title: 'Acme Corp - Senior Dev (2021-Present)' },
    ]);
    expect(dto.educations).toEqual([{ institution: 'RUPP, BSc CS, 2020', degree: '' }]);
    expect(dto.skills).toEqual(['Go', 'Kubernetes']);
  });

  it('is resilient to null and malformed JSON columns', () => {
    const dto = new ParsedResumeDataResponseDto({
      ...base,
      skills: 'not json',
      experiences: null,
      educations: '{bad',
      certifications: null,
    });

    expect(dto.skills).toEqual([]);
    expect(dto.experiences).toEqual([]);
    expect(dto.educations).toEqual([]);
    expect(dto.certifications).toEqual([]);
    expect(dto.fullName).toBe('Jane Doe');
    expect(dto.parsedBy).toBeUndefined();
  });
});
