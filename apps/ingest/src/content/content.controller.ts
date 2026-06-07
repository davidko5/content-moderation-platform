import { Body, Controller, Post } from '@nestjs/common';
import { ContentService } from './content.service';
import { CreateContentRequestDto } from './dto/create-content-request.dto';

@Controller('content')
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Post()
  submit(@Body() dto: CreateContentRequestDto) {
    return this.contentService.submit(dto);
  }
}
