import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import {
  AccessTokenPayload,
  TokenIssuer,
  VerifiedAccessToken,
} from '../../application/ports/token-issuer.port';

// Adapter for TokenIssuer (design.md Decision 2): @nestjs/jwt only, no
// Passport — the guard is one class behind this port, so swapping to
// AuthGuard('jwt') later touches nothing else. `jti` is generated HERE
// (uuid v4(), deliberately NOT the IdGenerator/UUIDv7 port used for entity
// ids — Decision 9) and embedded in the signed payload; callers never
// generate or see a jti before signing.
@Injectable()
export class JwtTokenIssuer implements TokenIssuer {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: AccessTokenPayload): Promise<string> {
    return Promise.resolve(this.jwtService.sign({ ...payload, jti: uuidv4() }));
  }

  async verify(token: string): Promise<VerifiedAccessToken> {
    return this.jwtService.verifyAsync<VerifiedAccessToken>(token);
  }
}
