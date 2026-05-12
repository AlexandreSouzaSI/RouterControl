import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Delete,
    Patch,
} from '@nestjs/common';
import { CaminhaoService } from './caminhao.service';

@Controller('caminhoes')
export class CaminhaoController {
    constructor(private service: CaminhaoService) { }

    @Post()
    create(@Body() body: { placa: string }) {
        return this.service.create(body);
    }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id/timeline')
    getTimeline(@Param('id') id: string) {
        return this.service.getTimeline(id);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() body: { placa?: string; ativo?: boolean },
    ) {
        return this.service.update(id, body);
    }

    @Patch(':id')
    patch(
        @Param('id') id: string,
        @Body() body: { placa?: string; ativo?: boolean },
    ) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}