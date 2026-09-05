const fs = require('fs');
const { execSync } = require('child_process');

// ข้อมูลประวัติย้อนหลัง 36 เดือน (มิ.ย. 66 - ก.ค. 69) ไม่รวม ส.ค. 69
const historyData = [
  { month: "2023-06", unit: 794, amount: 4325.15, prev: 4413, curr: 4814, discount: 0 },
  { month: "2023-07", unit: 801, amount: 4365.10, prev: 4814, curr: 5248, discount: 0 },
  { month: "2023-09", unit: 788, amount: 4290.91, prev: 5636, curr: 6044, discount: 0 },
  { month: "2023-10", unit: 813, amount: 4222.20, prev: 6044, curr: 6452, discount: 0 },
  { month: "2023-11", unit: 767, amount: 3187.02, prev: 6452, curr: 6797, discount: 0 },
  { month: "2023-12", unit: 814, amount: 3823.42, prev: 6797, curr: 7243, discount: 0 },
  { month: "2024-01", unit: 808, amount: 3793.72, prev: 7243, curr: 7653, discount: 0 },
  { month: "2024-03", unit: 808, amount: 4006.47, prev: 8081, curr: 8486, discount: 0 },
  { month: "2024-04", unit: 786, amount: 3846.63, prev: 8486, curr: 8858, discount: 0 },
  { month: "2024-05", unit: 844, amount: 4145.68, prev: 8858, curr: 9292, discount: 0 },
  { month: "2024-06", unit: 830, amount: 4073.50, prev: 9292, curr: 9714, discount: 0 },
  { month: "2024-07", unit: 838, amount: 4114.74, prev: 9714, curr: 10117, discount: 0 },
  { month: "2024-08", unit: 781, amount: 3820.84, prev: 10117, curr: 10520, discount: 0 },
  { month: "2024-09", unit: 828, amount: 4063.19, prev: 10520, curr: 10957, discount: 0 },
  { month: "2024-10", unit: 799, amount: 3913.65, prev: 10957, curr: 11342, discount: 0 },
  { month: "2024-11", unit: 738, amount: 3599.12, prev: 11342, curr: 11746, discount: 0 },
  { month: "2024-12", unit: 828, amount: 4063.19, prev: 11746, curr: 12180, discount: 0 },
  { month: "2025-01", unit: 796, amount: 3898.18, prev: 12180, curr: 12560, discount: 0 },
  { month: "2025-02", unit: 752, amount: 3647.17, prev: 12560, curr: 12979, discount: 0 },
  { month: "2025-03", unit: 814, amount: 3964.86, prev: 12979, curr: 13367, discount: 0 },
  { month: "2025-04", unit: 739, amount: 3580.56, prev: 13367, curr: 13756, discount: 0 },
  { month: "2025-05", unit: 878, amount: 4292.81, prev: 13756, curr: 14193, discount: 500 },
  { month: "2025-06", unit: 837, amount: 3930.47, prev: 14193, curr: 14622, discount: 500 },
  { month: "2025-07", unit: 853, amount: 4009.55, prev: 14622, curr: 14997, discount: 500 },
  { month: "2025-08", unit: 802, amount: 3757.49, prev: 14997, curr: 15381, discount: 500 },
  { month: "2025-09", unit: 872, amount: 4103.45, prev: 15381, curr: 15796, discount: 500 },
  { month: "2025-10", unit: 878, amount: 4095.52, prev: 15796, curr: 16230, discount: 500 },
  { month: "2025-11", unit: 847, amount: 3943.65, prev: 16230, curr: 16630, discount: 500 },
  { month: "2025-12", unit: 853, amount: 3973.04, prev: 16630, curr: 17039, discount: 500 },
  { month: "2026-01", unit: 793, amount: 3679.08, prev: 17039, curr: 17474, discount: 500 },
  { month: "2026-02", unit: 852, amount: 3913.44, prev: 17474, curr: 17856, discount: 500 },
  { month: "2026-03", unit: 920, amount: 4242.23, prev: 17856, curr: 18249, discount: 500 },
  { month: "2026-04", unit: 834, amount: 3826.41, prev: 18249, curr: 18642, discount: 500 },
  { month: "2026-05", unit: 953, amount: 4401.80, prev: 18642, curr: 19073, discount: 500 },
  { month: "2026-06", unit: 892, amount: 4168.99, prev: 19073, curr: 19481, discount: 500 },
  { month: "2026-07", unit: 939, amount: 4399.52, prev: 19481, curr: 19916, discount: 500 }
];

const kvBulkItems = [];

for (const r of historyData) {
  const baseRentAmount = 5500;
  const rentDiscount = r.discount;
  const waterAmount = 100;
  const electricSellRate = 7;
  const utilityBillUnit = r.unit;
  const utilityBillAmount = r.amount;
  const previousReading = r.prev;
  const currentReading = r.curr;

  // คำนวณตาม Business Logic เดิม 100%
  const netRentAmount = baseRentAmount - rentDiscount;
  const usedUnit = currentReading - previousReading;
  const costPerUnit = utilityBillAmount / utilityBillUnit;
  const electricCharge = usedUnit * electricSellRate;
  const actualElectricCost = usedUnit * costPerUnit;
  const electricProfit = electricCharge - actualElectricCost;
  const ownerShare = (netRentAmount / 2) + (electricProfit / 2);
  const totalBill = netRentAmount + waterAmount + electricCharge;

  const statement = {
    month: r.month,
    baseRentAmount,
    rentDiscount,
    netRentAmount,
    waterAmount,
    electricSellRate,
    utilityBillUnit,
    utilityBillAmount,
    previousReading,
    currentReading,
    usedUnit,
    costPerUnit,
    electricCharge,
    actualElectricCost,
    electricProfit,
    ownerShare,
    totalBill,
    paymentStatus: "paid", // เดือนเก่าตั้งเป็นชำระแล้วทั้งหมด
    bankAccount: "",
    updatedAt: `${r.month}-28T12:00:00.000Z`
  };

  const utilityBill = {
    month: r.month,
    unit: utilityBillUnit,
    amount: utilityBillAmount,
    updatedAt: `${r.month}-28T12:00:00.000Z`
  };

  const meterReading = {
    month: r.month,
    previousReading,
    currentReading,
    updatedAt: `${r.month}-28T12:00:00.000Z`
  };

  kvBulkItems.push({ key: `monthly_statement:${r.month}`, value: JSON.stringify(statement) });
  kvBulkItems.push({ key: `utility_bill:${r.month}`, value: JSON.stringify(utilityBill) });
  kvBulkItems.push({ key: `meter_reading:${r.month}`, value: JSON.stringify(meterReading) });
}

// 1. เขียนไฟล์ JSON ชั่วคราวสำหรับคำสั่ง wrangler kv bulk put
const bulkFilePath = 'history-kv-bulk.json';
fs.writeFileSync(bulkFilePath, JSON.stringify(kvBulkItems, null, 2), 'utf-8');
console.log(`📦 สร้างไฟล์ข้อมูลนำเข้า ${bulkFilePath} สำเร็จ (${kvBulkItems.length} รายการ จาก ${historyData.length} เดือน)`);

// 2. สั่งนำเข้า Cloudflare KV ด้วย Wrangler
console.log('🚀 กำลังอัปโหลดข้อมูลขึ้น Cloudflare KV (HOUSE_RENT_KV)...');
try {
  execSync(`npx wrangler kv bulk put ${bulkFilePath} --binding=HOUSE_RENT_KV`, { stdio: 'inherit' });
  console.log('\n✨ [สำเร็จ] นำเข้าข้อมูลประวัติเดือนเก่าย้อนหลังขึ้น Cloudflare KV ครบถ้วน 100%');
} catch (err) {
  console.error('\n❌ เกิดข้อผิดพลาดในการรันคำสั่ง wrangler:', err.message);
}