import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  if (!ffmpegStatic) {
    throw new Error('FFmpeg binary is unavailable. Reinstall dependencies to restore ffmpeg-static.');
  }

  return ffmpegStatic;
}

export async function ensureFfmpegAvailable(): Promise<string> {
  const ffmpegPath = getFfmpegPath();

  try {
    await execFileAsync(ffmpegPath, ['-version']);
    return ffmpegPath;
  } catch (error: any) {
    throw new Error(`FFmpeg binary could not start: ${error.message}`);
  }
}

export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const audioPath = videoPath.replace(/\.(mp4|mov|avi|webm)$/i, '.mp3');
  const ffmpegPath = await ensureFfmpegAvailable();

  try {
    await execFileAsync(ffmpegPath, [
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-q:a',
      '2',
      audioPath,
      '-y',
    ]);
    return audioPath;
  } catch (error: any) {
    throw new Error(`Audio extraction failed: ${error.message}`);
  }
}

export function extractFrameFromVideo(videoPath: string, frameOutputPath: string, timestamp = '00:00:03'): void {
  const ffmpegPath = getFfmpegPath();

  execFileSync(
    ffmpegPath,
    ['-i', videoPath, '-ss', timestamp, '-vframes', '1', '-y', frameOutputPath],
    {
      timeout: 10000,
      stdio: 'ignore',
    },
  );
}
