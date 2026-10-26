import fs from 'fs';
import path from 'path';

// DESIGN_SPEC: every colour comes from the theme file, none hard-coded in screens or components.
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

test.each(['app', 'components'].flatMap((d) => files(path.join(__dirname, '..', d))))('no hard-coded colour in %s', (file) => {
  expect(fs.readFileSync(file, 'utf8')).not.toMatch(COLOUR);
});
