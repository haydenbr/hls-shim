import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { exec, spawn } from 'child_process'
import { readdir } from 'fs'
import { promisify } from 'util'

const readdirP = promisify(readdir)

const app = express();
const PORT = 3000;
const PAGE_SIZE = 10;
const DURATION = 60;

app.use(cors());
app.use(morgan('combined'));

app.get('/playlist.m3u8', async (req, res) => {
	const initialTimestamp = Number(req.query.startTime)
	const nextSequenceNumber = req.query._HLS_msn ? Number(req.query._HLS_msn) : 0;

	let nextFileTimestamps = await getNextFileTimestamps(initialTimestamp, nextSequenceNumber, PAGE_SIZE)
	let startTimeOffsetSeconds = (initialTimestamp - nextFileTimestamps[0]) / 1000

	let playlistTags = [
		'#EXTM3U',
		'#EXT-X-VERSION:11',
		`#EXT-X-TARGETDURATION:${DURATION}`,
		'#EXT-X-PLAYLIST-TYPE:LIVE',
		`#EXT-X-MEDIA-SEQUENCE:${nextSequenceNumber}`,
		`#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,CAN-SKIP-UNTIL=${DURATION * PAGE_SIZE}`,
		nextSequenceNumber === 0 ? `#EXT-X-START:TIME-OFFSET=${startTimeOffsetSeconds},PRECISE=YES` : undefined,
	].filter(Boolean).join('\n')

	let nextMediaSegments = nextFileTimestamps
		.reduce((segments, fileTimestamp) => {
			return segments + [
				'#EXT-X-DISCONTINUITY',
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(fileTimestamp).toISOString()}`,
				'#EXTINF:60',
				`${fileTimestamp}.ts`,
			].join('\n')
		}, '')

	let playlist = playlistTags + '\n\n' + nextMediaSegments;

	console.log(playlist)
	
	res.contentType('audio/mpegurl')
	res.send(playlist)
});

async function getNextFileTimestamps(timestamp: number, offset: number, pageSize: number) {
	return readdirP('files')
		.then(files => files.map(f => Number(f.replace('.mp4', ''))).sort())
		.then(timestamps => {
			let nextTimestampIndex = timestamps.findIndex(ts => ts >= timestamp);

			if (nextTimestampIndex === -1) {
				return []
			}

			let firstTimestampIndex = timestamp === timestamps[nextTimestampIndex]
				? nextTimestampIndex
				: nextTimestampIndex > 0
					? nextTimestampIndex - 1
					: nextTimestampIndex;
			firstTimestampIndex += offset;

			return timestamps.slice(firstTimestampIndex, firstTimestampIndex + pageSize);
		})
}

app.get('/:recordingTimestamp.ts', (req, res) => {
	const recordingTimestamp = req.params.recordingTimestamp;

	res.contentType('application/octet-stream')

	let [command, ...args] = `ffmpeg -loglevel error -i files/${recordingTimestamp}.mp4 -codec copy -bsf:v h264_mp4toannexb -f mpegts -`.split(' ')
	let ffmpegProcess = spawn(command, args)

	ffmpegProcess.stdout.pipe(res)

	ffmpegProcess.on('exit', () => {
		res.end();
	})
})

app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
