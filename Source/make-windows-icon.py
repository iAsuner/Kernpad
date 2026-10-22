#!/usr/bin/env python3
"""Package the SVG renderer's PNG sizes into the Windows ICO container."""
from pathlib import Path
import struct
import sys

source, output = map(Path, sys.argv[1:3])
frames = [(size, (source / name).read_bytes()) for size, name in [
    (16, 'icon_16x16.png'), (32, 'icon_32x32.png'),
    (64, 'icon_32x32@2x.png'), (128, 'icon_128x128.png'),
    (256, 'icon_256x256.png')]]
offset = 6 + 16 * len(frames)
directory = bytearray(struct.pack('<HHH', 0, 1, len(frames)))
for size, data in frames:
    if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (size, size):
        raise ValueError('Unexpected icon frame')
    directory += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
output.write_bytes(directory + b''.join(data for _, data in frames))
