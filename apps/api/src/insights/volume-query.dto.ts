import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class VolumeQueryDto {
  @IsOptional()
  @IsIn(["day", "week"])
  bucket: "day" | "week" = "day";

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 90;
}
