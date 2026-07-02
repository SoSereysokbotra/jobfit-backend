import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseClientService {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.configService.getOrThrow<string>('supabase.serviceRoleKey');

    // Use the service role key for server-side operations
    // This bypasses RLS — authorization is handled at the application layer
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  get instance(): SupabaseClient {
    return this.client;
  }
}
