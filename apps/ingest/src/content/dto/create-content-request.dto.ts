import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateContentRequestDto {
  @IsIn(['text', 'image'])
  type: 'text' | 'image';

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  text: string;
}
