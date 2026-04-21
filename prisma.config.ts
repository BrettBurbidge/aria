import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

export default defineConfig({
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL
  }
});
