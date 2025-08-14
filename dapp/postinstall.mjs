import fse from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicTinymcePath = path.join(__dirname, 'public', 'tinymce');

// Empty and copy TinyMCE to public directory
fse.emptyDirSync(publicTinymcePath);
fse.copySync(
  path.join(__dirname, 'node_modules', 'tinymce'), 
  publicTinymcePath, 
  { overwrite: true }
);

console.log('✓ TinyMCE copied to public directory');