// A tiny checker shared by the tests.
let n = 0;
export function ok(cond, what) {
  n++;
  if (!cond) { console.error('not ok: ' + what); process.exitCode = 1; throw new Error(what); }
}
export const near = (a, b, tol, what) => ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (within ${tol})`);
export const done = () => console.log(`${n} checks`);
