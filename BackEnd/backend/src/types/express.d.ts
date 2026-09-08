import 'express';

declare global {
    namespace Express {
        namespace Multer {
            interface File {
                buffer: Buffer;
            }
        }

        interface Request {
            user?: {
                sub: string;
                email: string;
                empresaId: string;
            };
        }
    }
}