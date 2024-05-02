import { readdir } from 'fs'
import { promisify } from 'util'

const readdirP = promisify(readdir)

export function getNextFileTimestamps(timestamp: number, pageSize: number): Promise<number[]> {
	return readdirP('files')
		.then(files => files.map(f => Number(f.replace('.mp4', ''))).sort())
		.then(timestamps => {
			let nextTimestampIndex = timestamps.findIndex(ts => ts >= timestamp);

			if (nextTimestampIndex === -1) {
				return []
			}

			let firstTimestampIndex = nextTimestampIndex;

			if (timestamps[nextTimestampIndex] > timestamp && nextTimestampIndex > 0) {
				firstTimestampIndex -= 1;
			}

			return timestamps.slice(firstTimestampIndex, firstTimestampIndex + pageSize);
		})
}

export function sleep(sleepMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(() => { resolve() }, sleepMs))
}
