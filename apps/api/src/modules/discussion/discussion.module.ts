import { Module } from '@nestjs/common';
import { DiscussionAdminController, DiscussionPublicController } from './discussion.controller.js';
import { DiscussionService } from './discussion.service.js';

@Module({ controllers: [DiscussionPublicController, DiscussionAdminController], providers: [DiscussionService] })
export class DiscussionModule {}
