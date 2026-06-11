# Supabase Setup Guide

## Project Configuration

**Project:** SmarPackageAi  
**Project ID:** orzitfqmlvopujsoyigr  
**Region:** eu-central-1  
**URL:** https://orzitfqmlvopujsoyigr.supabase.co

---

## Storage Buckets

Three buckets have been created for the Flutter app:

| Bucket | Purpose | Access | MIME Types |
|--------|---------|--------|-----------|
| `user-reviews` | User review images | Public (read), Auth (write/delete) | Images (PNG, JPEG, WebP, GIF) |
| `receipts` | Bill scans & receipts | Auth only (private) | PDFs, Images |
| `profiles` | User profile pictures | Public (read), Auth (write/delete) | Images (PNG, JPEG, WebP) |

---

## Running the Flutter App

### With Supabase (recommended)

Run with the build-time Supabase configuration:

```bash
flutter run --dart-define-from-file=dart_define.json
```

Or build for production:

```bash
flutter build apk --dart-define-from-file=dart_define.json
flutter build ipa --dart-define-from-file=dart_define.json
flutter build web --dart-define-from-file=dart_define.json
```

### Without Supabase (local-only mode)

Simply run without the flag — the app falls back to `LocalBackend`:

```bash
flutter run
```

---

## Authentication Setup (TODO)

The app supports Supabase Auth for:
- Securing media uploads (receipts bucket is auth-only)
- Storing user reviews and tracked plans
- Push notifications for renewal reminders

**Configure in Supabase Dashboard:**

1. Go to **Project Settings → Authentication → Settings**
2. Set **Site URL:**
   - Dev: `http://localhost:5000`
   - Prod: `https://chosech.app`

3. Add **Redirect URLs:**
   - `http://localhost:5000/auth/callback`
   - `http://localhost:5000/`
   - `https://chosech.app/auth/callback`
   - `https://chosech.app/`

4. Enable **Anonymous sign-ins** (for lead capture without login)

---

## Media Service API

The `MediaService` now supports both base64 persistence (legacy) and Supabase Storage uploads.

### Upload Methods

```dart
import 'lib/services/media_service.dart';

// Upload review image (public, returns public URL)
final reviewUrl = await MediaService.uploadReviewImage(fromCamera: true);

// Upload receipt (auth-only, returns 7-day signed URL)
final receiptUrl = await MediaService.uploadReceipt();

// Upload profile picture (public, upserts existing)
final profileUrl = await MediaService.uploadProfilePicture();

// Delete a file
await MediaService.deleteFile(fileUrl, bucket: 'user-reviews');
```

### Legacy Methods (still available)

```dart
// Base64 data-URI (persisted in SharedPreferences)
final imageDataUri = await MediaService.pickImageDataUri();
final audioDataUri = await MediaService.persistableAudio(audioPath);

// File paths (session-only on web)
final videoPath = await MediaService.pickVideoPath();
```

---

## Environment & Secrets

**Files:**
- `dart_define.json` — Build-time credentials (DO NOT COMMIT TO PUBLIC REPOS)
- `.env` — Runtime environment (git-ignored by `.gitignore`)

**Credentials:**
- SUPABASE_URL = https://orzitfqmlvopujsoyigr.supabase.co
- SUPABASE_ANON_KEY = sb_publishable_... (in `dart_define.json`)
- SUPABASE_SECRET_KEY = sb_secret_... (for server-side operations only, NOT in app)

---

## RLS Policies

Row-Level Security (RLS) is enabled on all storage buckets:

### user-reviews
- **SELECT:** Public (anyone can view)
- **INSERT:** Authenticated users only
- **DELETE:** Users can delete their own files OR service_role

### receipts
- **SELECT/INSERT/DELETE:** Authenticated users only (private)

### profiles
- **SELECT:** Public (anyone can view)
- **INSERT/DELETE:** Users can update their own profile picture

---

## Next Steps

1. ✅ Storage buckets created
2. ✅ Media service updated with Supabase uploads
3. ✅ Credentials configured in `dart_define.json`
4. ⏳ **TODO:** Configure Auth Site URL & Redirect URLs in dashboard
5. ⏳ **TODO:** Implement Supabase Auth in the app (login/logout screens)
6. ⏳ **TODO:** Add auth-protected screens (tracked plans, reviews)
7. ⏳ **TODO:** Set up push notifications for renewal reminders

---

## Testing

### Test Media Uploads

```dart
// In a test or temporary screen
final url = await MediaService.uploadProfilePicture();
print('Profile picture URL: $url');
```

### Test Storage Access

```bash
# Check buckets in the Supabase dashboard
# Dashboard → Storage → Browse buckets
```

### Test RLS Policies

- **Anonymous user:** Can view images in `user-reviews` and `profiles`, but can't upload
- **Authenticated user:** Can upload and delete their own files
- **Receipts bucket:** Only authenticated users can access

---

## Troubleshooting

### "Error creating signed URL" (receipts)

The signed URL creation fails if the user isn't authenticated. Ensure the user is signed in before uploading receipts:

```dart
final user = Supabase.instance.client.auth.currentUser;
if (user == null) {
  // Show login screen
  return;
}
```

### "File too large"

The old media service had a 1.5 MB limit for base64 encoding. Supabase Storage has no such limit, but consider:
- Compress images before upload (already done in `uploadProfilePicture`)
- Use signed URLs with expiry for sensitive files

### "CORS error on web"

If the Flutter web app can't access Supabase Storage from a custom domain, update CORS settings in Supabase Dashboard:
- **Storage → Settings → CORS**
- Add your web app's domain (e.g., `https://chosech.app`)

---

## Security Checklist

- ✅ Secrets are in `dart_define.json` (git-ignored)
- ✅ RLS policies restrict file access
- ✅ Receipts bucket is auth-only (private)
- ✅ Anon key is safe to expose (limited access)
- ⏳ Rotate service role key after setup
- ⏳ Set up auth-protected screens
- ⏳ Enable multi-factor authentication (MFA)
