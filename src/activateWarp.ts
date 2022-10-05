import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const WARP_PATH = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@nethermindeth',
  'warp',
  'bin',
  'warp',
);

const WARP_VENV = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@nethermindeth',
  'warp',
  'warp_venv',
);

function activateWarp(warpPath = WARP_PATH, pythonBinary = 'python3.9') {
  const warpInstall = `${warpPath} install --python ${pythonBinary}`;
  if (!existsSync(WARP_VENV)) {
    console.log({ warpInstall });
    execSync(warpInstall);
  }
}

activateWarp();
