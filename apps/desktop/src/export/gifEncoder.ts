/// Minimal animated GIF encoder: one global 256-colour palette (median cut over sample frames),
/// nearest-colour mapping through a 15-bit lookup table, and the classic GIF LZW compressor.

class ByteWriter {
  private buffer = new Uint8Array(1 << 20);
  length = 0;

  private reserve(extra: number) {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  byte(value: number) {
    this.reserve(1);
    this.buffer[this.length++] = value & 0xff;
  }

  word(value: number) {
    this.byte(value);
    this.byte(value >> 8);
  }

  bytes(values: ArrayLike<number>) {
    this.reserve(values.length);
    this.buffer.set(values, this.length);
    this.length += values.length;
  }

  text(value: string) {
    for (let index = 0; index < value.length; index++) this.byte(value.charCodeAt(index));
  }

  result(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

/// Median-cut palette from RGBA sample frames (every `step`-th pixel), at most 256 colours.
export function buildPalette(samples: readonly Uint8ClampedArray[], step = 3): Uint8Array {
  const colours: number[] = [];
  for (const pixels of samples)
    for (let offset = 0; offset < pixels.length; offset += 4 * step)
      colours.push((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
  if (!colours.length) colours.push(0);
  const channel = (colour: number, index: number) => (colour >> (16 - index * 8)) & 0xff;
  type Box = { from: number; to: number; spread: number; channel: number };
  const measure = (from: number, to: number): Box => {
    const low = [255, 255, 255];
    const high = [0, 0, 0];
    for (let index = from; index < to; index++)
      for (let c = 0; c < 3; c++) {
        const value = channel(colours[index], c);
        if (value < low[c]) low[c] = value;
        if (value > high[c]) high[c] = value;
      }
    const ranges = high.map((value, c) => value - low[c]);
    const widest = ranges.indexOf(Math.max(...ranges));
    return { from, to, spread: ranges[widest] * Math.sqrt(to - from), channel: widest };
  };
  const boxes: Box[] = [measure(0, colours.length)];
  while (boxes.length < 256) {
    let target = -1;
    for (let index = 0; index < boxes.length; index++)
      if (boxes[index].to - boxes[index].from > 1 && (target < 0 || boxes[index].spread > boxes[target].spread))
        target = index;
    if (target < 0 || boxes[target].spread === 0) break;
    const box = boxes[target];
    const sorted = colours.slice(box.from, box.to).sort((a, b) => channel(a, box.channel) - channel(b, box.channel));
    for (let index = 0; index < sorted.length; index++) colours[box.from + index] = sorted[index];
    const middle = box.from + (sorted.length >> 1);
    boxes.splice(target, 1, measure(box.from, middle), measure(middle, box.to));
  }
  const palette = new Uint8Array(256 * 3);
  boxes.forEach((box, index) => {
    const sum = [0, 0, 0];
    for (let item = box.from; item < box.to; item++) for (let c = 0; c < 3; c++) sum[c] += channel(colours[item], c);
    const count = Math.max(1, box.to - box.from);
    for (let c = 0; c < 3; c++) palette[index * 3 + c] = Math.round(sum[c] / count);
  });
  return palette;
}

const masks = [
  0x0000, 0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f, 0x00ff, 0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff,
  0x3fff, 0x7fff, 0xffff,
];

/// GIF-flavoured LZW (variable code width up to 12 bits, hashed dictionary), written as
/// 255-byte data sub-blocks followed by the block terminator.
function writeLzw(out: ByteWriter, pixels: Uint8Array, minCodeSize: number) {
  const bits = 12;
  const hashSize = 5003;
  const hashTable = new Int32Array(hashSize).fill(-1);
  const codeTable = new Int32Array(hashSize);
  const initBits = minCodeSize + 1;
  const clearCode = 1 << minCodeSize;
  const eofCode = clearCode + 1;
  let codeBits = initBits;
  let maxCode = (1 << codeBits) - 1;
  let freeEntry = clearCode + 2;
  let clearFlag = false;
  let accumulator = 0;
  let accumulatorBits = 0;
  const packet = new Uint8Array(255);
  let packetLength = 0;

  const flushPacket = () => {
    if (!packetLength) return;
    out.byte(packetLength);
    out.bytes(packet.subarray(0, packetLength));
    packetLength = 0;
  };
  const emitByte = (value: number) => {
    packet[packetLength++] = value;
    if (packetLength >= 255) flushPacket();
  };
  const emit = (code: number) => {
    accumulator &= masks[accumulatorBits];
    accumulator = accumulatorBits > 0 ? accumulator | (code << accumulatorBits) : code;
    accumulatorBits += codeBits;
    while (accumulatorBits >= 8) {
      emitByte(accumulator & 0xff);
      accumulator >>>= 8;
      accumulatorBits -= 8;
    }
    if (freeEntry > maxCode || clearFlag) {
      if (clearFlag) {
        codeBits = initBits;
        maxCode = (1 << codeBits) - 1;
        clearFlag = false;
      } else {
        codeBits++;
        maxCode = codeBits === bits ? 1 << bits : (1 << codeBits) - 1;
      }
    }
    if (code === eofCode) {
      while (accumulatorBits > 0) {
        emitByte(accumulator & 0xff);
        accumulator >>>= 8;
        accumulatorBits -= 8;
      }
      flushPacket();
    }
  };

  let hashShift = 0;
  for (let size = hashSize; size < 65536; size *= 2) hashShift++;
  hashShift = 8 - hashShift;

  out.byte(minCodeSize);
  emit(clearCode);
  let prefix = pixels[0];
  outer: for (let index = 1; index < pixels.length; index++) {
    const next = pixels[index];
    const fullCode = (next << bits) + prefix;
    let slot = (next << hashShift) ^ prefix;
    if (hashTable[slot] === fullCode) {
      prefix = codeTable[slot];
      continue;
    }
    if (hashTable[slot] >= 0) {
      const displacement = slot === 0 ? 1 : hashSize - slot;
      do {
        slot -= displacement;
        if (slot < 0) slot += hashSize;
        if (hashTable[slot] === fullCode) {
          prefix = codeTable[slot];
          continue outer;
        }
      } while (hashTable[slot] >= 0);
    }
    emit(prefix);
    prefix = next;
    if (freeEntry < 1 << bits) {
      codeTable[slot] = freeEntry++;
      hashTable[slot] = fullCode;
    } else {
      hashTable.fill(-1);
      freeEntry = clearCode + 2;
      clearFlag = true;
      emit(clearCode);
    }
  }
  emit(prefix);
  emit(eofCode);
  out.byte(0);
}

export class GifEncoder {
  private readonly out = new ByteWriter();
  private readonly lookup = new Uint8Array(32768);
  private readonly indices: Uint8Array;

  constructor(
    private readonly width: number,
    private readonly height: number,
    palette: Uint8Array,
  ) {
    this.indices = new Uint8Array(width * height);
    for (let key = 0; key < 32768; key++) {
      const r = ((key >> 10) & 31) * 8 + 4;
      const g = ((key >> 5) & 31) * 8 + 4;
      const b = (key & 31) * 8 + 4;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < 256; index++) {
        const dr = palette[index * 3] - r;
        const dg = palette[index * 3 + 1] - g;
        const db = palette[index * 3 + 2] - b;
        const distance = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      this.lookup[key] = best;
    }
    const out = this.out;
    out.text('GIF89a');
    out.word(width);
    out.word(height);
    out.byte(0xf7); // global colour table, 8-bit colour resolution, 256 entries
    out.byte(0);
    out.byte(0);
    out.bytes(palette);
    // Loop forever.
    out.bytes([0x21, 0xff, 0x0b]);
    out.text('NETSCAPE2.0');
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }

  /// Adds one RGBA frame shown for `delayCs` hundredths of a second.
  addFrame(pixels: Uint8ClampedArray, delayCs: number) {
    const { out, indices, lookup } = this;
    for (let pixel = 0, offset = 0; pixel < indices.length; pixel++, offset += 4)
      indices[pixel] =
        lookup[((pixels[offset] >> 3) << 10) | ((pixels[offset + 1] >> 3) << 5) | (pixels[offset + 2] >> 3)];
    out.bytes([0x21, 0xf9, 0x04, 0x04]);
    out.word(Math.max(2, Math.round(delayCs)));
    out.bytes([0x00, 0x00]);
    out.byte(0x2c);
    out.word(0);
    out.word(0);
    out.word(this.width);
    out.word(this.height);
    out.byte(0);
    writeLzw(out, indices, 8);
  }

  finish(): Uint8Array {
    this.out.byte(0x3b);
    return this.out.result();
  }
}
