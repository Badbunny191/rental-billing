const { execSync } = require('child_process');

// Namespace ID จาก wrangler.toml
const NAMESPACE_ID = "0275b02b5c8047e48c6871b0243bcff1";

try {
  console.log('🧹 กำลังดึงรายการ Key ทั้งหมดจาก Cloudflare KV...');
  const output = execSync(`npx wrangler kv key list --namespace-id=${NAMESPACE_ID} --remote`, { encoding: 'utf-8' });
  const keys = JSON.parse(output);

  if (keys.length === 0) {
    console.log('✨ KV ว่างเปล่าอยู่แล้ว ไม่มีอะไรต้องลบ');
    process.exit(0);
  }

  console.log(`🗑️ พบข้อมูลทั้งหมด ${keys.length} รายการ กำลังดำเนินการลบ...`);

  for (const k of keys) {
    const keyName = k.name;
    process.stdout.write(`Deleting key: ${keyName} ... `);
    execSync(`npx wrangler kv key delete --namespace-id=${NAMESPACE_ID} "${keyName}" --remote`, { stdio: 'ignore' });
    console.log('✅');
  }

  console.log('\n✨ [สำเร็จ] ลบข้อมูลเก่าใน Cloudflare KV ทั้งหมดเรียบร้อยแล้ว');
} catch (err) {
  console.error('\n❌ เกิดข้อผิดพลาดในการลบ KV:', err.message);
}