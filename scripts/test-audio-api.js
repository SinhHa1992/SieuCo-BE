/**
 * Test script for /api/meeting/extract
 * Creates a minimal WAV file and POSTs it using fetch + FormData (Node 18+)
 */
function createMinimalWav() {
  const sampleRate = 8000;
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;
  const write = (str) => { buffer.write(str, offset); offset += str.length; };
  const writeU32 = (n) => { buffer.writeUInt32LE(n, offset); offset += 4; };
  const writeU16 = (n) => { buffer.writeUInt16LE(n, offset); offset += 2; };
  write('RIFF'); writeU32(36 + dataSize); write('WAVE');
  write('fmt '); writeU32(16); writeU16(1); writeU16(1);
  writeU32(sampleRate); writeU32(sampleRate * 2); writeU16(2); writeU16(16);
  write('data'); writeU32(dataSize);
  return buffer;
}

async function testApi() {
  const buffer = createMinimalWav();
  const formData = new FormData();
  formData.append('audio', new File([buffer], 'test.wav', { type: 'audio/wav' }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  const res = await fetch('http://localhost:3002/api/meeting/extract', {
    method: 'POST',
    body: formData,
    signal: controller.signal
  });
  clearTimeout(timeout);

  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  return { status: res.status, body };
}

testApi()
  .then(({ status, body }) => {
    console.log('Status:', status);
    console.log('Response:', JSON.stringify(body, null, 2));
    console.log(status === 200 ? '\n✓ API is working!' : '\n✗ API returned error');
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
