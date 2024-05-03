import { readdir } from 'fs'
import { promisify } from 'util'
const readdirP = promisify(readdir)

type Recording = {
	start: number,
	end: number,
	name: string
}

export function getRecordings(startTime: number, endTime: number): Promise<Recording[]> {
	return readdirP('files')
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
