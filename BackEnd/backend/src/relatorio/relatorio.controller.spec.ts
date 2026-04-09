import { Test, TestingModule } from '@nestjs/testing';
import { RelatorioController } from './relatorio.controller';

describe('RelatorioController', () => {
  let controller: RelatorioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelatorioController],
    }).compile();

    controller = module.get<RelatorioController>(RelatorioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
