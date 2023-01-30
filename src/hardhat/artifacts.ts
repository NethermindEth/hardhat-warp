import fs from 'fs';
import fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  Artifact,
  Artifacts as IArtifacts,
  BuildInfo,
  CompilerInput,
  CompilerOutput,
} from 'hardhat/types';
import {
  getFullyQualifiedName,
  isFullyQualifiedName,
  parseFullyQualifiedName,
  findDistance,
} from 'hardhat/utils/contract-names';
import { replaceBackslashes } from 'hardhat/utils/source-names';

import { EDIT_DISTANCE_THRESHOLD } from 'hardhat/internal/constants';
import { HardhatError } from 'hardhat/internal/core/errors';
import { ERRORS } from 'hardhat/internal/core/errors-list';
import { glob, globSync } from 'hardhat/internal/util/glob';
import { json } from 'starknet';

export class Artifacts implements IArtifacts {
  private _validArtifacts: Array<{ sourceName: string; artifacts: string[] }>;

  constructor(private _artifactsPath: string) {
    this._validArtifacts = [];
  }

  public addValidArtifacts(validArtifacts: Array<{ sourceName: string; artifacts: string[] }>) {
    this._validArtifacts.push(...validArtifacts);
  }

  public async readArtifact(name: string): Promise<Artifact> {
    const artifactPath = await this.getArtifactPath(name);
    const compiledArtifact = await fsExtra.readJson(artifactPath);
    return {
      _format: "I don't know what this is",
      contractName: name,
      sourceName: name,
      abi: compiledArtifact['abi'],
      bytecode: compiledArtifact['program']['data'],
      deployedBytecode: '',
      linkReferences: {},
      deployedLinkReferences: {},
    };
  }

  public readArtifactSync(name: string): Artifact {
    const artifactPath = this._getArtifactPathSync(name);
    const compiledArtifact = fsExtra.readJsonSync(artifactPath);
    return {
      _format: "I don't know what this is",
      contractName: name,
      sourceName: name,
      abi: compiledArtifact['abi'],
      bytecode: compiledArtifact['program']['data'],
      deployedBytecode: '',
      linkReferences: {},
      deployedLinkReferences: {},
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getArtifactAbi(name: string): Promise<any> {
    const artifactPath = await this.getArtifactPath(name);
    // This is pure laziness and needs to be made more reliable in the long term
    const abiPath = artifactPath.replace(/_compiled\.json$/, '_sol_abi.json');
    return fsExtra.readJson(abiPath);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getArtifact(name: string): Promise<any> {
    const artifactPath = this._getArtifactPathSync(name);
    return json.parse(fs.readFileSync(artifactPath).toString('ascii'));
  }

  public async artifactExists(name: string): Promise<boolean> {
    try {
      await this.readArtifact(name);
      return true;
    } catch {
      return false;
    }
  }

  public async getAllFullyQualifiedNames(): Promise<string[]> {
    const paths = await this.getArtifactPaths();
    return paths.map((p) => this._getFullyQualifiedNameFromPath(p)).sort();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getBuildInfo(fullyQualifiedName: string): Promise<BuildInfo | undefined> {
    throw Error('Not implemented yet');
  }

  public async getArtifactPaths(): Promise<string[]> {
    const paths = await glob(path.join(this._artifactsPath, '**/*_compiled.json'));

    return paths.sort();
  }

  public async getBuildInfoPaths(): Promise<string[]> {
    throw Error('Not implemented yet');
  }

  public async getDebugFilePaths(): Promise<string[]> {
    throw Error('Not implemented yet');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async saveArtifactAndDebugFile(artifact: Artifact, pathToBuildInfo?: string) {
    // We expect warp transpile to write the artifacts
  }

  public async saveBuildInfo(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    solcVersion: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    solcLongVersion: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    input: CompilerInput,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    output: CompilerOutput,
  ): Promise<string> {
    // We don't do anything here because we don't support it yet
    return Promise.resolve('');
  }

  /**
   * Remove all artifacts that don't correspond to the current solidity files
   */
  public async removeObsoleteArtifacts() {
    const validArtifactsPaths = new Set<string>();

    for (const { sourceName, artifacts } of this._validArtifacts) {
      for (const artifactName of artifacts) {
        validArtifactsPaths.add(
          this._getArtifactPathSync(getFullyQualifiedName(sourceName, artifactName)),
        );
      }
    }

    const existingArtifactsPaths = await this.getArtifactPaths();

    for (const artifactPath of existingArtifactsPaths) {
      if (!validArtifactsPaths.has(artifactPath)) {
        await this._removeArtifactFiles(artifactPath);
      }
    }

    // await this._removeObsoleteBuildInfos();
  }
  /**
   * Returns the absolute path to the given artifact
   */
  public formArtifactPathFromFullyQualifiedName(fullyQualifiedName: string): string {
    const { sourceName, contractName } = parseFullyQualifiedName(fullyQualifiedName);

    return path.join(this._artifactsPath, sourceName, `${contractName}_compiled.json`);
  }

  /**
   * Returns the absolute path to the artifact that corresponds to the given
   * name.
   *
   * If the name is fully qualified, the path is computed from it.  If not, an
   * artifact that matches the given name is searched in the existing artifacts.
   * If there is an ambiguity, an error is thrown.
   */
  public async getArtifactPath(name: string): Promise<string> {
    if (isFullyQualifiedName(name)) {
      return this._getValidArtifactPathFromFullyQualifiedName(name);
    }

    const files = await this.getArtifactPaths();
    return this._getArtifactPathFromFiles(name, files);
  }

  private _getArtifactPathsSync(): string[] {
    const paths = globSync(path.join(this._artifactsPath, '**/*_compiled.json'));
    return paths.sort();
  }

  /**
   * Sync version of _getArtifactPath
   */
  private _getArtifactPathSync(name: string): string {
    if (isFullyQualifiedName(name)) {
      return this._getValidArtifactPathFromFullyQualifiedNameSync(name);
    }

    const files = this._getArtifactPathsSync();
    return this._getArtifactPathFromFiles(name, files);
  }

  /**
   * Same signature as imported function, but abstracted to handle the only error we consistently care about
   */
  private async _trueCasePath(filePath: string, basePath?: string): Promise<string | null> {
    const { trueCasePath } = await import('true-case-path');

    try {
      const result = await trueCasePath(filePath, basePath);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('no matching file exists')) {
          return null;
        }
      }

      throw error;
    }
  }

  /**
   * Same signature as imported function, but abstracted to handle the only error we consistently care about
   * and synchronous
   */
  private _trueCasePathSync(filePath: string, basePath?: string): string | null {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { trueCasePathSync } = require('true-case-path');

    try {
      const result = trueCasePathSync(filePath, basePath);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('no matching file exists')) {
          return null;
        }
      }

      throw error;
    }
  }

  /**
   * DO NOT DELETE OR CHANGE
   *
   * use this.formArtifactPathFromFullyQualifiedName instead
   * @deprecated until typechain migrates to public version
   * @see https://github.com/dethcrypto/TypeChain/issues/544
   */
  private _getArtifactPathFromFullyQualifiedName(fullyQualifiedName: string): string {
    const { sourceName, contractName } = parseFullyQualifiedName(fullyQualifiedName);

    return path.join(this._artifactsPath, sourceName, `${contractName}_compiled.json`);
  }

  private async _getValidArtifactPathFromFullyQualifiedName(
    fullyQualifiedName: string,
  ): Promise<string> {
    const artifactPath = this.formArtifactPathFromFullyQualifiedName(fullyQualifiedName);

    const trueCaseArtifactPath = await this._trueCasePath(
      path.relative(this._artifactsPath, artifactPath),
      this._artifactsPath,
    );

    if (trueCaseArtifactPath === null) {
      return this._handleWrongArtifactForFullyQualifiedName(fullyQualifiedName);
    }

    if (artifactPath !== trueCaseArtifactPath) {
      throw new HardhatError(ERRORS.ARTIFACTS.WRONG_CASING, {
        correct: trueCaseArtifactPath,
        incorrect: artifactPath,
      });
    }

    return artifactPath;
  }

  private _getAllContractNamesFromFiles(files: string[]): string[] {
    return files.map((file) => {
      const fqn = this._getFullyQualifiedNameFromPath(file);
      return parseFullyQualifiedName(fqn).contractName;
    });
  }

  private _getAllFullyQualifiedNamesSync(): string[] {
    const paths = this._getArtifactPathsSync();
    return paths.map((p) => this._getFullyQualifiedNameFromPath(p)).sort();
  }

  private _formatSuggestions(names: string[], contractName?: string): string {
    switch (names.length) {
      case 0:
        return '';
      case 1:
        return `Did you mean "${names[0]}"?`;
      default:
        return `We found some that were similar:

${names.map((n) => `  * ${n}`).join(os.EOL)}

Please replace "${contractName}" for the correct contract name wherever you are trying to read its artifact.
`;
    }
  }

  private _handleWrongArtifactForFullyQualifiedName(fullyQualifiedName: string): never {
    const names = this._getAllFullyQualifiedNamesSync();

    const similarNames = this._getSimilarContractNames(fullyQualifiedName, names);

    throw new HardhatError(ERRORS.ARTIFACTS.NOT_FOUND, {
      contractName: fullyQualifiedName,
      suggestion: this._formatSuggestions(similarNames),
    });
  }

  private _handleWrongArtifactForContractName(contractName: string, files: string[]): never {
    const names = this._getAllContractNamesFromFiles(files);

    let similarNames = this._getSimilarContractNames(contractName, names);

    if (similarNames.length > 1) {
      similarNames = this._filterDuplicatesAsFullyQualifiedNames(files, similarNames);
    }

    throw new HardhatError(ERRORS.ARTIFACTS.NOT_FOUND, {
      contractName,
      suggestion: this._formatSuggestions(similarNames, contractName),
    });
  }

  /**
   * If the project has these contracts:
   *   - 'contracts/Greeter.sol:Greeter'
   *   - 'contracts/Meeter.sol:Greeter'
   *   - 'contracts/Greater.sol:Greater'
   *  And the user tries to get an artifact with the name 'Greter', then
   *  the suggestions will be 'Greeter', 'Greeter', and 'Greater'.
   *
   * We don't want to show duplicates here, so we use FQNs for those. The
   * suggestions will then be:
   *   - 'contracts/Greeter.sol:Greeter'
   *   - 'contracts/Meeter.sol:Greeter'
   *   - 'Greater'
   */
  private _filterDuplicatesAsFullyQualifiedNames(
    files: string[],
    similarNames: string[],
  ): string[] {
    const outputNames = [];
    const groups = similarNames.reduce((obj, cur) => {
      obj[cur] = obj[cur] ? obj[cur] + 1 : 1;
      return obj;
    }, {} as { [k: string]: number });

    for (const [name, occurrences] of Object.entries(groups)) {
      if (occurrences > 1) {
        for (const file of files) {
          if (path.basename(file) === `${name}.json`) {
            outputNames.push(this._getFullyQualifiedNameFromPath(file));
          }
        }
        continue;
      }

      outputNames.push(name);
    }

    return outputNames;
  }

  /**
   *
   * @param givenName can be FQN or contract name
   * @param names MUST match type of givenName (i.e. array of FQN's if givenName is FQN)
   * @returns
   */
  private _getSimilarContractNames(givenName: string, names: string[]): string[] {
    let shortestDistance = EDIT_DISTANCE_THRESHOLD;
    let mostSimilarNames: string[] = [];
    for (const name of names) {
      const distance = findDistance(givenName, name);

      if (distance < shortestDistance) {
        shortestDistance = distance;
        mostSimilarNames = [name];
        continue;
      }

      if (distance === shortestDistance) {
        mostSimilarNames.push(name);
        continue;
      }
    }

    return mostSimilarNames;
  }

  private _getValidArtifactPathFromFullyQualifiedNameSync(fullyQualifiedName: string): string {
    const artifactPath = this.formArtifactPathFromFullyQualifiedName(fullyQualifiedName);

    const trueCaseArtifactPath = this._trueCasePathSync(
      path.relative(this._artifactsPath, artifactPath),
      this._artifactsPath,
    );

    if (trueCaseArtifactPath === null) {
      return this._handleWrongArtifactForFullyQualifiedName(fullyQualifiedName);
    }

    if (artifactPath !== trueCaseArtifactPath) {
      throw new HardhatError(ERRORS.ARTIFACTS.WRONG_CASING, {
        correct: trueCaseArtifactPath,
        incorrect: artifactPath,
      });
    }

    return artifactPath;
  }

  private _getArtifactPathFromFiles(contractName: string, files: string[]): string {
    const matchingFiles = files.filter((file) => {
      return path.basename(file) === `${contractName}_compiled.json`;
    });

    if (matchingFiles.length === 0) {
      return this._handleWrongArtifactForContractName(contractName, files);
    }

    if (matchingFiles.length > 1) {
      const candidates = matchingFiles.map((file) => this._getFullyQualifiedNameFromPath(file));

      throw new HardhatError(ERRORS.ARTIFACTS.MULTIPLE_FOUND, {
        contractName,
        candidates: candidates.join(os.EOL),
      });
    }

    return matchingFiles[0];
  }

  /**
   * Returns the FQN of a contract giving the absolute path to its artifact.
   *
   * For example, given a path like
   * `/path/to/project/artifacts/contracts/Foo.sol/Bar.json`, it'll return the
   * FQN `contracts/Foo.sol:Bar`
   */
  private _getFullyQualifiedNameFromPath(absolutePath: string): string {
    const sourceName = replaceBackslashes(
      path.relative(this._artifactsPath, path.dirname(absolutePath)),
    );

    const contractName = path.basename(absolutePath).replace('_compiled.json', '');

    return getFullyQualifiedName(sourceName, contractName);
  }

  /**
   * Remove the artifact file, its debug file and, if it exists, its build
   * info file.
   */
  private async _removeArtifactFiles(artifactPath: string) {
    await fsExtra.remove(artifactPath);
  }
}
