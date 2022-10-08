import { resolve } from 'path';
import { getDevnetUrl } from './provider';
export const devnet = {
  load: async (id: string, snapshotResolutionPath = '.') => {
    const path = resolve(`.${id}.snapshot`, snapshotResolutionPath);
    await fetch(new URL('load', getDevnetUrl()), {
      method: 'POST',
      body: JSON.stringify({
        path,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
  dump: async (id: string, snapshotResolutionPath = '.') => {
    const path = resolve(`${id}.snapshot`, snapshotResolutionPath);
    await fetch(new URL('dump', getDevnetUrl()), {
      method: 'POST',
      body: JSON.stringify({
        path,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
  restart: async () => {
    await fetch(new URL('restart', getDevnetUrl()), {
      method: 'POST',
    });
  },
};
