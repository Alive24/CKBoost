"use client"

import { Editor } from '@tinymce/tinymce-react';
import { useRef, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  id?: string;
}

export function MarkdownEditor({ 
  value, 
  onChange, 
  placeholder = "Enter your response...",
  height = 200,
  id
}: MarkdownEditorProps) {
  // TinyMCE editor reference - type is from TinyMCE library
  const editorRef = useRef<unknown>(null);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Removed image warning - we store everything on Nostr

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine the actual theme to use
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'light';
  const isDark = currentTheme === 'dark';

  // We store everything on Nostr, so no need to warn about base64 images

  // Don't render until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <div className="border rounded-md p-4 bg-muted animate-pulse" style={{ height }}>
        <div className="h-4 bg-muted-foreground/20 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-muted-foreground/20 rounded w-1/2"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Editor
        id={id}
        tinymceScriptSrc='/tinymce/tinymce.min.js'
        licenseKey='gpl'
        value={value}
        onEditorChange={(content) => onChange(content)}
        init={{
          height,
          menubar: false,
          // Add image plugin to the list
          plugins: [
            'autolink', 'lists', 'link', 'charmap', 'preview',
            'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'help', 'wordcount', 'codesample', 'image'
          ],
          toolbar: 'undo redo | formatselect | ' +
            'bold italic underline strikethrough | ' +
            'link image codesample | alignleft aligncenter ' +
            'alignright alignjustify | bullist numlist outdent indent | ' +
            'removeformat | help',
        content_style: `
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            font-size: 14px;
            line-height: 1.6;
          }
          p { margin: 0 0 10px 0; }
          code { 
            background-color: #f4f4f4; 
            padding: 2px 4px; 
            border-radius: 3px;
            font-family: 'Courier New', monospace;
          }
          pre { 
            background-color: #f4f4f4; 
            padding: 10px; 
            border-radius: 5px;
            overflow-x: auto;
          }
        `,
        placeholder,
        codesample_languages: [
          { text: 'HTML/XML', value: 'markup' },
          { text: 'JavaScript', value: 'javascript' },
          { text: 'CSS', value: 'css' },
          { text: 'TypeScript', value: 'typescript' },
          { text: 'Python', value: 'python' },
          { text: 'Rust', value: 'rust' },
          { text: 'Bash', value: 'bash' },
          { text: 'JSON', value: 'json' }
        ],
        // Markdown-friendly settings
        formats: {
          bold: { inline: 'strong' },
          italic: { inline: 'em' },
          underline: { inline: 'u' },
          strikethrough: { inline: 's' },
          code: { inline: 'code' }
        },
        valid_elements: '*[*]',
        extended_valid_elements: '*[*]',
        verify_html: false,
        entity_encoding: 'raw',
        paste_as_text: false,
        paste_data_images: true,
        paste_webkit_styles: 'none',
        browser_spellcheck: true,
        contextmenu: false,
        branding: false,
        promotion: false,
        // Theme configuration based on site theme
        skin: isDark ? 'oxide-dark' : 'oxide',
        content_css: isDark ? 'dark' : 'default',
        // Image handling
        images_upload_handler: (blobInfo, progress) => {
          return new Promise((resolve, reject) => {
            // Convert to base64 data URL
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              // No warning needed - we store on Nostr
              resolve(base64);
            };
            reader.onerror = () => {
              reject('Failed to convert image to base64');
            };
            reader.readAsDataURL(blobInfo.blob());
          });
        },
        automatic_uploads: true,
        images_reuse_filename: true,
        file_picker_types: 'image',
        }}
      />
    </div>
  );
}