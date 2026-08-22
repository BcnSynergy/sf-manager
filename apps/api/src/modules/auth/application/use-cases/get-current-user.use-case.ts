import { Injectable } from '@nestjs/common';
import { VerifiedAccessToken } from '../ports/token-issuer.port';

export interface CurrentUserResponse {
  id: string;
  email: string;
}

// design.md: GET /auth/me follows the same layered pattern as login/logout
// instead of being a presentation-layer passthrough — this use case owns
// mapping the guard's verified token payload down to the public identity
// fields only (never jti/exp/sub leaking into the response body).
@Injectable()
export class GetCurrentUserUseCase {
  execute(payload: VerifiedAccessToken): CurrentUserResponse {
    return { id: payload.sub, email: payload.email };
  }
}
