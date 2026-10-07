import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error('Node.js 24를 설치한 뒤 다시 실행해 주세요.');
  process.exitCode = 1;
} else {
  try {
    await copyFile(new URL('../.env.example', import.meta.url), new URL('../.env.local', import.meta.url), constants.COPYFILE_EXCL);
    console.log('.env.local을 만들었어요. Supabase URL과 공개 키를 직접 입력해 주세요.');
  } catch (error) {
    if (error.code === 'EEXIST') console.log('기존 .env.local을 유지했어요. 값을 덮어쓰지 않습니다.');
    else throw error;
  }
  console.log('다음 순서: npm ci → npm run verify → npm run dev');
}
