import { Injectable } from '@nestjs/common';
import { CreateContentRequestDto } from './dto/create-content-request.dto';

@Injectable()
export class ContentService {
  ingestContent({ text, type }: CreateContentRequestDto) {
    const contentId = crypto.randomUUID();
    return { contentId, status: 'pending' };
  }
}
