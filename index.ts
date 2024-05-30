import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createTmpFile, getRecordings, pipeToFileAsync, spawnAsync } from './util';
import { createReadStream, createWriteStream } from 'fs'

const app = express();
const PORT = 3000;
const DEFAULT_WINDOW_SIZE = 300_000;

app.use(cors());
app.use(morgan('combined'));

app.get('/playlist.m3u8', async (req, res) => {
	const startTime = Number(req.query.startTime); // timestamp from which client wants to begin streaming recorded footage
	const currentTime = (Number(req.query.runTime ?? 0) * 1000) + startTime; // viewer's current timestamp in stream
	const windowSize = Number(req.query.windowSize ?? DEFAULT_WINDOW_SIZE)

	let recordings = await getRecordings(startTime, currentTime + windowSize);
	let startTimeOffsetSeconds = (startTime - recordings[0].start) / 1000;
	let targetDuration = Math.max(...recordings.map(r => r.end - r.start)) / 1000;
	let nextSequenceNumber = recordings.findIndex(r => r.start <= currentTime && currentTime <= r.end);

	let playlistTags = [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-TARGETDURATION:${targetDuration}`,
		'#EXT-X-PLAYLIST-TYPE:LIVE',
		`#EXT-X-MEDIA-SEQUENCE:${nextSequenceNumber}`,
		`#EXT-X-DISCONTINUITY-SEQUENCE:${nextSequenceNumber}`,
		nextSequenceNumber === 0 ? `#EXT-X-START:TIME-OFFSET=${startTimeOffsetSeconds},PRECISE=YES` : undefined,
	].filter(Boolean).join('\n')

	let nextMediaSegments = recordings
		.filter(r => r.end >= currentTime)
		.map((r) => [
			'#EXT-X-DISCONTINUITY',
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(r.start).toISOString()}`,
			`#EXTINF:${(r.end - r.start) / 1000}`,
			`${r.name}.ts`,
		].join('\n')).join('\n')

	let playlist = playlistTags + '\n\n' + nextMediaSegments;

	res.contentType('audio/mpegurl');
	res.send(playlist)
});

app.get('/:recordingTimestamp.ts', async (req, res) => {
	const recordingTimestamp = req.params.recordingTimestamp;

	res.contentType('application/octet-stream')

	const fileReadStream = createReadStream(`files/${recordingTimestamp}.mp4`);
	
	const [tmpPath, tmpFd, disposeTmp] = await createTmpFile()
	const tmpWriteStream = createWriteStream('', { fd: tmpFd })

	await pipeToFileAsync(fileReadStream, tmpWriteStream)

	const [stdout, result] = spawnAsync(`ffmpeg -loglevel error -i ${tmpPath} -codec copy -bsf:v h264_mp4toannexb -f mpegts -`)
	stdout.pipe(res)

	result.finally(() => {
		disposeTmp()
		res.end()
	})
	// let [command, ...args] = `ffmpeg -loglevel error -i ${tmpPath} -codec copy -bsf:v h264_mp4toannexb -f mpegts -`.split(' ')
	// let ffmpeg = spawn(command, args)

	// ffmpeg.stdout.pipe(res)

	// ffmpeg.on('exit', () => {
	// 	disposeTmp()
	// 	res.end();
	// })

	// ffmpeg.stderr.on('data', (data) => {
	// 	console.error('ffmpeg stderr:', data.toString());
	// });
})

app.use((_req, res) => {
    res.status(404).send('Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
