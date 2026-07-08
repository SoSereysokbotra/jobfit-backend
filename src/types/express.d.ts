import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

declare global {
  namespace Express {
    interface Request {
      // Populated by JwtAuthGuard (self-managed JWT auth). Optional because
      // @Public() / OptionalJwtAuthGuard routes may be anonymous.
      user?: AuthenticatedUser;
    }
  }
}
