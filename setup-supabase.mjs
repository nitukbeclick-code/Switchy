#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://orzitfqmlvopujsoyigr.supabase.co';
const SUPABASE_KEY = 'REDACTED_ROTATE_THIS_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const BUCKETS = [
  {
    name: 'user-reviews',
    description: 'User review images and attachments',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  },
  {
    name: 'receipts',
    description: 'Bill scans and receipt uploads for verification',
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  },
  {
    name: 'profiles',
    description: 'User profile pictures',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
];

const RLS_POLICIES = [
  {
    bucket: 'user-reviews',
    policies: [
      {
        name: 'Public read access',
        definition: 'true',
        operation: 'SELECT',
        roles: ['anon', 'authenticated'],
      },
      {
        name: 'Authenticated users can upload',
        definition: 'auth.role() = \'authenticated\'',
        operation: 'INSERT',
        roles: ['authenticated'],
      },
      {
        name: 'Users can delete own uploads',
        definition: '(storage.foldername(name))[1] = auth.uid()::text OR auth.role() = \'service_role\'',
        operation: 'DELETE',
        roles: ['authenticated'],
      },
    ],
  },
  {
    bucket: 'receipts',
    policies: [
      {
        name: 'Authenticated users only',
        definition: 'auth.role() = \'authenticated\'',
        operation: 'SELECT',
        roles: ['authenticated'],
      },
      {
        name: 'Authenticated users can upload',
        definition: 'auth.role() = \'authenticated\'',
        operation: 'INSERT',
        roles: ['authenticated'],
      },
      {
        name: 'Users can delete own uploads',
        definition: '(storage.foldername(name))[1] = auth.uid()::text OR auth.role() = \'service_role\'',
        operation: 'DELETE',
        roles: ['authenticated'],
      },
    ],
  },
  {
    bucket: 'profiles',
    policies: [
      {
        name: 'Public read access',
        definition: 'true',
        operation: 'SELECT',
        roles: ['anon', 'authenticated'],
      },
      {
        name: 'Users can update own profile picture',
        definition: '(storage.foldername(name))[1] = auth.uid()::text',
        operation: 'INSERT',
        roles: ['authenticated'],
      },
      {
        name: 'Users can delete own profile picture',
        definition: '(storage.foldername(name))[1] = auth.uid()::text',
        operation: 'DELETE',
        roles: ['authenticated'],
      },
    ],
  },
];

async function createBuckets() {
  console.log('\n📦 Creating storage buckets...\n');

  const { data: existingBuckets, error: listError } = await supabase
    .storage
    .listBuckets();

  if (listError) {
    console.error('❌ Error listing buckets:', listError);
    return false;
  }

  let successCount = 0;

  for (const bucket of BUCKETS) {
    const exists = existingBuckets.some(b => b.name === bucket.name);

    if (exists) {
      console.log(`✅ Bucket "${bucket.name}" already exists`);
      successCount++;
      continue;
    }

    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.name !== 'receipts',
      allowedMimeTypes: bucket.allowedMimeTypes,
    });

    if (error) {
      console.error(`❌ Failed to create "${bucket.name}": ${error.message}`);
    } else {
      console.log(`✅ Created bucket: "${bucket.name}"`);
      console.log(`   📝 ${bucket.description}`);
      successCount++;
    }
  }

  return successCount === BUCKETS.length;
}

async function configureAuth() {
  console.log('\n🔐 Configuring Supabase Auth...\n');

  const projectRef = 'orzitfqmlvopujsoyigr';
  const appUrl = 'http://localhost:5000'; // Dev environment
  const prodUrl = 'https://chosech.app'; // Production (when available)

  console.log('⚠️  Auth Site URL and Redirect URLs:');
  console.log(`\n📍 Development:`);
  console.log(`   Site URL: ${appUrl}`);
  console.log(`   Redirect URLs:`);
  console.log(`   - ${appUrl}/auth/callback`);
  console.log(`   - ${appUrl}/`);

  console.log(`\n📍 Production (when ready):`);
  console.log(`   Site URL: ${prodUrl}`);
  console.log(`   Redirect URLs:`);
  console.log(`   - ${prodUrl}/auth/callback`);
  console.log(`   - ${prodUrl}/`);

  console.log(`\n💡 Configure these in Supabase Dashboard:`);
  console.log(`   https://app.supabase.com/project/${projectRef}/auth/settings`);
  console.log(`\n   Under "Authentication" → Settings:`);
  console.log(`   - Site URL: [set to your Flutter app URL]`);
  console.log(`   - Redirect URLs: [add the URLs above]`);

  return true;
}

async function displayEnvironmentVars() {
  console.log('\n🔑 Environment Variables for Flutter App:\n');

  console.log('Add these to your environment when running the Flutter app:');
  console.log(`\n  SUPABASE_URL=${SUPABASE_URL}`);
  console.log(`  SUPABASE_ANON_KEY=sb_publishable_WFNOchgCu1RHauIFCFDTig_dwVEo...`);
  console.log('\nOR add to lib/main.dart:');
  console.log(`\n  const _supabaseUrl = '${SUPABASE_URL}';`);
  console.log(`  const _supabaseAnonKey = 'sb_publishable_...'; // from dashboard`);
}

async function setup() {
  console.log('🚀 Setting up Supabase for Flutter App');
  console.log(`📍 Project: orzitfqmlvopujsoyigr`);
  console.log(`🌐 URL: ${SUPABASE_URL}\n`);

  const bucketsCreated = await createBuckets();
  if (!bucketsCreated) {
    console.error('\n❌ Failed to create all buckets.');
    process.exit(1);
  }

  await configureAuth();
  await displayEnvironmentVars();

  console.log('\n✅ Setup complete!\n');
  console.log('📝 Next steps:');
  console.log('   1. Configure Site URL and Redirect URLs in Supabase Auth settings');
  console.log('   2. Update lib/main.dart with your Supabase credentials');
  console.log('   3. Implement Supabase auth in the Flutter app');
  console.log('   4. Update media_service.dart to use Supabase Storage\n');
}

setup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
