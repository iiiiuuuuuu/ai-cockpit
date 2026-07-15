export function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function waitForServiceTransitionPaint() {
  return new Promise(resolve => {
    if (!window.requestAnimationFrame) {
      window.setTimeout(resolve, 0);
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

export async function waitForMinimumDuration(startedAt, minimumMs) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) await wait(remaining);
}

export async function waitForMinimumServiceTransition(startedAt, minimumMs) {
  await waitForMinimumDuration(startedAt, minimumMs);
}
