import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'segredo_rota',
        });
    }

    async validate(payload: { sub: string; email: string; empresaId: string }) {
        // O que essa função devolve vira `req.user` em toda rota protegida.
        return payload;
    }
}
