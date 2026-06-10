import { Decision } from '@moderation/events';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DecisionService {
  decide(score: number, threshold: number): Decision {
    return score >= threshold ? 'rejected' : 'approved';
  }
}
