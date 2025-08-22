import fse from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicTinymcePath = path.join(__dirname, 'public', 'tinymce');

// Empty and copy TinyMCE to public directory
fse.emptyDirSync(publicTinymcePath);

// Handle both regular directory and symlink (pnpm) cases
const tinymceSourcePath = path.join(__dirname, 'node_modules', 'tinymce');
try {
  const stats = fse.lstatSync(tinymceSourcePath);
  if (stats.isSymbolicLink()) {
    // If it's a symlink (pnpm), resolve it first
    const realPath = fse.realpathSync(tinymceSourcePath);
    fse.copySync(realPath, publicTinymcePath, { 
      overwrite: true,
      dereference: true 
    });
  } else {
    // Regular directory
    fse.copySync(tinymceSourcePath, publicTinymcePath, { 
      overwrite: true 
    });
  }
  console.log('✓ TinyMCE copied to public directory');
} catch (error) {
  console.error('Error copying TinyMCE:', error.message);
  // Don't fail the install if TinyMCE copy fails
  process.exit(0);
}