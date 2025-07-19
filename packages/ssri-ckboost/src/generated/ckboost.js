function dataLengthError(actual, required) {
    throw new Error(`Invalid data length! Required: ${required}, actual: ${actual}`);
}

function assertDataLength(actual, required) {
  if (actual !== required) {
    dataLengthError(actual, required);
  }
}

function assertArrayBuffer(reader) {
  if (reader instanceof Object && reader.toArrayBuffer instanceof Function) {
    reader = reader.toArrayBuffer();
  }
  if (!(reader instanceof ArrayBuffer)) {
    throw new Error("Provided value must be an ArrayBuffer or can be transformed into ArrayBuffer!");
  }
  return reader;
}

function verifyAndExtractOffsets(view, expectedFieldCount, compatible) {
  if (view.byteLength < 4) {
    dataLengthError(view.byteLength, ">4");
  }
  const requiredByteLength = view.getUint32(0, true);
  assertDataLength(view.byteLength, requiredByteLength);
  if (requiredByteLength === 4) {
    return [requiredByteLength];
  }
  if (requiredByteLength < 8) {
    dataLengthError(view.byteLength, ">8");
  }
  const firstOffset = view.getUint32(4, true);
  if (firstOffset % 4 !== 0 || firstOffset < 8) {
    throw new Error(`Invalid first offset: ${firstOffset}`);
  }
  const itemCount = firstOffset / 4 - 1;
  if (itemCount < expectedFieldCount) {
    throw new Error(`Item count not enough! Required: ${expectedFieldCount}, actual: ${itemCount}`);
  } else if ((!compatible) && itemCount > expectedFieldCount) {
    throw new Error(`Item count is more than required! Required: ${expectedFieldCount}, actual: ${itemCount}`);
  }
  if (requiredByteLength < firstOffset) {
    throw new Error(`First offset is larger than byte length: ${firstOffset}`);
  }
  const offsets = [];
  for (let i = 0; i < itemCount; i++) {
    const start = 4 + i * 4;
    offsets.push(view.getUint32(start, true));
  }
  offsets.push(requiredByteLength);
  for (let i = 0; i < offsets.length - 1; i++) {
    if (offsets[i] > offsets[i + 1]) {
      throw new Error(`Offset index ${i}: ${offsets[i]} is larger than offset index ${i + 1}: ${offsets[i + 1]}`);
    }
  }
  return offsets;
}

function serializeTable(buffers) {
  const itemCount = buffers.length;
  let totalSize = 4 * (itemCount + 1);
  const offsets = [];

  for (let i = 0; i < itemCount; i++) {
    offsets.push(totalSize);
    totalSize += buffers[i].byteLength;
  }

  const buffer = new ArrayBuffer(totalSize);
  const array = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint32(0, totalSize, true);
  for (let i = 0; i < itemCount; i++) {
    view.setUint32(4 + i * 4, offsets[i], true);
    array.set(new Uint8Array(buffers[i]), offsets[i]);
  }
  return buffer;
}

export class Uint32 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 4);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  toBigEndianUint32() {
    return this.view.getUint32(0, false);
  }

  toLittleEndianUint32() {
    return this.view.getUint32(0, true);
  }

  static size() {
    return 4;
  }
}

export function SerializeUint32(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 4);
  return buffer;
}

export class Uint64 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 8);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 8;
  }
}

export function SerializeUint64(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 8);
  return buffer;
}

export class Uint128 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 16);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 16;
  }
}

export function SerializeUint128(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 16);
  return buffer;
}

export class Byte32 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 32);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 32;
  }
}

export function SerializeByte32(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 32);
  return buffer;
}

export class Uint256 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 32);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 32;
  }
}

export function SerializeUint256(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 32);
  return buffer;
}

export class Bytes {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4")
    }
    const requiredByteLength = this.length() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
  }

  raw() {
    return this.view.buffer.slice(4);
  }

  indexAt(i) {
    return this.view.getUint8(4 + i);
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeBytes(value) {
  const item = assertArrayBuffer(value);
  const array = new Uint8Array(4 + item.byteLength);
  (new DataView(array.buffer)).setUint32(0, item.byteLength, true);
  array.set(new Uint8Array(item), 4);
  return array.buffer;
}

export class BytesOpt {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.hasValue()) {
      this.value().validate(compatible);
    }
  }

  value() {
    return new Bytes(this.view.buffer, { validate: false });
  }

  hasValue() {
    return this.view.byteLength > 0;
  }
}

export function SerializeBytesOpt(value) {
  if (value) {
    return SerializeBytes(value);
  } else {
    return new ArrayBuffer(0);
  }
}

export class BytesOptVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new BytesOpt(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new BytesOpt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeBytesOptVec(value) {
  return serializeTable(value.map(item => SerializeBytesOpt(item)));
}

export class BytesVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new Bytes(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeBytesVec(value) {
  return serializeTable(value.map(item => SerializeBytes(item)));
}

export class Byte32Vec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4");
    }
    const requiredByteLength = this.length() * Byte32.size() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
    for (let i = 0; i < 0; i++) {
      const item = this.indexAt(i);
      item.validate(compatible);
    }
  }

  indexAt(i) {
    return new Byte32(this.view.buffer.slice(4 + i * Byte32.size(), 4 + (i + 1) * Byte32.size()), { validate: false });
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeByte32Vec(value) {
  const array = new Uint8Array(4 + Byte32.size() * value.length);
  (new DataView(array.buffer)).setUint32(0, value.length, true);
  for (let i = 0; i < value.length; i++) {
    const itemBuffer = SerializeByte32(value[i]);
    array.set(new Uint8Array(itemBuffer), 4 + i * Byte32.size());
  }
  return array.buffer;
}

export class ScriptOpt {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.hasValue()) {
      this.value().validate(compatible);
    }
  }

  value() {
    return new Script(this.view.buffer, { validate: false });
  }

  hasValue() {
    return this.view.byteLength > 0;
  }
}

export function SerializeScriptOpt(value) {
  if (value) {
    return SerializeScript(value);
  } else {
    return new ArrayBuffer(0);
  }
}

export class ProposalShortId {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 10);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 10;
  }
}

export function SerializeProposalShortId(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 10);
  return buffer;
}

export class UncleBlockVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new UncleBlock(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new UncleBlock(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUncleBlockVec(value) {
  return serializeTable(value.map(item => SerializeUncleBlock(item)));
}

export class TransactionVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new Transaction(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new Transaction(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTransactionVec(value) {
  return serializeTable(value.map(item => SerializeTransaction(item)));
}

export class ProposalShortIdVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4");
    }
    const requiredByteLength = this.length() * ProposalShortId.size() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
    for (let i = 0; i < 0; i++) {
      const item = this.indexAt(i);
      item.validate(compatible);
    }
  }

  indexAt(i) {
    return new ProposalShortId(this.view.buffer.slice(4 + i * ProposalShortId.size(), 4 + (i + 1) * ProposalShortId.size()), { validate: false });
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeProposalShortIdVec(value) {
  const array = new Uint8Array(4 + ProposalShortId.size() * value.length);
  (new DataView(array.buffer)).setUint32(0, value.length, true);
  for (let i = 0; i < value.length; i++) {
    const itemBuffer = SerializeProposalShortId(value[i]);
    array.set(new Uint8Array(itemBuffer), 4 + i * ProposalShortId.size());
  }
  return array.buffer;
}

export class CellDepVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4");
    }
    const requiredByteLength = this.length() * CellDep.size() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
    for (let i = 0; i < 0; i++) {
      const item = this.indexAt(i);
      item.validate(compatible);
    }
  }

  indexAt(i) {
    return new CellDep(this.view.buffer.slice(4 + i * CellDep.size(), 4 + (i + 1) * CellDep.size()), { validate: false });
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeCellDepVec(value) {
  const array = new Uint8Array(4 + CellDep.size() * value.length);
  (new DataView(array.buffer)).setUint32(0, value.length, true);
  for (let i = 0; i < value.length; i++) {
    const itemBuffer = SerializeCellDep(value[i]);
    array.set(new Uint8Array(itemBuffer), 4 + i * CellDep.size());
  }
  return array.buffer;
}

export class CellInputVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4");
    }
    const requiredByteLength = this.length() * CellInput.size() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
    for (let i = 0; i < 0; i++) {
      const item = this.indexAt(i);
      item.validate(compatible);
    }
  }

  indexAt(i) {
    return new CellInput(this.view.buffer.slice(4 + i * CellInput.size(), 4 + (i + 1) * CellInput.size()), { validate: false });
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeCellInputVec(value) {
  const array = new Uint8Array(4 + CellInput.size() * value.length);
  (new DataView(array.buffer)).setUint32(0, value.length, true);
  for (let i = 0; i < value.length; i++) {
    const itemBuffer = SerializeCellInput(value[i]);
    array.set(new Uint8Array(itemBuffer), 4 + i * CellInput.size());
  }
  return array.buffer;
}

export class CellOutputVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new CellOutput(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new CellOutput(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCellOutputVec(value) {
  return serializeTable(value.map(item => SerializeCellOutput(item)));
}

export class Script {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    if (offsets[2] - offsets[1] !== 1) {
      throw new Error(`Invalid offset for hash_type: ${offsets[1]} - ${offsets[2]}`)
    }
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getCodeHash() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getHashType() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new DataView(this.view.buffer.slice(offset, offset_end)).getUint8(0);
  }

  getArgs() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeScript(value) {
  const buffers = [];
  buffers.push(SerializeByte32(value.code_hash));
  const hashTypeView = new DataView(new ArrayBuffer(1));
  hashTypeView.setUint8(0, value.hash_type);
  buffers.push(hashTypeView.buffer)
  buffers.push(SerializeBytes(value.args));
  return serializeTable(buffers);
}

export class OutPoint {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  getTxHash() {
    return new Byte32(this.view.buffer.slice(0, 0 + Byte32.size()), { validate: false });
  }

  getIndex() {
    return new Uint32(this.view.buffer.slice(0 + Byte32.size(), 0 + Byte32.size() + Uint32.size()), { validate: false });
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, OutPoint.size());
    this.getTxHash().validate(compatible);
    this.getIndex().validate(compatible);
  }
  static size() {
    return 0 + Byte32.size() + Uint32.size();
  }
}

export function SerializeOutPoint(value) {
  const array = new Uint8Array(0 + Byte32.size() + Uint32.size());
  const view = new DataView(array.buffer);
  array.set(new Uint8Array(SerializeByte32(value.tx_hash)), 0);
  array.set(new Uint8Array(SerializeUint32(value.index)), 0 + Byte32.size());
  return array.buffer;
}

export class CellInput {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  getSince() {
    return new Uint64(this.view.buffer.slice(0, 0 + Uint64.size()), { validate: false });
  }

  getPreviousOutput() {
    return new OutPoint(this.view.buffer.slice(0 + Uint64.size(), 0 + Uint64.size() + OutPoint.size()), { validate: false });
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, CellInput.size());
    this.getSince().validate(compatible);
    this.getPreviousOutput().validate(compatible);
  }
  static size() {
    return 0 + Uint64.size() + OutPoint.size();
  }
}

export function SerializeCellInput(value) {
  const array = new Uint8Array(0 + Uint64.size() + OutPoint.size());
  const view = new DataView(array.buffer);
  array.set(new Uint8Array(SerializeUint64(value.since)), 0);
  array.set(new Uint8Array(SerializeOutPoint(value.previous_output)), 0 + Uint64.size());
  return array.buffer;
}

export class CellOutput {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Uint64(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Script(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new ScriptOpt(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getCapacity() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getLock() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getType() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new ScriptOpt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCellOutput(value) {
  const buffers = [];
  buffers.push(SerializeUint64(value.capacity));
  buffers.push(SerializeScript(value.lock));
  buffers.push(SerializeScriptOpt(value.type_));
  return serializeTable(buffers);
}

export class CellDep {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  getOutPoint() {
    return new OutPoint(this.view.buffer.slice(0, 0 + OutPoint.size()), { validate: false });
  }

  getDepType() {
    return this.view.getUint8(0 + OutPoint.size());
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, CellDep.size());
    this.getOutPoint().validate(compatible);
  }
  static size() {
    return 0 + OutPoint.size() + 1;
  }
}

export function SerializeCellDep(value) {
  const array = new Uint8Array(0 + OutPoint.size() + 1);
  const view = new DataView(array.buffer);
  array.set(new Uint8Array(SerializeOutPoint(value.out_point)), 0);
  view.setUint8(0 + OutPoint.size(), value.dep_type);
  return array.buffer;
}

export class RawTransaction {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Uint32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new CellDepVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Byte32Vec(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new CellInputVec(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new CellOutputVec(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
  }

  getVersion() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCellDeps() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CellDepVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getHeaderDeps() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getInputs() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CellInputVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getOutputs() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CellOutputVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getOutputsData() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeRawTransaction(value) {
  const buffers = [];
  buffers.push(SerializeUint32(value.version));
  buffers.push(SerializeCellDepVec(value.cell_deps));
  buffers.push(SerializeByte32Vec(value.header_deps));
  buffers.push(SerializeCellInputVec(value.inputs));
  buffers.push(SerializeCellOutputVec(value.outputs));
  buffers.push(SerializeBytesVec(value.outputs_data));
  return serializeTable(buffers);
}

export class Transaction {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new RawTransaction(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getRaw() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new RawTransaction(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getWitnesses() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTransaction(value) {
  const buffers = [];
  buffers.push(SerializeRawTransaction(value.raw));
  buffers.push(SerializeBytesVec(value.witnesses));
  return serializeTable(buffers);
}

export class RawHeader {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  getVersion() {
    return new Uint32(this.view.buffer.slice(0, 0 + Uint32.size()), { validate: false });
  }

  getCompactTarget() {
    return new Uint32(this.view.buffer.slice(0 + Uint32.size(), 0 + Uint32.size() + Uint32.size()), { validate: false });
  }

  getTimestamp() {
    return new Uint64(this.view.buffer.slice(0 + Uint32.size() + Uint32.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size()), { validate: false });
  }

  getNumber() {
    return new Uint64(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size()), { validate: false });
  }

  getEpoch() {
    return new Uint64(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size()), { validate: false });
  }

  getParentHash() {
    return new Byte32(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size()), { validate: false });
  }

  getTransactionsRoot() {
    return new Byte32(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size()), { validate: false });
  }

  getProposalsHash() {
    return new Byte32(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size()), { validate: false });
  }

  getExtraHash() {
    return new Byte32(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size()), { validate: false });
  }

  getDao() {
    return new Byte32(this.view.buffer.slice(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size(), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size()), { validate: false });
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, RawHeader.size());
    this.getVersion().validate(compatible);
    this.getCompactTarget().validate(compatible);
    this.getTimestamp().validate(compatible);
    this.getNumber().validate(compatible);
    this.getEpoch().validate(compatible);
    this.getParentHash().validate(compatible);
    this.getTransactionsRoot().validate(compatible);
    this.getProposalsHash().validate(compatible);
    this.getExtraHash().validate(compatible);
    this.getDao().validate(compatible);
  }
  static size() {
    return 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size();
  }
}

export function SerializeRawHeader(value) {
  const array = new Uint8Array(0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size());
  const view = new DataView(array.buffer);
  array.set(new Uint8Array(SerializeUint32(value.version)), 0);
  array.set(new Uint8Array(SerializeUint32(value.compact_target)), 0 + Uint32.size());
  array.set(new Uint8Array(SerializeUint64(value.timestamp)), 0 + Uint32.size() + Uint32.size());
  array.set(new Uint8Array(SerializeUint64(value.number)), 0 + Uint32.size() + Uint32.size() + Uint64.size());
  array.set(new Uint8Array(SerializeUint64(value.epoch)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size());
  array.set(new Uint8Array(SerializeByte32(value.parent_hash)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size());
  array.set(new Uint8Array(SerializeByte32(value.transactions_root)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size());
  array.set(new Uint8Array(SerializeByte32(value.proposals_hash)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size());
  array.set(new Uint8Array(SerializeByte32(value.extra_hash)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size());
  array.set(new Uint8Array(SerializeByte32(value.dao)), 0 + Uint32.size() + Uint32.size() + Uint64.size() + Uint64.size() + Uint64.size() + Byte32.size() + Byte32.size() + Byte32.size() + Byte32.size());
  return array.buffer;
}

export class Header {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  getRaw() {
    return new RawHeader(this.view.buffer.slice(0, 0 + RawHeader.size()), { validate: false });
  }

  getNonce() {
    return new Uint128(this.view.buffer.slice(0 + RawHeader.size(), 0 + RawHeader.size() + Uint128.size()), { validate: false });
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, Header.size());
    this.getRaw().validate(compatible);
    this.getNonce().validate(compatible);
  }
  static size() {
    return 0 + RawHeader.size() + Uint128.size();
  }
}

export function SerializeHeader(value) {
  const array = new Uint8Array(0 + RawHeader.size() + Uint128.size());
  const view = new DataView(array.buffer);
  array.set(new Uint8Array(SerializeRawHeader(value.raw)), 0);
  array.set(new Uint8Array(SerializeUint128(value.nonce)), 0 + RawHeader.size());
  return array.buffer;
}

export class UncleBlock {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Header(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new ProposalShortIdVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getHeader() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Header(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProposals() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new ProposalShortIdVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUncleBlock(value) {
  const buffers = [];
  buffers.push(SerializeHeader(value.header));
  buffers.push(SerializeProposalShortIdVec(value.proposals));
  return serializeTable(buffers);
}

export class Block {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Header(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new UncleBlockVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new TransactionVec(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new ProposalShortIdVec(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
  }

  getHeader() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Header(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getUncles() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new UncleBlockVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTransactions() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new TransactionVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProposals() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new ProposalShortIdVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeBlock(value) {
  const buffers = [];
  buffers.push(SerializeHeader(value.header));
  buffers.push(SerializeUncleBlockVec(value.uncles));
  buffers.push(SerializeTransactionVec(value.transactions));
  buffers.push(SerializeProposalShortIdVec(value.proposals));
  return serializeTable(buffers);
}

export class BlockV1 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Header(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new UncleBlockVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new TransactionVec(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new ProposalShortIdVec(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
  }

  getHeader() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Header(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getUncles() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new UncleBlockVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTransactions() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new TransactionVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProposals() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new ProposalShortIdVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getExtension() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeBlockV1(value) {
  const buffers = [];
  buffers.push(SerializeHeader(value.header));
  buffers.push(SerializeUncleBlockVec(value.uncles));
  buffers.push(SerializeTransactionVec(value.transactions));
  buffers.push(SerializeProposalShortIdVec(value.proposals));
  buffers.push(SerializeBytes(value.extension));
  return serializeTable(buffers);
}

export class CellbaseWitness {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Script(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getLock() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getMessage() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCellbaseWitness(value) {
  const buffers = [];
  buffers.push(SerializeScript(value.lock));
  buffers.push(SerializeBytes(value.message));
  return serializeTable(buffers);
}

export class WitnessArgs {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new BytesOpt(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new BytesOpt(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new BytesOpt(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getLock() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new BytesOpt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getInputType() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new BytesOpt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getOutputType() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new BytesOpt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeWitnessArgs(value) {
  const buffers = [];
  buffers.push(SerializeBytesOpt(value.lock));
  buffers.push(SerializeBytesOpt(value.input_type));
  buffers.push(SerializeBytesOpt(value.output_type));
  return serializeTable(buffers);
}

export class Byte32Opt {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.hasValue()) {
      this.value().validate(compatible);
    }
  }

  value() {
    return new Byte32(this.view.buffer, { validate: false });
  }

  hasValue() {
    return this.view.byteLength > 0;
  }
}

export function SerializeByte32Opt(value) {
  if (value) {
    return SerializeByte32(value);
  } else {
    return new ArrayBuffer(0);
  }
}

export class ScriptVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new Script(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeScriptVec(value) {
  return serializeTable(value.map(item => SerializeScript(item)));
}

export class Uint128Vec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    if (this.view.byteLength < 4) {
      dataLengthError(this.view.byteLength, ">4");
    }
    const requiredByteLength = this.length() * Uint128.size() + 4;
    assertDataLength(this.view.byteLength, requiredByteLength);
    for (let i = 0; i < 0; i++) {
      const item = this.indexAt(i);
      item.validate(compatible);
    }
  }

  indexAt(i) {
    return new Uint128(this.view.buffer.slice(4 + i * Uint128.size(), 4 + (i + 1) * Uint128.size()), { validate: false });
  }

  length() {
    return this.view.getUint32(0, true);
  }
}

export function SerializeUint128Vec(value) {
  const array = new Uint8Array(4 + Uint128.size() * value.length);
  (new DataView(array.buffer)).setUint32(0, value.length, true);
  for (let i = 0; i < value.length; i++) {
    const itemBuffer = SerializeUint128(value[i]);
    array.set(new Uint8Array(itemBuffer), 4 + i * Uint128.size());
  }
  return array.buffer;
}

export class Uint8 {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    assertDataLength(this.view.byteLength, 1);
  }

  indexAt(i) {
    return this.view.getUint8(i);
  }

  raw() {
    return this.view.buffer;
  }

  static size() {
    return 1;
  }
}

export function SerializeUint8(value) {
  const buffer = assertArrayBuffer(value);
  assertDataLength(buffer.byteLength, 1);
  return buffer;
}

export class UDTFunding {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Script(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Uint128(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getUdtScript() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getAmount() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint128(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUDTFunding(value) {
  const buffers = [];
  buffers.push(SerializeScript(value.udt_script));
  buffers.push(SerializeUint128(value.amount));
  return serializeTable(buffers);
}

export class UDTFundingVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new UDTFunding(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new UDTFunding(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUDTFundingVec(value) {
  return serializeTable(value.map(item => SerializeUDTFunding(item)));
}

export class AssetList {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Uint64(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new ScriptVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new UDTFundingVec(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getCkbAmount() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getNftAssets() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new ScriptVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getUdtAssets() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new UDTFundingVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeAssetList(value) {
  const buffers = [];
  buffers.push(SerializeUint64(value.ckb_amount));
  buffers.push(SerializeScriptVec(value.nft_assets));
  buffers.push(SerializeUDTFundingVec(value.udt_assets));
  return serializeTable(buffers);
}

export class AssetListVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new AssetList(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new AssetList(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeAssetListVec(value) {
  return serializeTable(value.map(item => SerializeAssetList(item)));
}

export class QuestSubTaskData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Uint8(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
  }

  getId() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTitle() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getType() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDescription() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProofRequired() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeQuestSubTaskData(value) {
  const buffers = [];
  buffers.push(SerializeUint8(value.id));
  buffers.push(SerializeBytes(value.title));
  buffers.push(SerializeBytes(value.type));
  buffers.push(SerializeBytes(value.description));
  buffers.push(SerializeBytes(value.proof_required));
  return serializeTable(buffers);
}

export class QuestSubTaskDataVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new QuestSubTaskData(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new QuestSubTaskData(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeQuestSubTaskDataVec(value) {
  return serializeTable(value.map(item => SerializeQuestSubTaskData(item)));
}

export class CompletionRecord {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Bytes(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Uint8(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
  }

  getUserAddress() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getSubTaskId() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletionTimestamp() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletionContent() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCompletionRecord(value) {
  const buffers = [];
  buffers.push(SerializeBytes(value.user_address));
  buffers.push(SerializeUint8(value.sub_task_id));
  buffers.push(SerializeUint64(value.completion_timestamp));
  buffers.push(SerializeBytes(value.completion_content));
  return serializeTable(buffers);
}

export class CompletionRecordVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new CompletionRecord(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new CompletionRecord(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCompletionRecordVec(value) {
  return serializeTable(value.map(item => SerializeCompletionRecord(item)));
}

export class QuestData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new AssetListVec(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
    new CompletionRecordVec(this.view.buffer.slice(offsets[6], offsets[7]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[7], offsets[8]), { validate: false }).validate();
    if (offsets[9] - offsets[8] !== 1) {
      throw new Error(`Invalid offset for status: ${offsets[8]} - ${offsets[9]}`)
    }
    new QuestSubTaskDataVec(this.view.buffer.slice(offsets[9], offsets[10]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[10], offsets[11]), { validate: false }).validate();
    new Uint8(this.view.buffer.slice(offsets[11], offsets[12]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[12], offsets[13]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[13], offsets[14]), { validate: false }).validate();
  }

  getId() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCampaignId() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTitle() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDescription() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getRequirements() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getRewardsOnCompletion() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new AssetListVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletionRecords() {
    const start = 28;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CompletionRecordVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletionDeadline() {
    const start = 32;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getStatus() {
    const start = 36;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new DataView(this.view.buffer.slice(offset, offset_end)).getUint8(0);
  }

  getSubTasks() {
    const start = 40;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new QuestSubTaskDataVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getPoints() {
    const start = 44;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDifficulty() {
    const start = 48;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTimeEstimate() {
    const start = 52;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletionCount() {
    const start = 56;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeQuestData(value) {
  const buffers = [];
  buffers.push(SerializeByte32(value.id));
  buffers.push(SerializeByte32(value.campaign_id));
  buffers.push(SerializeBytes(value.title));
  buffers.push(SerializeBytes(value.description));
  buffers.push(SerializeBytes(value.requirements));
  buffers.push(SerializeAssetListVec(value.rewards_on_completion));
  buffers.push(SerializeCompletionRecordVec(value.completion_records));
  buffers.push(SerializeUint64(value.completion_deadline));
  const statusView = new DataView(new ArrayBuffer(1));
  statusView.setUint8(0, value.status);
  buffers.push(statusView.buffer)
  buffers.push(SerializeQuestSubTaskDataVec(value.sub_tasks));
  buffers.push(SerializeUint32(value.points));
  buffers.push(SerializeUint8(value.difficulty));
  buffers.push(SerializeUint32(value.time_estimate));
  buffers.push(SerializeUint32(value.completion_count));
  return serializeTable(buffers);
}

export class QuestDataVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new QuestData(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new QuestData(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeQuestDataVec(value) {
  return serializeTable(value.map(item => SerializeQuestData(item)));
}

export class SponsorInfo {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Bytes(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Uint8(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
  }

  getName() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDescription() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getWebsite() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getSocialLinks() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getVerified() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeSponsorInfo(value) {
  const buffers = [];
  buffers.push(SerializeBytes(value.name));
  buffers.push(SerializeBytes(value.description));
  buffers.push(SerializeBytes(value.website));
  buffers.push(SerializeBytesVec(value.social_links));
  buffers.push(SerializeUint8(value.verified));
  return serializeTable(buffers);
}

export class CampaignMetadata {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new AssetListVec(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[6], offsets[7]), { validate: false }).validate();
    new Uint8(this.view.buffer.slice(offsets[7], offsets[8]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[8], offsets[9]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[9], offsets[10]), { validate: false }).validate();
  }

  getFundingInfo() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new AssetListVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCreatedAt() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getStartingTime() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getEndingTime() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getVerificationRequirements() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getLastUpdated() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCategories() {
    const start = 28;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDifficulty() {
    const start = 32;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getImageCid() {
    const start = 36;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getRules() {
    const start = 40;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCampaignMetadata(value) {
  const buffers = [];
  buffers.push(SerializeAssetListVec(value.funding_info));
  buffers.push(SerializeUint64(value.created_at));
  buffers.push(SerializeUint64(value.starting_time));
  buffers.push(SerializeUint64(value.ending_time));
  buffers.push(SerializeUint32(value.verification_requirements));
  buffers.push(SerializeUint64(value.last_updated));
  buffers.push(SerializeBytesVec(value.categories));
  buffers.push(SerializeUint8(value.difficulty));
  buffers.push(SerializeBytes(value.image_cid));
  buffers.push(SerializeBytesVec(value.rules));
  return serializeTable(buffers);
}

export class CampaignData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Script(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new CampaignMetadata(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    if (offsets[4] - offsets[3] !== 1) {
      throw new Error(`Invalid offset for status: ${offsets[3]} - ${offsets[4]}`)
    }
    new QuestDataVec(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[6], offsets[7]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[7], offsets[8]), { validate: false }).validate();
    new SponsorInfo(this.view.buffer.slice(offsets[8], offsets[9]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[9], offsets[10]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[10], offsets[11]), { validate: false }).validate();
  }

  getId() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCreator() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getMetadata() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CampaignMetadata(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getStatus() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new DataView(this.view.buffer.slice(offset, offset_end)).getUint8(0);
  }

  getQuests() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new QuestDataVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTitle() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getShortDescription() {
    const start = 28;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getLongDescription() {
    const start = 32;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getSponsorInfo() {
    const start = 36;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new SponsorInfo(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getParticipantsCount() {
    const start = 40;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTotalCompletions() {
    const start = 44;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCampaignData(value) {
  const buffers = [];
  buffers.push(SerializeByte32(value.id));
  buffers.push(SerializeScript(value.creator));
  buffers.push(SerializeCampaignMetadata(value.metadata));
  const statusView = new DataView(new ArrayBuffer(1));
  statusView.setUint8(0, value.status);
  buffers.push(statusView.buffer)
  buffers.push(SerializeQuestDataVec(value.quests));
  buffers.push(SerializeBytes(value.title));
  buffers.push(SerializeBytes(value.short_description));
  buffers.push(SerializeBytes(value.long_description));
  buffers.push(SerializeSponsorInfo(value.sponsor_info));
  buffers.push(SerializeUint32(value.participants_count));
  buffers.push(SerializeUint32(value.total_completions));
  return serializeTable(buffers);
}

export class CampaignDataVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new CampaignData(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new CampaignData(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeCampaignDataVec(value) {
  return serializeTable(value.map(item => SerializeCampaignData(item)));
}

export class UserVerificationData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Bytes(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Uint128(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getUserAddress() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTelegramPersonalChatId() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint128(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getIdentityVerificationData() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUserVerificationData(value) {
  const buffers = [];
  buffers.push(SerializeBytes(value.user_address));
  buffers.push(SerializeUint128(value.telegram_personal_chat_id));
  buffers.push(SerializeBytes(value.identity_verification_data));
  return serializeTable(buffers);
}

export class TippingProposalMetadata {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Bytes(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new BytesVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
  }

  getContributionTitle() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getContributionTypeTags() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new BytesVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDescription() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProposalCreationTimestamp() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTippingProposalMetadata(value) {
  const buffers = [];
  buffers.push(SerializeBytes(value.contribution_title));
  buffers.push(SerializeBytesVec(value.contribution_type_tags));
  buffers.push(SerializeBytes(value.description));
  buffers.push(SerializeUint64(value.proposal_creation_timestamp));
  return serializeTable(buffers);
}

export class TippingProposalData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Bytes(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new TippingProposalMetadata(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Byte32Opt(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new Byte32Vec(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
  }

  getTargetAddress() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProposerLockHash() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getMetadata() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new TippingProposalMetadata(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getAmount() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTippingTransactionHash() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32Opt(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getApprovalTransactionHash() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTippingProposalData(value) {
  const buffers = [];
  buffers.push(SerializeBytes(value.target_address));
  buffers.push(SerializeByte32(value.proposer_lock_hash));
  buffers.push(SerializeTippingProposalMetadata(value.metadata));
  buffers.push(SerializeUint64(value.amount));
  buffers.push(SerializeByte32Opt(value.tipping_transaction_hash));
  buffers.push(SerializeByte32Vec(value.approval_transaction_hash));
  return serializeTable(buffers);
}

export class TippingProposalDataVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new TippingProposalData(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new TippingProposalData(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTippingProposalDataVec(value) {
  return serializeTable(value.map(item => SerializeTippingProposalData(item)));
}

export class EndorserInfo {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getEndorserLockHash() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getEndorserName() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getEndorserDescription() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeEndorserInfo(value) {
  const buffers = [];
  buffers.push(SerializeByte32(value.endorser_lock_hash));
  buffers.push(SerializeBytes(value.endorser_name));
  buffers.push(SerializeBytes(value.endorser_description));
  return serializeTable(buffers);
}

export class EndorserInfoVec {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    for (let i = 0; i < offsets.length - 1; i++) {
      new EndorserInfo(this.view.buffer.slice(offsets[i], offsets[i + 1]), { validate: false }).validate();
    }
  }

  length() {
    if (this.view.byteLength < 8) {
      return 0;
    } else {
      return this.view.getUint32(4, true) / 4 - 1;
    }
  }

  indexAt(i) {
    const start = 4 + i * 4;
    const offset = this.view.getUint32(start, true);
    let offset_end = this.view.byteLength;
    if (i + 1 < this.length()) {
      offset_end = this.view.getUint32(start + 4, true);
    }
    return new EndorserInfo(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeEndorserInfoVec(value) {
  return serializeTable(value.map(item => SerializeEndorserInfo(item)));
}

export class TippingConfig {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Uint128Vec(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getApprovalRequirementThresholds() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint128Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getExpirationDuration() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTippingConfig(value) {
  const buffers = [];
  buffers.push(SerializeUint128Vec(value.approval_requirement_thresholds));
  buffers.push(SerializeUint64(value.expiration_duration));
  return serializeTable(buffers);
}

export class ScriptCodeHashes {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new Byte32Vec(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
    new Byte32Vec(this.view.buffer.slice(offsets[6], offsets[7]), { validate: false }).validate();
  }

  getCkbBoostProtocolTypeCodeHash() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCkbBoostProtocolLockCodeHash() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCkbBoostCampaignTypeCodeHash() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCkbBoostCampaignLockCodeHash() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCkbBoostUserTypeCodeHash() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getAcceptedUdtTypeCodeHashes() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getAcceptedDobTypeCodeHashes() {
    const start = 28;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeScriptCodeHashes(value) {
  const buffers = [];
  buffers.push(SerializeByte32(value.ckb_boost_protocol_type_code_hash));
  buffers.push(SerializeByte32(value.ckb_boost_protocol_lock_code_hash));
  buffers.push(SerializeByte32(value.ckb_boost_campaign_type_code_hash));
  buffers.push(SerializeByte32(value.ckb_boost_campaign_lock_code_hash));
  buffers.push(SerializeByte32(value.ckb_boost_user_type_code_hash));
  buffers.push(SerializeByte32Vec(value.accepted_udt_type_code_hashes));
  buffers.push(SerializeByte32Vec(value.accepted_dob_type_code_hashes));
  return serializeTable(buffers);
}

export class ProtocolConfig {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Byte32Vec(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new ScriptCodeHashes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
  }

  getAdminLockHashVec() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getScriptCodeHashes() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new ScriptCodeHashes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeProtocolConfig(value) {
  const buffers = [];
  buffers.push(SerializeByte32Vec(value.admin_lock_hash_vec));
  buffers.push(SerializeScriptCodeHashes(value.script_code_hashes));
  return serializeTable(buffers);
}

export class ProtocolData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new CampaignDataVec(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new TippingProposalDataVec(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new TippingConfig(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new EndorserInfoVec(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
    new ProtocolConfig(this.view.buffer.slice(offsets[5], offsets[6]), { validate: false }).validate();
  }

  getCampaignsApproved() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new CampaignDataVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTippingProposals() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new TippingProposalDataVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTippingConfig() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new TippingConfig(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getEndorsersWhitelist() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new EndorserInfoVec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getLastUpdated() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getProtocolConfig() {
    const start = 24;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new ProtocolConfig(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeProtocolData(value) {
  const buffers = [];
  buffers.push(SerializeCampaignDataVec(value.campaigns_approved));
  buffers.push(SerializeTippingProposalDataVec(value.tipping_proposals));
  buffers.push(SerializeTippingConfig(value.tipping_config));
  buffers.push(SerializeEndorserInfoVec(value.endorsers_whitelist));
  buffers.push(SerializeUint64(value.last_updated));
  buffers.push(SerializeProtocolConfig(value.protocol_config));
  return serializeTable(buffers);
}

export class UserProgressData {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Script(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Byte32(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Byte32Vec(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
    new Uint32(this.view.buffer.slice(offsets[3], offsets[4]), { validate: false }).validate();
    new Uint64(this.view.buffer.slice(offsets[4], offsets[5]), { validate: false }).validate();
  }

  getUserLockScript() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCampaignId() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getCompletedQuestIds() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Byte32Vec(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getTotalPointsEarned() {
    const start = 16;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Uint32(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getLastActivityTimestamp() {
    const start = 20;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint64(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeUserProgressData(value) {
  const buffers = [];
  buffers.push(SerializeScript(value.user_lock_script));
  buffers.push(SerializeByte32(value.campaign_id));
  buffers.push(SerializeByte32Vec(value.completed_quest_ids));
  buffers.push(SerializeUint32(value.total_points_earned));
  buffers.push(SerializeUint64(value.last_activity_timestamp));
  return serializeTable(buffers);
}

export class TokenRewardInfo {
  constructor(reader, { validate = true } = {}) {
    this.view = new DataView(assertArrayBuffer(reader));
    if (validate) {
      this.validate();
    }
  }

  validate(compatible = false) {
    const offsets = verifyAndExtractOffsets(this.view, 0, true);
    new Script(this.view.buffer.slice(offsets[0], offsets[1]), { validate: false }).validate();
    new Bytes(this.view.buffer.slice(offsets[1], offsets[2]), { validate: false }).validate();
    new Uint8(this.view.buffer.slice(offsets[2], offsets[3]), { validate: false }).validate();
  }

  getUdtScript() {
    const start = 4;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Script(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getSymbol() {
    const start = 8;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.getUint32(start + 4, true);
    return new Bytes(this.view.buffer.slice(offset, offset_end), { validate: false });
  }

  getDecimals() {
    const start = 12;
    const offset = this.view.getUint32(start, true);
    const offset_end = this.view.byteLength;
    return new Uint8(this.view.buffer.slice(offset, offset_end), { validate: false });
  }
}

export function SerializeTokenRewardInfo(value) {
  const buffers = [];
  buffers.push(SerializeScript(value.udt_script));
  buffers.push(SerializeBytes(value.symbol));
  buffers.push(SerializeUint8(value.decimals));
  return serializeTable(buffers);
}

