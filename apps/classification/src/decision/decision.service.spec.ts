import { DecisionService } from './decision.service';

describe('DecisionService', () => {
  let service: DecisionService;

  beforeEach(() => {
    service = new DecisionService();
  });

  it('approves when score is below threshold', () => {
    expect(service.decide(0.3, 0.5)).toBe('approved');
  });

  it('rejects when score is above threshold', () => {
    expect(service.decide(0.9, 0.5)).toBe('rejected');
  });

  it('rejects when score is equal to threshold', () => {
    expect(service.decide(0.5, 0.5)).toBe('rejected');
  });
});
