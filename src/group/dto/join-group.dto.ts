import { IsString } from 'class-validator';

export class JoinGroupDto {
	@IsString()
	groupId: string;

	@IsString()
	email: string;
}
