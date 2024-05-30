import { spawn } from 'child_process'
import { WriteStream } from 'fs'
import { readdir } from 'fs/promises'
import { Readable } from 'stream'
import { file as tmpFile } from 'tmp'

type Recording = {
	start: number,
	end: number,
	name: string
}

export function getRecordings(startTime: number, endTime: number): Promise<Recording[]> {
	return readdir('files')
		.then(files => files
			.map(f => Number(f.replace('.mp4', '')))
			.sort()
			.reduce<Recording[]>((agg, ts, i, array) => {
				if (i < array.length - 1) {
					let start = ts;
					let end = array[i + 1];

					agg.push({ start, end, name: start.toString() })
				}

				return agg
			}, [])
			.filter(r => r.end > startTime && r.start <= endTime)
		)
}

export function sleep(sleepMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => { resolve() }, sleepMs))
}

export function createTmpFile(): Promise<[ path: string, fd: number, dispose: () => void ]> {
	return new Promise((resolve, reject) => {
		tmpFile((err, path, fd, dispose) => {
			if (err) {
				reject(err)
			} else {
				resolve([ path, fd, dispose ])
			}
		})
	})
}

export function pipeToFileAsync(src: Readable, dst: WriteStream): Promise<void> {
	return new Promise((resolve, reject) => {
		src.pipe(dst)
			
		dst.on('finish', () => dst.close((err) => {
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		}))
		dst.on('error', reject)
	})
}

export function spawnAsync(
	cmd: string
): [stdout: Readable, result: Promise<void>] {
	const [command, ...args] = cmd.split(' ');
	const process = spawn(command, args);

	return [
		process.stdout,
		new Promise((resolve, reject) => {
			process.on('exit', resolve);
			process.stderr.on('data', err => reject(new Error(err.toString())))
		}),
	]
}
