#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://orzitfqmlvopujsoyigr.supabase.co';
const SUPABASE_KEY = 'REDACTED_ROTATE_THIS_KEY';
const BUCKET_NAME = 'site';
const SITE_DIR = path.join(__dirname, 'site');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

async function getAllFiles(dir, baseDir = '') {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skipFiles = ['netlify.toml', 'README.md', 'vercel.json'];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(baseDir, entry.name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath, relativePath));
    } else if (!skipFiles.includes(entry.name)) {
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

async function createBucketIfNotExists() {
  console.log(`\n📦 Creating bucket "${BUCKET_NAME}"...`);

  const { data: buckets, error: listError } = await supabase
    .storage
    .listBuckets();

  if (listError) {
    console.error('❌ Error listing buckets:', listError);
    return false;
  }

  const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

  if (bucketExists) {
    console.log(`✅ Bucket "${BUCKET_NAME}" already exists`);
    return true;
  }

  const { data, error } = await supabase
    .storage
    .createBucket(BUCKET_NAME, {
      public: true,
      allowedMimeTypes: Object.values(mimeTypes),
    });

  if (error) {
    console.error('❌ Error creating bucket:', error);
    return false;
  }

  console.log(`✅ Bucket "${BUCKET_NAME}" created`);
  return true;
}

async function uploadFiles() {
  console.log(`\n📤 Uploading files from ${SITE_DIR}...`);

  const files = await getAllFiles(SITE_DIR);
  console.log(`Found ${files.length} files to upload`);

  let successCount = 0;
  let errorCount = 0;

  for (const { fullPath, relativePath } of files) {
    try {
      const fileContent = fs.readFileSync(fullPath);
      const mimeType = getMimeType(relativePath);

      const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(relativePath, fileContent, {
          contentType: mimeType,
          upsert: true,
          cacheControl: relativePath.endsWith('.html') ? 'max-age=3600' : 'max-age=31536000',
        });

      if (error) {
        console.error(`❌ ${relativePath}: ${error.message}`);
        errorCount++;
      } else {
        console.log(`✅ ${relativePath}`);
        successCount++;
      }
    } catch (err) {
      console.error(`❌ ${relativePath}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Upload summary: ${successCount} succeeded, ${errorCount} failed`);
  return errorCount === 0;
}

async function deploy() {
  console.log('🚀 Starting Supabase site deployment...');
  console.log(`📍 Project: orzitfqmlvopujsoyigr`);
  console.log(`🌐 URL: ${SUPABASE_URL}`);

  const bucketCreated = await createBucketIfNotExists();
  if (!bucketCreated) {
    console.error('\n❌ Failed to create bucket. Aborting.');
    process.exit(1);
  }

  const uploadSuccess = await uploadFiles();

  if (uploadSuccess) {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}`;
    console.log(`\n✅ Deployment complete!`);
    console.log(`\n🔗 Your site is available at:`);
    console.log(`   ${publicUrl}/index.html`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Test: ${publicUrl}/index.html`);
    console.log(`   2. Configure custom domain in Supabase Storage settings`);
    console.log(`   3. Rotate the secret key used for deployment`);
  } else {
    console.error('\n❌ Deployment failed due to upload errors.');
    process.exit(1);
  }
}

deploy().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
