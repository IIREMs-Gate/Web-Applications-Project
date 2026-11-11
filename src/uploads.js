const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { uploadDir } = require('./config');

fs.mkdirSync(uploadDir, { recursive: true });

// The file type is decided by its first bytes, never by the client's filename or Content-Type.
// SVG and HTML are deliberately not allowed (script injection).
const TYPES = [
  { ext: '.jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.webp', matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

// Returns the stored filename, or null if the bytes are not an allowed image.
const save = async (buffer) => {
  const type = TYPES.find((t) => t.matches(buffer));
  if (!type) return null;
  const name = crypto.randomUUID() + type.ext;
  await fs.promises.writeFile(path.join(uploadDir, name), buffer);
  return name;
};

const remove = (name) =>
  name ? fs.promises.unlink(path.join(uploadDir, path.basename(name))).catch(() => {}) : Promise.resolve();

module.exports = { save, remove };
