import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, getManager, Repository } from 'typeorm';
import { CreateSetDto } from './dto/create-set.dto';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { UserToday } from './entities/userToday.entity';
import { User } from '../user/entities/user.entity';
import { Quest } from './entities/quest.entity';
import { DeleteQuestDto } from './dto/delete-quest.dto';
import { from } from 'rxjs';
import { clear } from 'node:console';

@Injectable()
export class QuestService {
	// 생성자 생성
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,

		@InjectRepository(UserToday)
		private readonly userTodayRepository: Repository<UserToday>,

		@InjectRepository(Quest)
		private readonly questRepository: Repository<Quest>
	) {}

	async getData(ymd: string, email: string) {
		return await this.userTodayRepository
			.findOne({
				relations: ['user'],
				where: {
					user: { email: email },
					day: ymd
				}
			})
			.then(async (findData) => {
				if (findData) {
					const uid = findData.userTodayId;
					return await this.questRepository
						.find({
							relations: ['userToday'],
							where: {
								userToday: { userTodayId: uid }
							}
						})
						.then((findQuest) => {
							if (findQuest) {
								return { msg: 'success', data: findQuest };
							} else {
								return { msg: 'fail' };
							}
						})
						.catch((err) => {
							return { msg: 'fail' };
						});
				} else {
					return { msg: 'fail' };
				}
			})
			.catch((err) => {
				return { msg: 'fail' };
			});
	}

	async getCalendar(fromDate: Date, toDate: Date, email: string) {
		const fd = fromDate.toISOString();
		const td = toDate.toISOString();
		return await getManager()
			.query(
				`SELECT a.userTodayId, a.day, a.studyTime, UNIX_TIMESTAMP(a.studyTime) as studyTimeStamp, a.studySetTime, a.questRate, b.questId, b.questContent, b.questYn, u.email
from userToday a, quest b, user u
where a.userTodayId = b.userTodayId
  and u.email = a.email
  and u.email = '${email}'
  and a.studyTime between ('${fd}') and ('${td}')`
			)
			.then((cal) => {
				if (cal) {
					return { msg: 'success', data: cal };
				} else {
					return { msg: 'fail' };
				}
			});
	}

	// 공부 시간 설정
	async setStudyTime(CreateSetDto: CreateSetDto, ymd: string, email: string) {
		const user: User = new User();
		user.email = email;
		await this.userRepository.save(user);

		const userToday: UserToday = new UserToday();
		userToday.day = ymd;
		userToday.studySetTime = CreateSetDto.studySetTime;
		userToday.user = user;
		await this.userTodayRepository.insert(userToday);

		return await this.userTodayRepository
			.findOne({
				relations: ['user'],
				where: {
					user: { email: email }
				}
			})
			.then((utId) => {
				if (utId) {
					return {
						msg: 'success',
						userTodayId: utId.userTodayId,
						studyTime: utId.studyTime
					};
				} else {
					return { msg: 'fail' };
				}
			})
			.catch((err) => {
				return { msg: 'fail' };
			});
	}

	// 할 일 생성
	async createQuest(createQuestDto: CreateQuestDto) {
		const userToday: UserToday = new UserToday();
		userToday.userTodayId = createQuestDto.userTodayId;
		await this.userTodayRepository.save(userToday);

		const quest: Quest = new Quest();
		quest.questContent = createQuestDto.questContent;
		quest.userToday = userToday;
		await this.questRepository.insert(quest);

		return await this.questRepository
			.findOne({
				relations: ['userToday'],
				where: {
					userToday: { userTodayId: createQuestDto.userTodayId }
				}
			})
			.then(async (qId) => {
				if (qId) {
					const allCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: createQuestDto.userTodayId
							}
						}
					});

					const clearCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: createQuestDto.userTodayId
							},
							questYn: true
						}
					});

					const rate = (clearCnt / allCnt) * 100;
					await this.userTodayRepository.update(
						createQuestDto.userTodayId,
						{
							questRate: rate
						}
					);

					return {
						msg: 'success',
						questId: qId.questId,
						questContent: qId.questContent,
						questYn: qId.questYn,
						questRate: rate
					};
				} else {
					return { msg: 'fail' };
				}
			})
			.catch((err) => {
				return { msg: 'fail' };
			});
	}

	// 할 일 상태 변경
	async setQuestYn(updateQuestDto: UpdateQuestDto) {
		const questId = updateQuestDto.questId;
		const questYn = updateQuestDto.questYn;

		return await this.questRepository
			.update(questId, {
				questYn: questYn
			})
			.then(async (upd) => {
				if (upd.raw.changedRows > 0) {
					const allCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: updateQuestDto.userTodayId
							}
						}
					});

					const clearCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: updateQuestDto.userTodayId
							},
							questYn: true
						}
					});

					const rate = (clearCnt / allCnt) * 100;
					await this.userTodayRepository.update(
						updateQuestDto.userTodayId,
						{
							questRate: rate
						}
					);
					return {
						msg: 'success',
						questRate: rate
					};
				} else {
					return { msg: 'fail' };
				}
			})
			.catch(() => {
				return { msg: 'fail' };
			});
	}

	// 할 일 삭제
	async deleteQuest(deleteQuestDto: DeleteQuestDto) {
		const questId = deleteQuestDto.questId;
		return await this.questRepository
			.delete({ questId: questId })
			.then(async (del) => {
				if (del.affected > 0) {
					const allCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: deleteQuestDto.userTodayId
							}
						}
					});

					const clearCnt = await this.questRepository.count({
						relations: ['userToday'],
						where: {
							userToday: {
								userTodayId: deleteQuestDto.userTodayId
							},
							questYn: true
						}
					});

					const rate = (clearCnt / allCnt) * 100;
					await this.userTodayRepository.update(
						deleteQuestDto.userTodayId,
						{
							questRate: rate
						}
					);
					return {
						msg: 'success',
						questRate: rate
					};
				} else {
					return { msg: 'fail' };
				}
			})
			.catch(() => {
				return { msg: 'fail' };
			});
	}
}
