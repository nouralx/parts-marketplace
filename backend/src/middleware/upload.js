/**
 * File upload middleware (multer, memory storage — files are streamed
 * straight to Supabase Storage, never written to local disk).
 */

const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
