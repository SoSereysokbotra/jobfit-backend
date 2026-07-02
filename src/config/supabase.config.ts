import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => ({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // JWT secret used to verify tokens issued by Supabase Auth
  jwtSecret: process.env.SUPABASE_JWT_SECRET,
  // Storage bucket names
  buckets: {
    resumes: process.env.SUPABASE_BUCKET_RESUMES ?? 'resumes',
    companyLogos: process.env.SUPABASE_BUCKET_COMPANY_LOGOS ?? 'company-logos',
    jobAttachments: process.env.SUPABASE_BUCKET_JOB_ATTACHMENTS ?? 'job-attachments',
  },
}));
