import { ReadStream, WriteStream } from 'fs'
import { readdir } from 'fs/promises'
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

export function pipeAsync(src: ReadStream, dst: WriteStream): Promise<void> {
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
