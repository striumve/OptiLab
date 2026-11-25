/* Display palette for the visible spectrum, in sRGB. Anchor spacing follows
   the visible color bands rather than dividing the slider into equal hues. */
const spectrum = [
  [380, 107,  48, 184],
  [420, 116,  55, 246],
  [450,  58,  92, 255],
  [475,  32, 161, 255],
  [495,  25, 218, 202],
  [515,  50, 225, 112],
  [532,  85, 222,  54],
  [555, 167, 224,  36],
  [580, 247, 212,  38],
  [600, 255, 151,  38],
  [625, 255,  76,  42],
  [655, 239,  40,  48],
  [700, 201,  31,  48],
  [750, 152,  25,  46],
];

export function wavelengthColor(nm) {
  const wavelength = Math.max(380, Math.min(750, nm));
  const index = spectrum.findIndex(([anchor]) => anchor >= wavelength);
  const [start, ...from] = spectrum[Math.max(0, index - 1)];
  const [end, ...to] = spectrum[Math.max(1, index)];
  const fraction = (wavelength - start) / (end - start);
  const channels = from.map((channel, i) =>
    Math.round(channel + (to[i] - channel) * fraction).toString(16).padStart(2, '0')
  );
  return '#' + channels.join('');
}
