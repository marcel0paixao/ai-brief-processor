import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBriefDto } from './create-brief.dto';

describe('CreateBriefDto', () => {
  it('aceita um briefing curto, mas semanticamente compreensível', async () => {
    const dto = plainToInstance(CreateBriefDto, {
      title: 'Campanha local',
      brief: 'Divulgar o novo café para moradores do bairro.',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejeita texto repetido usado apenas para atingir o tamanho mínimo', async () => {
    const dto = plainToInstance(CreateBriefDto, {
      title: 'Teste aleatório',
      brief: 'adsdasdsadsa adsdasdsadsa adsdasdsadsa',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('brief');
    expect(errors[0].constraints).toHaveProperty('isMeaningfulBrief');
  });
});
