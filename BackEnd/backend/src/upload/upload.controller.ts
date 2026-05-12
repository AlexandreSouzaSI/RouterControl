import {
    Controller,
    Post,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
    InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
    constructor(private uploadService: UploadService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async upload(@UploadedFile() file: Express.Multer.File) {
        try {
            if (!file) {
                console.log('Nenhum arquivo recebido no backend');
                throw new BadRequestException('Arquivo não enviado');
            }

            console.log('Arquivo recebido:', file.originalname, file.size, 'bytes');

            const resultado = await this.uploadService.processarUpload(file);
            console.log('Upload processado com sucesso');

            return resultado;
        } catch (err) {
            console.error('Erro ao processar upload:', err);
            throw new InternalServerErrorException('Erro ao processar arquivo');
        }
    }
}