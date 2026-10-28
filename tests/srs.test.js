import test from 'node:test';

globalThis.print = console.log;

test('existing SRS and lifecycle regression checks', async () => {
  await import('./test_srs.js');
  await import('./test_simulation.js');
});
