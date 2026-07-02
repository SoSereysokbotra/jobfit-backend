import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClientService } from '../supabase/supabase.client';

export type StorageBucket = 'resumes' | 'company-logos' | 'job-attachments';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly buckets: Record<string, string>;

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly configService: ConfigService,
  ) {
    const cfg = this.configService.get('supabase.buckets') as Record<string, string>;
    this.buckets = cfg;
  }

  /**
   * Uploads a file to a Supabase Storage bucket.
   * Returns the public or signed URL.
   */
  async upload(
    bucket: StorageBucket,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    const { error } = await this.supabase.instance.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: true });

    if (error) {
      this.logger.error(`Storage upload failed [${bucket}/${path}]: ${error.message}`);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return this.getPublicUrl(bucket, path);
  }

  /**
   * Returns a signed URL for private buckets (resumes, job-attachments).
   */
  async getSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.supabase.instance.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data) {
      throw new Error(`Failed to create signed URL: ${error?.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Returns a public URL (for public buckets like company-logos).
   */
  getPublicUrl(bucket: StorageBucket, path: string): string {
    const { data } = this.supabase.instance.storage
      .from(bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async delete(bucket: StorageBucket, paths: string[]): Promise<void> {
    const { error } = await this.supabase.instance.storage.from(bucket).remove(paths);
    if (error) {
      this.logger.error(`Storage delete failed [${bucket}]: ${error.message}`);
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }
}
