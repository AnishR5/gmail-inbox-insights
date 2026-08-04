import { IsEmail } from "class-validator";

export class CreateTrashActionDto {
  @IsEmail()
  senderEmail!: string;
}
