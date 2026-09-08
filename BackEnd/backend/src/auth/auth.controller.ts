import {
    Body,
    Controller,
    Get,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Post('login')
    async login(@Body() body: LoginDto) {
        if (!body?.email || !body?.senha) {
            throw new UnauthorizedException('Informe e-mail e senha');
        }

        return this.authService.login(body.email.trim().toLowerCase(), body.senha);
    }

    @Get('me')
    async me(@Req() req: any) {
        return this.authService.me(req.user.sub);
    }
}
