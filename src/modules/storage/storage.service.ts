import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  SupabaseClient,
} from '@supabase/supabase-js';

interface UploadFileInput {
  storagePath: string;
  file: Buffer;
  contentType: string;
  bucket?: string;
  upsert?: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(
    StorageService.name,
  );

  private readonly supabase: SupabaseClient;
  private readonly defaultBucket: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl =
      this.configService.getOrThrow<string>(
        'SUPABASE_URL',
      );

    const supabaseKey =
      this.configService.getOrThrow<string>(
        'SUPABASE_SERVICE_ROLE_KEY',
      );

    this.defaultBucket =
      this.configService.get<string>(
        'SUPABASE_STORAGE_BUCKET',
      ) ?? 'ems';

    this.supabase = createClient(
      supabaseUrl,
      supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  /**
   * Upload a file to Supabase Storage.
   */
  async uploadFile({
    storagePath,
    file,
    contentType,
    bucket = this.defaultBucket,
    upsert = false,
  }: UploadFileInput) {
    const { data, error } =
      await this.supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          contentType,
          cacheControl: '3600',
          upsert,
        });

    if (error) {
      this.logger.error(
        `Storage upload failed: ${error.message}`,
      );

      throw new ServiceUnavailableException(
        'Unable to upload file.',
      );
    }

    return {
      bucket,
      storagePath: data.path,
    };
  }

  /**
   * Delete one file from Supabase Storage.
   */
  async deleteFile(
    storagePath: string,
    bucket = this.defaultBucket,
  ) {
    const { error } =
      await this.supabase.storage
        .from(bucket)
        .remove([storagePath]);

    if (error) {
      this.logger.error(
        `Storage delete failed: ${error.message}`,
      );

      throw new ServiceUnavailableException(
        'Unable to delete file.',
      );
    }
  }

  /**
   * Generate a temporary signed URL.
   *
   * Default: 10 minutes.
   */
  async createSignedUrl(
    storagePath: string,
    expiresIn = 600,
    bucket = this.defaultBucket,
  ) {
    const { data, error } =
      await this.supabase.storage
        .from(bucket)
        .createSignedUrl(
          storagePath,
          expiresIn,
        );

    if (error) {
      this.logger.error(
        `Signed URL creation failed: ${error.message}`,
      );

      throw new ServiceUnavailableException(
        'Unable to generate file URL.',
      );
    }

    return {
      url: data.signedUrl,
      expiresIn,
    };
  }

  /**
   * Used by our readiness health check.
   */
  async checkBucket(
    bucket = this.defaultBucket,
  ) {
    const { data, error } =
      await this.supabase.storage.getBucket(
        bucket,
      );

    if (error || !data) {
      throw new Error(
        'Storage bucket is unavailable.',
      );
    }

    if (data.public) {
      throw new Error(
        'Storage bucket must be private.',
      );
    }

    return {
      bucket: data.name,
      public: data.public,
    };
  }
}