import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';
import { Brief, BriefSchema } from './schemas/brief.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Brief.name, schema: BriefSchema }]),
  ],
  controllers: [BriefsController],
  providers: [BriefsService],
})
export class BriefsModule {}
