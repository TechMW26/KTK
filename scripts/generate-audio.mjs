import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "public/audio");
const rate = 22050;

mkdirSync(output, { recursive: true });

function wave(frequency, time, type = "sine") {
  const phase = 2 * Math.PI * frequency * time;
  if (type === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (type === "soft-square") return Math.tanh(1.7 * Math.sin(phase));
  return Math.sin(phase);
}

function envelope(time, start, duration, attack = .04, release = .18) {
  if (time < start || time > start + duration) return 0;
  const local = time - start;
  const inGain = Math.min(1, local / attack);
  const outGain = Math.min(1, (duration - local) / release);
  return Math.max(0, Math.min(inGain, outGain));
}

function writeWave(name, duration, sample) {
  const count = Math.ceil(duration * rate);
  const dataBytes = count * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < count; index += 1) {
    const time = index / rate;
    const value = Math.max(-1, Math.min(1, sample(time)));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }
  writeFileSync(resolve(output, `${name}.wav`), buffer);
}

function sequence(notes, duration, voice = "triangle", strength = .42) {
  return (time) => notes.reduce((sum, [start, length, frequency, volume = 1]) => (
    sum + wave(frequency, time, voice) * envelope(time, start, length) * strength * volume
  ), 0) * envelope(time, 0, duration, .02, .25);
}

writeWave("background", 16, (time) => {
  const chords = [
    [146.83, 220, 293.66],
    [174.61, 261.63, 349.23],
    [130.81, 196, 261.63],
    [164.81, 246.94, 329.63],
  ];
  const segment = Math.floor(time / 4) % chords.length;
  const local = time % 4;
  const fade = Math.sin(Math.PI * Math.min(1, local / 4));
  const chord = chords[segment];
  const shimmer = Math.floor(time * 2) % chord.length;
  return (
    wave(chord[0] / 2, time) * .12 +
    wave(chord[0], time) * .1 * fade +
    wave(chord[1], time, "triangle") * .045 * fade +
    wave(chord[shimmer], time) * .035 * envelope(time, Math.floor(time * 2) / 2, .46, .03, .2)
  );
});

writeWave("start", 1.2, sequence([
  [0, .48, 196], [.12, .48, 246.94], [.24, .65, 293.66],
], 1.2));

writeWave("countdown", 1, (time) => (
  wave(104, time, "soft-square") * envelope(time, 0, .55) * .26 +
  wave(156, time, "triangle") * envelope(time, .12, .46) * .2
));

writeWave("king", 1.8, sequence([
  [0, .55, 261.63], [.12, .58, 329.63], [.24, .65, 392], [.38, .85, 523.25], [.58, .95, 783.99, .55],
], 1.8, "triangle", .44));

writeWave("wrong", 1.8, sequence([
  [0, .72, 220], [.18, .8, 174.61], [.38, 1.05, 130.81],
], 1.8, "soft-square", .36));

writeWave("bluff-open", 1.5, sequence([
  [0, 1.15, 146.83], [.15, 1.05, 207.65, .7], [.36, .75, 277.18, .35],
], 1.5, "sine", .34));

writeWave("bluff-caught", 2, sequence([
  [0, .55, 174.61], [.12, .6, 261.63], [.25, .68, 349.23], [.42, .9, 523.25], [.7, 1, 698.46, .55],
], 2, "triangle", .43));

writeWave("bluff-missed", 2, sequence([
  [0, .78, 277.18], [.2, .9, 207.65], [.45, 1.2, 138.59],
], 2, "soft-square", .35));

console.log(`Generated game audio in ${output}`);
