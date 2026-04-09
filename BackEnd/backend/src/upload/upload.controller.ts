import {
    Controller,
    Post,
    UploadedFile,
    UseInterceptors,
    Body,
    Delete,
    Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
    constructor(private uploadService: UploadService) { }

    @Post()
    @UseInterceptors(FileInterceptor('file'))
    async upload(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { mes: string },
    ) {
        console.log("aqui: ", body.mes)
        console.log('FILE:', file);
        console.log('BODY:', body);
        return this.uploadService.processarUpload(file, body.mes);
    }
}