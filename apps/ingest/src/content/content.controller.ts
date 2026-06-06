import { Body, Controller, Post } from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateContentRequestDto } from './dto/create-content-request.dto';

@Controller('content')
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Post()
  ingestContent(@Body() body: CreateContentRequestDto) {
    return this.contentService.ingestContent(body);
  }
}
