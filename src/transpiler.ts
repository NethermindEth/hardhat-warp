import { exec } from 'child_process';

export class Transpiler {
    constructor(private _pathToWarp: string) {}

    /**
     * @param inputPath path to contract to be compiled
     */
    public async transpile(inputPath: string) {
        const output : string = await new Promise((resolve, reject) => {
            console.log(`${this._pathToWarp} transpile ${inputPath}`);
            const process = exec(
                `${this._pathToWarp} transpile ${inputPath}`, 
                (error, stdout) => {
                    if (error !== null) return reject(error);
                    resolve(stdout);
                }
            );

            process.stdin!.end();
        })

        console.log(output);
        return output;
    }    
}
