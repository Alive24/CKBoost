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

// Types that exist in CCC or mol that we should use directly
const BUILTIN_TYPES = new Set([
  // mol basic types
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
  // CKB types from CCC
  'Script',
  'OutPoint',
  'CellInput',
  'CellOutput',
  'CellDep',
  'RawTransaction',
  'Transaction',
  'WitnessArgs',
  'ScriptOpt',
  'ScriptVec',
  'CellDepVec',
  'CellInputVec',
  'CellOutputVec',
  'TransactionVec',
  // CKB client types
  'Header',
  'UncleBlock',
  'Block',
  'BlockV1'
]);


function generateTypeScript(jsonSchema: string): string {
  const schema: MoleculeSchema = JSON.parse(jsonSchema);
  
  let output = `// Auto-generated TypeScript types for CKBoost molecule schema
// This file uses CCC and mol types directly where available

`;

  // Collect custom types that need to be defined
  const customTypes = new Set<string>();
  
  // First pass: determine which types are custom
  schema.declarations.forEach(decl => {
    if (!BUILTIN_TYPES.has(decl.name)) {
      customTypes.add(decl.name);
    }
  });

  // Import from CCC
  output += `import { mol, ccc } from "@ckb-ccc/core";\n\n`;
  
  // No need to define codecs for basic types - we'll use them directly

  // Generate codec implementations for custom types in dependency order
  output += `// CKBoost molecule codec implementations\n`;

  
  // Build dependency graph for topological sort
  const dependencies = new Map<string, Set<string>>();
  const allTypes = new Set<string>();
  
  // First pass: collect all custom types
  schema.declarations.forEach(decl => {
    if (customTypes.has(decl.name)) {
      allTypes.add(decl.name);
      dependencies.set(decl.name, new Set());
    }
  });
  
  // Second pass: build dependency graph
  schema.declarations.forEach(decl => {
    if (!customTypes.has(decl.name)) return;
    
    const deps = dependencies.get(decl.name)!;
    
    if (decl.type === 'dynvec' || decl.type === 'fixvec') {
      // Vector depends on its item type
      if (decl.item && customTypes.has(decl.item)) {
        deps.add(decl.item);
      }
    } else if (decl.type === 'option') {
      // Option depends on its item type
      if (decl.item && customTypes.has(decl.item)) {
        deps.add(decl.item);
      }
    } else if ((decl.type === 'struct' || decl.type === 'table') && decl.fields) {
      // Struct/table depends on field types
      decl.fields.forEach(field => {
        // Extract base type from vectors
        let fieldType = field.type;
        if (fieldType.endsWith('Vec') && customTypes.has(fieldType)) {
          deps.add(fieldType);
        } else if (customTypes.has(fieldType)) {
          deps.add(fieldType);
        }
      });
    }
  });
  
  // Topological sort using Kahn's algorithm
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  
  function visit(type: string) {
    if (visited.has(type)) return;
    if (visiting.has(type)) {
      console.warn(`Circular dependency detected involving ${type}`);
      return;
    }
    
    visiting.add(type);
    const deps = dependencies.get(type);
    if (deps) {
      deps.forEach(dep => visit(dep));
    }
    visiting.delete(type);
    visited.add(type);
    sorted.push(type);
  }
  
  // Visit all types
  allTypes.forEach(type => visit(type));
  
  // Generate types in topologically sorted order
  sorted.forEach(typeName => {
    const decl = schema.declarations.find(d => d.name === typeName);
    if (decl) {
      output += generateCodecForDeclaration(decl);
    }
  });

  // Handle CKB client block types
  output += `\n// CKB client block type aliases\n`;
  output += `export type Header = ccc.ClientBlockHeaderLike;\n`;
  output += `export type UncleBlock = ccc.ClientBlockUncleLike;\n`;
  
  // UncleBlockVec can't use ClientBlockUncle directly as it's not a codec
  // We'll define it as a type alias for an array instead
  output += `export type UncleBlockVec = UncleBlock[];\n`;

  // Generate "Like" types for flexible input
  output += `\n// "Like" types for flexible input (similar to CCC pattern)\n`;
  customTypes.forEach(typeName => {
    if (typeName !== 'Header' && typeName !== 'UncleBlock' && typeName !== 'UncleBlockVec') {
      const decl = schema.declarations.find(d => d.name === typeName);
      if (decl && (decl.type === 'struct' || decl.type === 'table')) {
        output += generateLikeType(decl);
      }
    }
  });

  return output;
}

function generateLikeType(decl: MoleculeDeclaration): string {
  const typeName = decl.name;
  // Skip if it's a CCC built-in type
  if (['CellDep', 'CellInput', 'CellOutput', 'RawTransaction'].includes(typeName)) {
    return '';
  }
  
  let output = `export interface ${typeName}Like {\n`;
  
  if (decl.fields && Array.isArray(decl.fields)) {
    decl.fields.forEach(field => {
      const fieldName = field.name;
      const fieldType = getLikeFieldType(field.type);
      const isOptional = shouldFieldBeOptional();
      output += `  ${fieldName}${isOptional ? '?' : ''}: ${fieldType};\n`;
    });
  }
  
  output += `}\n\n`;
  return output;
}

function shouldFieldBeOptional(): boolean {
  // For custom types (structs and tables), NO fields should be optional
  // The encode functions expect all fields to be present
  // If we want to provide defaults, that should be done in helper functions, not in the type definition
  return false;
}

function getLikeFieldType(type: string): string {
  // Basic types
  if (type === 'byte') return 'ccc.NumLike';
  if (type === 'Uint8') return 'ccc.NumLike';
  if (type === 'Uint16') return 'ccc.NumLike';
  if (type === 'Uint32') return 'ccc.NumLike';
  if (type === 'Uint64') return 'ccc.NumLike';
  if (type === 'Uint128') return 'ccc.NumLike';
  if (type === 'Uint256') return 'ccc.NumLike';
  if (type === 'Byte32') return 'ccc.HexLike';
  if (type === 'Bytes') return 'ccc.BytesLike';
  
  // CCC types
  if (type === 'Script') return 'ccc.ScriptLike';
  if (type === 'OutPoint') return 'ccc.OutPointLike';
  if (type === 'CellInput') return 'ccc.CellInputLike';
  if (type === 'CellOutput') return 'ccc.CellOutputLike';
  if (type === 'CellDep') return 'ccc.CellDepLike';
  if (type === 'RawTransaction') return 'ccc.RawTransactionLike';
  if (type === 'Transaction') return 'ccc.TransactionLike';
  if (type === 'WitnessArgs') return 'ccc.WitnessArgsLike';
  
  // Vec types
  if (type === 'BytesOpt') return 'ccc.BytesLike | null';
  if (type === 'BytesVec') return 'ccc.BytesLike[]';
  if (type === 'Byte32Vec') return 'ccc.HexLike[]';
  if (type === 'Byte32Opt') return 'ccc.HexLike | null';
  if (type === 'ScriptOpt') return 'ccc.ScriptLike | null';
  if (type === 'ScriptVec') return 'ccc.ScriptLike[]';
  if (type === 'CellDepVec') return 'ccc.CellDepLike[]';
  if (type === 'CellInputVec') return 'ccc.CellInputLike[]';
  if (type === 'CellOutputVec') return 'ccc.CellOutputLike[]';
  if (type === 'Uint128Vec') return 'ccc.NumLike[]';
  
  // Custom vec types - add "Like" suffix to the item type
  if (type.endsWith('Vec')) {
    const baseType = type.slice(0, -3);
    return `${baseType}Like[]`;
  }
  if (type.endsWith('Opt')) {
    const baseType = type.slice(0, -3);
    return `${baseType}Like | null`;
  }
  
  // For custom types, add "Like" suffix
  return `${type}Like`;
}

function getCodecReference(type: string): string {
  if (type === 'byte') return 'mol.Uint8';
  
  // Basic mol types
  if (type === 'Uint8') return 'mol.Uint8';
  if (type === 'Uint16') return 'mol.Uint16';
  if (type === 'Uint32') return 'mol.Uint32';
  if (type === 'Uint64') return 'mol.Uint64';
  if (type === 'Uint128') return 'mol.Uint128';
  if (type === 'Uint256') return 'mol.Uint256';
  if (type === 'Byte32') return 'mol.Byte32';
  if (type === 'Bytes') return 'mol.Bytes';
  if (type === 'BytesOpt') return 'mol.BytesOpt';
  if (type === 'BytesVec') return 'mol.BytesVec';
  if (type === 'Byte32Vec') return 'mol.Byte32Vec';
  if (type === 'Byte32Opt') return 'mol.Byte32Opt';
  if (type === 'Uint128Vec') return 'mol.Uint128Vec';
  
  // CKB types from ccc
  if (type === 'Script') return 'ccc.Script';
  if (type === 'OutPoint') return 'ccc.OutPoint';
  if (type === 'CellInput') return 'ccc.CellInput';
  if (type === 'CellOutput') return 'ccc.CellOutput';
  if (type === 'CellDep') return 'ccc.CellDep';
  if (type === 'RawTransaction') return 'ccc.RawTransaction';
  if (type === 'Transaction') return 'ccc.Transaction';
  if (type === 'WitnessArgs') return 'ccc.WitnessArgs';
  
  // Vec types - return the expression to create them
  if (type === 'ScriptOpt') return 'mol.option(ccc.Script)';
  if (type === 'ScriptVec') return 'mol.vector(ccc.Script)';
  if (type === 'CellDepVec') return 'mol.vector(ccc.CellDep)';
  if (type === 'CellInputVec') return 'mol.vector(ccc.CellInput)';
  if (type === 'CellOutputVec') return 'mol.vector(ccc.CellOutput)';
  if (type === 'TransactionVec') return 'mol.vector(ccc.Transaction)';
  
  // Client block types - use CCC's client block types
  if (type === 'Header') return 'ccc.ClientBlockHeaderLike';
  if (type === 'UncleBlock') return 'ccc.ClientBlockUncleLike';
  
  // Custom types use their defined codec
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
    // Special handling for UncleBlockVec which uses client type
    if (className === 'UncleBlockVec') {
      // This will be defined later with client types
      return '';
    }
    const itemCodec = getCodecReference(decl.item || 'Bytes');
    return `export const ${className} = mol.vector(${itemCodec});\n`;
  } else if (decl.type === 'array') {
    // For arrays, use mol array
    const size = getArraySize(decl);
    return `export const ${className} = mol.array(mol.Uint8, ${size});\n`;
  } else if (decl.type === 'option') {
    const itemCodec = getCodecReference(decl.item || 'Bytes');
    return `export const ${className} = mol.option(${itemCodec});\n`;
  }
  
  return '';
}



function generateCodecClass(decl: MoleculeDeclaration): string {
  const className = decl.name;
  
  // Skip Header and UncleBlock as they will use CCC's client types
  if (className === 'Header' || className === 'UncleBlock') {
    return '';
  }
  
  // Generate the codec directly without the underscore pattern
  let output = `export const ${className} = mol.${decl.type}({\n`;
  
  if (decl.fields && Array.isArray(decl.fields)) {
    decl.fields.forEach((field, index) => {
      const fieldCodec = getCodecReference(field.type);
      const comma = index < decl.fields!.length - 1 ? ',' : '';
      output += `  ${field.name}: ${fieldCodec}${comma}\n`;
    });
  }
  
  output += `});\n`;
  
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