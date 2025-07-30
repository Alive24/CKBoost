#!/usr/bin/env ts-node

// Note: This can be done more robustly when @ckb-ccc/molecule is available.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MoleculeField {
  name: string;
  type: string;
}

interface MoleculeDeclaration {
  name: string;
  type: string;
  fields?: MoleculeField[];
  item?: string;
}

interface MoleculeSchema {
  namespace: string;
  imports: any[];
  declarations: MoleculeDeclaration[];
}

// Map of types that exist in CCC that we should use from the ccc namespace
// These are available as molecule codecs in the mol namespace
const CCC_BASIC_TYPES = new Set([
  'Uint8',
  'Uint16',
  'Uint32',
  'Uint64',
  'Uint128',
  'Uint256',
  'Byte32',
  'Bytes',
  'BytesOpt',
  'BytesVec',
  'Byte32Vec',
  'Byte32Opt',
  'Uint8Vec',
  'Uint16Vec',
  'Uint32Vec',
  'Uint64Vec',
  'Uint128Vec',
  'Uint256Vec',
]);

// These are CKB types exported directly as classes in CCC
const CCC_CKB_TYPES = new Set([
  'Script',
  'OutPoint',
  'CellInput',
  'CellOutput',
  'CellDep',
  'Transaction',
  'WitnessArgs',
]);

// These CKB vec types need to be generated using molecule
const CCC_CKB_VEC_TYPES = new Set([
  'ScriptOpt',
  'ScriptVec',
  'CellDepVec',
  'CellInputVec',
  'CellOutputVec',
  'TransactionVec',
]);


function generateTypeScript(jsonSchema: string): string {
  const schema: MoleculeSchema = JSON.parse(jsonSchema);
  
  let output = `// Auto-generated TypeScript types for CKBoost molecule schema
// This file uses CCC molecule types where available and defines custom types

`;

  // Collect types that need to be imported from CCC
  const cccBasicImports = new Set<string>();
  const cccCkbImports = new Set<string>();
  const cccCkbVecImports = new Set<string>();
  const customTypes = new Set<string>();
  
  // First pass: determine which types to import vs define
  schema.declarations.forEach(decl => {
    if (CCC_BASIC_TYPES.has(decl.name)) {
      cccBasicImports.add(decl.name);
    } else if (CCC_CKB_TYPES.has(decl.name)) {
      cccCkbImports.add(decl.name);
    } else if (CCC_CKB_VEC_TYPES.has(decl.name)) {
      cccCkbVecImports.add(decl.name);
    } else {
      customTypes.add(decl.name);
    }
  });

  // Import from CCC
  output += `// Import from CCC\n`;
  output += `import { mol, ccc } from "@ckb-ccc/core";\n\n`;
  
  // Re-export basic types
  output += `// Re-export basic types\n`;
  output += `export type CanCastToArrayBuffer = ArrayBuffer | {\n`;
  output += `  toArrayBuffer(): ArrayBuffer;\n`;
  output += `};\n`;
  output += `export type CreateOptions = {\n`;
  output += `  validate?: boolean;\n`;
  output += `};\n\n`;
  
  // Define codecs for basic types that we use
  if (cccBasicImports.size > 0) {
    output += `// CCC basic molecule codecs\n`;
    for (const typeName of Array.from(cccBasicImports).sort()) {
      output += `const CCC${typeName} = mol.${typeName};\n`;
    }
    output += `\n`;
  }
  
  // Define CKB vec types using molecule
  if (cccCkbVecImports.size > 0) {
    output += `// CKB vec/opt types generated using molecule\n`;
    for (const typeName of Array.from(cccCkbVecImports).sort()) {
      if (typeName === 'ScriptOpt') {
        output += `const CCC${typeName} = mol.option(ccc.Script);\n`;
      } else if (typeName === 'ScriptVec') {
        output += `const CCC${typeName} = mol.vector(ccc.Script);\n`;
      } else if (typeName === 'CellDepVec') {
        output += `const CCC${typeName} = mol.vector(ccc.CellDep);\n`;
      } else if (typeName === 'CellInputVec') {
        output += `const CCC${typeName} = mol.vector(ccc.CellInput);\n`;
      } else if (typeName === 'CellOutputVec') {
        output += `const CCC${typeName} = mol.vector(ccc.CellOutput);\n`;
      } else if (typeName === 'TransactionVec') {
        output += `const CCC${typeName} = mol.vector(ccc.Transaction);\n`;
      }
    }
    output += `\n`;
  }

  // Generate type aliases for custom types
  output += `// Custom type definitions\n`;
  
  // Process custom array/vec/option types
  schema.declarations.forEach(decl => {
    if (customTypes.has(decl.name)) {
      if (decl.type === 'array') {
        // Arrays in molecule are fixed-size byte arrays
        output += `export type ${decl.name}Type = ccc.Hex;\n`;
      } else if (decl.type === 'fixvec' && decl.name === 'Bytes') {
        output += `export type BytesType = CanCastToArrayBuffer;\n`;
      } else if (decl.type === 'option') {
        const itemType = getTypeReference(decl.item || 'any');
        output += `export type ${decl.name}Type = ${itemType} | undefined;\n`;
      } else if (decl.type === 'dynvec' || decl.type === 'fixvec') {
        const itemType = getTypeReference(decl.item || 'any');
        output += `export type ${decl.name}Type = ${itemType}[];\n`;
      }
    }
  });

  output += '\n';

  // Generate interfaces for custom structs and tables
  schema.declarations.forEach(decl => {
    if (customTypes.has(decl.name) && (decl.type === 'struct' || decl.type === 'table')) {
      output += `export interface ${decl.name}Type {\n`;
      
      if (decl.fields && Array.isArray(decl.fields)) {
        decl.fields.forEach(field => {
          const fieldType = getTypeReference(field.type);
          output += `  ${field.name}: ${fieldType};\n`;
        });
      }
      
      output += '}\n\n';
    }
  });

  // Generate codec classes for custom types
  output += `// Molecule codec implementations\n`;
  
  // Define Uint8 early since it's used by other types
  if (cccBasicImports.has('Uint8')) {
    output += `export const Uint8 = CCCUint8;\n`;
  }
  
  // Define Script early since it's used by table definitions
  if (cccCkbImports.has('Script')) {
    output += `export const Script = { encode: (value: ccc.ScriptLike) => ccc.Script.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.Script.fromBytes(bytes) };\n`;
  }
  
  // Define types that are used by other types early
  // We need to define them in dependency order
  const earlyTypes = ['ProposalShortId', 'ProposalShortIdVec', 'RawTransaction', 'RawHeader', 'Header', 'UncleBlock', 'UncleBlockVec'];
  const earlyTypesSet = new Set(earlyTypes);
  
  // Generate early types first in the specified order
  for (const typeName of earlyTypes) {
    const decl = schema.declarations.find(d => d.name === typeName);
    if (decl && customTypes.has(typeName)) {
      output += generateCodecForDeclaration(decl);
    }
  }
  
  // Generate remaining custom types
  schema.declarations.forEach(decl => {
    if (customTypes.has(decl.name) && !earlyTypesSet.has(decl.name)) {
      const className = decl.name;
      
      if (decl.type === 'struct' || decl.type === 'table') {
        // For structs and tables, create codec
        output += generateCodecClass(decl);
      } else if (decl.type === 'dynvec' || decl.type === 'fixvec') {
        // For vectors, use mol.vector
        const itemCodec = getCodecReference(decl.item || 'Bytes');
        output += `export const ${className} = mol.vector(${itemCodec});\n`;
      } else if (decl.type === 'array') {
        // For arrays, create a fixed byte array codec like Byte32
        const size = getArraySize(decl);
        output += `export const ${className} = mol.Codec.from({\n`;
        output += `  byteLength: ${size},\n`;
        output += `  encode: (value: ccc.BytesLike) => ccc.bytesFrom(value),\n`;
        output += `  decode: (buffer: ccc.BytesLike) => ccc.hexFrom(buffer)\n`;
        output += `});\n`;
      } else if (decl.type === 'option') {
        // For options, use mol.option
        const itemCodec = getCodecReference(decl.item || 'Bytes');
        output += `export const ${className} = mol.option(${itemCodec});\n`;
      }
    }
  });

  // Generate serialize functions
  output += `\n// Serialize functions\n`;
  schema.declarations.forEach(decl => {
    if (customTypes.has(decl.name)) {
      output += `export function Serialize${decl.name}(value: ${decl.name}Type): Uint8Array {\n`;
      output += `  return new Uint8Array(${decl.name}.encode(value));\n`;
      output += `}\n`;
    }
  });

  // Re-export CCC types with our naming convention
  output += `\n// Re-export CCC types with consistent naming\n`;
  
  // Basic types
  for (const typeName of Array.from(cccBasicImports).sort()) {
    if (typeName.startsWith('Uint') || typeName.startsWith('Byte32')) {
      const isVec = typeName.endsWith('Vec');
      const isOpt = typeName.endsWith('Opt');
      let inputType = 'ccc.NumLike';
      let outputType = 'bigint';
      
      if (typeName === 'Uint8' || typeName === 'Uint16' || typeName === 'Uint32') {
        outputType = 'number';
      }
      if (typeName.startsWith('Byte')) {
        inputType = 'ccc.BytesLike';
        outputType = 'ccc.Hex';
      }
      
      if (isVec) {
        inputType = `${inputType}[]`;
        outputType = `${outputType}[]`;
      } else if (isOpt) {
        inputType = `${inputType} | null | undefined`;
        outputType = `${outputType} | undefined`;
      }
      
      output += `export type ${typeName}Type = ${outputType};\n`;
      if (typeName !== 'Uint8') {
        output += `export const ${typeName} = CCC${typeName};\n`;
      }
      // For Serialize functions, use appropriate Like types
      let likeType = 'any';
      if (typeName.startsWith('Uint') || typeName.includes('128') || typeName.includes('256')) {
        likeType = 'ccc.NumLike';
        if (typeName.endsWith('Vec')) likeType = 'ccc.NumLike[]';
        if (typeName.endsWith('Opt')) likeType = 'ccc.NumLike | null | undefined';
      } else if (typeName.startsWith('Byte') || typeName === 'Bytes') {
        likeType = 'ccc.BytesLike';
        if (typeName.endsWith('Vec')) likeType = 'ccc.BytesLike[]';
        if (typeName.endsWith('Opt')) likeType = 'ccc.BytesLike | null | undefined';
      }
      
      output += `export const Serialize${typeName} = (value: ${likeType}) => new Uint8Array(CCC${typeName}.encode(value));\n`;
    } else if (typeName === 'Bytes' || typeName === 'BytesVec' || typeName === 'BytesOpt') {
      if (typeName === 'Bytes') {
        output += `export type BytesType = ccc.Hex;\n`;
      } else if (typeName === 'BytesVec') {
        output += `export type BytesVecType = ccc.Hex[];\n`;
      } else if (typeName === 'BytesOpt') {
        output += `export type BytesOptType = ccc.Hex | undefined;\n`;
      }
      output += `export const ${typeName} = CCC${typeName};\n`;
      // For Serialize functions, use appropriate Like types
      let likeType = 'any';
      if (typeName.startsWith('Uint') || typeName.includes('128') || typeName.includes('256')) {
        likeType = 'ccc.NumLike';
        if (typeName.endsWith('Vec')) likeType = 'ccc.NumLike[]';
        if (typeName.endsWith('Opt')) likeType = 'ccc.NumLike | null | undefined';
      } else if (typeName.startsWith('Byte') || typeName === 'Bytes') {
        likeType = 'ccc.BytesLike';
        if (typeName.endsWith('Vec')) likeType = 'ccc.BytesLike[]';
        if (typeName.endsWith('Opt')) likeType = 'ccc.BytesLike | null | undefined';
      }
      
      output += `export const Serialize${typeName} = (value: ${likeType}) => new Uint8Array(CCC${typeName}.encode(value));\n`;
    }
  }
  
  // CKB vec types
  for (const typeName of Array.from(cccCkbVecImports).sort()) {
    // Extract base type for type exports
    let baseType = typeName;
    if (typeName.endsWith('Vec')) {
      baseType = typeName.slice(0, -3);
      output += `export type ${typeName}Type = ccc.${baseType}[];\n`;
    } else if (typeName.endsWith('Opt')) {
      baseType = typeName.slice(0, -3);
      output += `export type ${typeName}Type = ccc.${baseType} | undefined;\n`;
    } else {
      // ProposalShortId is an array type
      if (typeName === 'ProposalShortId') {
        output += `export type ${typeName}Type = ccc.Hex;\n`;
      } else {
        output += `export type ${typeName}Type = ccc.${typeName};\n`;
      }
    }
    output += `export const ${typeName} = CCC${typeName};\n`;
    output += `export const Serialize${typeName} = (value: any) => new Uint8Array(CCC${typeName}.encode(value));\n`;
  }
  
  // CKB types
  for (const typeName of Array.from(cccCkbImports).sort()) {
    output += `export type ${typeName}Type = ccc.${typeName};\n`;
    // For CKB types, we need to create a codec wrapper
    if (typeName === 'Script') {
      // Script is already defined early, skip it here
    } else {
      output += `export const ${typeName} = { encode: (value: ccc.${typeName}Like) => ccc.${typeName}.from(value).toBytes(), decode: (bytes: ccc.BytesLike) => ccc.${typeName}.fromBytes(bytes) };\n`;
    }
    output += `export const Serialize${typeName} = (value: ccc.${typeName}Like) => ccc.${typeName}.from(value).toBytes();\n`;
  }

  return output;
}

function getTypeReference(type: string): string {
  if (type === 'byte') return 'number';
  if (type === 'Uint8') return 'number';
  if (type.endsWith('Type')) return type;
  return `${type}Type`;
}

function getCodecReference(type: string): string {
  if (type === 'byte') return 'mol.uint(1)';
  if (CCC_BASIC_TYPES.has(type)) return `CCC${type}`;
  if (CCC_CKB_TYPES.has(type)) return type; // CKB types use the wrapper we create
  if (CCC_CKB_VEC_TYPES.has(type)) return `CCC${type}`; // CKB vec types use CCC reference
  return type;
}

function getArraySize(decl: MoleculeDeclaration): number {
  // Extract size from declaration - this is a simplified version
  // In real implementation, you'd parse the actual molecule schema
  switch (decl.name) {
    case 'Uint32': return 4;
    case 'Uint64': return 8;
    case 'Uint128': return 16;
    case 'Byte32': return 32;
    case 'Uint256': return 32;
    case 'ProposalShortId': return 10;
    default: return 32; // default
  }
}

function generateCodecForDeclaration(decl: MoleculeDeclaration): string {
  const className = decl.name;
  
  if (decl.type === 'struct' || decl.type === 'table') {
    return generateCodecClass(decl);
  } else if (decl.type === 'dynvec' || decl.type === 'fixvec') {
    const itemCodec = getCodecReference(decl.item || 'Bytes');
    return `export const ${className} = mol.vector(${itemCodec});\n`;
  } else if (decl.type === 'array') {
    // For arrays, create a fixed byte array codec like Byte32
    const size = getArraySize(decl);
    return `export const ${className} = mol.Codec.from({
  byteLength: ${size},
  encode: (value: ccc.BytesLike) => ccc.bytesFrom(value),
  decode: (buffer: ccc.BytesLike) => ccc.hexFrom(buffer)
});\n`;
  } else if (decl.type === 'option') {
    const itemCodec = getCodecReference(decl.item || 'Bytes');
    return `export const ${className} = mol.option(${itemCodec});\n`;
  }
  
  return '';
}

function generateCodecClass(decl: MoleculeDeclaration): string {
  const className = decl.name;
  
  let output = `export const ${className} = mol.${decl.type}({\n`;
  
  if (decl.fields && Array.isArray(decl.fields)) {
    decl.fields.forEach((field, index) => {
      // Special handling for status field which uses 'byte' type directly
      const fieldCodec = field.type === 'byte' ? 'mol.uint(1)' : getCodecReference(field.type);
      const comma = index < decl.fields!.length - 1 ? ',' : '';
      output += `  ${field.name}: ${fieldCodec}${comma}\n`;
    });
  }
  
  output += `});\n\n`;
  
  return output;
}

function generateIndexFile(): string {
  return `// Auto-generated exports for CKBoost molecule schema
// This file exports the TypeScript implementation

// Export all types and implementations
export * from './ckboost';
`;
}

// Main execution
async function main() {
  const jsonPath = path.join(__dirname, '../src/generated/ckboost.json');
  const outputPath = path.join(__dirname, '../src/generated/ckboost.ts');
  const indexPath = path.join(__dirname, '../src/generated/index.ts');

  try {
    // Check if input file exists
    if (!fs.existsSync(jsonPath)) {
      throw new Error('ckboost.json not found. Run molecule generation first.');
    }

    // Read JSON content
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    if (!jsonContent.trim()) {
      throw new Error('ckboost.json is empty');
    }

    // Generate TypeScript file
    console.log('Generating TypeScript types...');
    const typeScript = generateTypeScript(jsonContent);
    fs.writeFileSync(outputPath, typeScript);
    console.log(`✓ Generated ${outputPath}`);

    // Generate index file
    console.log('Generating index file...');
    const indexContent = generateIndexFile();
    fs.writeFileSync(indexPath, indexContent);
    console.log(`✓ Generated ${indexPath}`);

    // Remove old files that are no longer needed
    const oldFiles = [
      path.join(__dirname, '../src/generated/ckboost.d.ts'),
      path.join(__dirname, '../src/generated/ckboost.js'),
      path.join(__dirname, '../src/generated/ckboost-cjs.js'),
    ];
    
    for (const oldFile of oldFiles) {
      if (fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
        console.log(`✓ Removed ${path.basename(oldFile)}`);
      }
    }

    console.log('✅ TypeScript generation completed successfully!');
    
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
// In ESM, we check if the file was run directly using import.meta.url
const isMainModule = import.meta.url.startsWith('file:');
if (isMainModule) {
  main().catch(console.error);
}