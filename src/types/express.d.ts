import { Request } from 'express';
import { SupabaseJwtPayload } from '../infra/supabase/supabase-auth.service';

declare global {
  namespace Express {
    interface Request {
      user: SupabaseJwtPayload;
    }
  }
}
