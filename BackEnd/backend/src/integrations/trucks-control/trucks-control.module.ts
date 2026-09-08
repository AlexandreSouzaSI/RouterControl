import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrucksControlController } from './trucks-control.controller';
import { TrucksControlService } from './trucks-control.service';

@Module({
    imports: [PrismaModule],
    controllers: [TrucksControlController],
    providers: [TrucksControlService],
})
export class TrucksControlModule { }