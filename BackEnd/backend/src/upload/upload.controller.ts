import {
    Controller,
    Post,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
    HttpException,
    InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';

@Controller('upload')
export class UploadController {
    constructor(private uploadService: UploadService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async upload(@EmpresaAtual() empresaId: string, @UploadedFile() file: Express.Multer.File) {
        try {
            if (!file) {
                console.log('Nenhum arquivo recebido no backend');
                throw new BadRequestException('Arquivo não enviado');
            }

            console.log('Arquivo recebido:', file.originalname, file.size, 'bytes');

            const resultado = await this.uploadService.processarUpload(empresaId, file);
            console.log('Upload processado com sucesso');

            return resultado;
        } catch (err) {
            console.error('Erro ao processar upload:', err);

            // Erros já tratados (validação, placa duplicada em outra
            // empresa etc.) mantêm a mensagem/status original — só erro
            // realmente inesperado vira 500 genérico.
            if (err instanceof HttpException) {
                throw err;
            }

            throw new InternalServerErrorException('Erro ao processar arquivo');
        }
    }
}