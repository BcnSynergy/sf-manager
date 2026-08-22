import { Injectable } from '@nestjs/common';
import { VerifiedAccessToken } from '../ports/token-issuer.port';
import type { Role } from '../../../users/domain/role';

export interface CurrentUserResponse {
  id: string;
  email: string;
  role: Role;
}

// design.md: GET /auth/me follows the same layered pattern as login/logout
// instead of being a presentation-layer passthrough — this use case owns
// mapping the guard's verified token payload down to the public identity
// fields only (never jti/exp/sub leaking into the response body). `role`
// (PR 7, breaking change — authentication spec.md delta "Session
// Introspection") comes straight off the verified token, no DB read.
@Injectable()
export class GetCurrentUserUseCase {
  execute(payload: VerifiedAccessToken): CurrentUserResponse {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
