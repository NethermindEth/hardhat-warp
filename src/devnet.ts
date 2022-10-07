export const devnet = {
  load: async (id: string) => {
    if (process.env.STARKNET_PROVIDER_BASE_URL === undefined)
      throw new Error('load only supported on local devnet');
    await fetch(new URL('load', process.env.STARKNET_PROVIDER_BASE_URL), {
      method: 'POST',
      body: JSON.stringify({
        path: `.${id}.snapshot`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
  dump: async (id: string) => {
    if (process.env.STARKNET_PROVIDER_BASE_URL === undefined)
      throw new Error('dump only supported on local devnet');
    await fetch(new URL('dump', process.env.STARKNET_PROVIDER_BASE_URL), {
      method: 'POST',
      body: JSON.stringify({
        path: `.${id}.snapshot`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
  restart: async () => {
    if (process.env.STARKNET_PROVIDER_BASE_URL === undefined)
      throw new Error('restart only supported on local devnet');
    await fetch(new URL('restart', process.env.STARKNET_PROVIDER_BASE_URL), {
      method: 'POST',
    });
  },
};
