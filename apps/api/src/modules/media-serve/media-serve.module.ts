import { Module } from '@nestjs/common';
import { MediaServeController } from './media-serve.controller.js';

@Module({ controllers: [MediaServeController] })
export class MediaServeModule {}
