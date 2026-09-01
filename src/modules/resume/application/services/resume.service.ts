// src/modules/resume/application/services/resume.service.ts
//
// Resume upload/list/delete/default management. Files live in the private Supabase
// 'resumes' bucket (via the shared StorageService); metadata lives in Postgres. Parsing is
// off-thread (Phase 5C) — uploads land with parsingStatus PENDING and the parse job is
// enqueued there (see TODO).

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResumeRepository } from '../../infrastructure/repositories/resume.repository';
import { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import { StorageService } from '@infra/storage/storage.service';
import {
  BullQueueService,
  QueueUnavailableError,
} from '@infra/queue/bull-queue.service';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { ResumeDefaultChangedEvent } from '../../domain/events/resume-default-changed.event';
import {
  Resume,
  ResumeFileType,
} from '../../domain/entities/resume.entity';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

/** Minimal shape of an uploaded file (subset of Express.Multer.File). */
export interface ResumeFileUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MIME_TO_TYPE: Record<string, ResumeFileType> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'DOCX',
};

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly userRepository: UserRepository,
    private readonly storage: StorageService,
    private readonly queue: BullQueueService,
    private readonly eventBus: DomainEventBus,
  ) {}

  async uploadResume(
    userId: string,
    file: ResumeFileUpload,
    title?: string,
  ): Promise<Resume> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const fileType = MIME_TO_TYPE[file.mimetype];
    if (!fileType) {
      throw new BadRequestException('Only PDF and DOCX resumes are supported');
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Resume must be between 1 byte and 5 MB');
    }

    // Deterministic storage path so the file can be located again for deletion.
    const resumeId = randomUUID();
    const path = this.storagePath(userId, resumeId, file.originalname);
    const fileUrl = await this.storage.upload(
      'resumes',
      path,
      file.buffer,
      file.mimetype,
    );

    // A user with one CV should never have to press "set as default" for the AI to use it.
    // Only the FIRST upload claims the flag; later uploads leave the user's choice alone.
    const hasDefault = (await this.resumeRepository.findDefaultByUserId(userId)) !== null;

    const resume = new Resume(
      {
        userId,
        fileName: file.originalname,
        fileUrl,
        fileSize: file.size,
        fileType,
        title,
        isDefault: !hasDefault,
        parsingStatus: 'PENDING',
      },
      resumeId,
    );
    await this.resumeRepository.save(resume);

    // Enqueue async parsing (BullMQ 'resume-parsing' queue). The resume stays PENDING
    // until the worker flips it to SUCCESS/FAILED.
    //
    // THE UPLOAD ITSELF HAS ALREADY SUCCEEDED by this point — the file is in storage and
    // the row is saved. So a queue outage must not fail the request and orphan the file;
    // it must stop the row from CLAIMING something untrue. PENDING means "a worker will
    // pick this up", and if nothing was scheduled that is a lie the user would sit in
    // front of forever.
    try {
      await this.queue.addJob('resume-parsing', 'parseResume', {
        resumeId: resume.id,
        fileUrl: resume.fileUrl,
        fileType: resume.fileType,
      });
    } catch (err) {
      if (!(err instanceof QueueUnavailableError)) throw err;
      this.logger.error(
        `Resume ${resume.id} uploaded but parsing was not scheduled: ${err.message}`,
      );
      // FAILED, not PENDING: the file is safe and re-uploadable, and the client can say
      // so instead of showing a spinner that never resolves.
      resume.parsingStatus = 'FAILED';
      resume.parsingError =
        'Could not start processing — the job queue is unavailable. Please try again.';
      await this.resumeRepository.save(resume);
    }

    return resume;
  }

  async getResume(resumeId: string): Promise<Resume> {
    const resume = await this.resumeRepository.findById(resumeId);
    if (!resume) throw new NotFoundException('Resume not found');
    return resume;
  }

  /** All of a user's resumes, newest first. */
  async getUserResumes(userId: string): Promise<Resume[]> {
    return this.resumeRepository.findByUserId(userId);
  }

  async deleteResume(resumeId: string): Promise<void> {
    const resume = await this.getResume(resumeId);

    // Best-effort remove from storage, then soft-delete the row.
    const path = this.storagePath(resume.userId, resume.id, resume.fileName);
    await this.storage.delete('resumes', [path]);
    await this.resumeRepository.delete(resumeId);
  }

  async setDefaultResume(userId: string, resumeId: string): Promise<void> {
    const resume = await this.getResume(resumeId);
    if (resume.userId !== userId) {
      throw new NotFoundException('Resume not found');
    }

    const current = await this.resumeRepository.findDefaultByUserId(userId);
    if (current?.id === resume.id) return; // already the default — nothing to re-embed

    if (current) {
      current.unsetDefault();
      await this.resumeRepository.save(current);
    }

    resume.setAsDefault();
    await this.resumeRepository.save(resume);

    // The candidate embedding is built from this résumé, so it must be rebuilt.
    await this.eventBus.publish(new ResumeDefaultChangedEvent(userId, resume.id));
  }

  private storagePath(
    userId: string,
    resumeId: string,
    fileName: string,
  ): string {
    return `${userId}/${resumeId}/${fileName}`;
  }
}
