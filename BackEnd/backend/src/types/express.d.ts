import 'express';

declare global {
    namespace Express {
        namespace Multer {
            interface File {
                buffer: Buffer;
            }
        }
    }
}