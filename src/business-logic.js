/**
 * Business Logic & Validation Module
 * แกนกลางการคำนวณและตรวจสอบข้อมูล ยึดสูตรตาม Excel เดิมเป็น Source of Truth
 */

export function isValidNonNegativeNumber(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return Number.isFinite(num) && !isNaN(num) && num >= 0;
}

export function isValidPositiveNumber(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return Number.isFinite(num) && !isNaN(num) && num > 0;
}

export function isValidNonNegativeInteger(val) {
  if (val === null || val === undefined || val === "") return false;
  const num = Number(val);
  return Number.isFinite(num) && !isNaN(num) && Number.isInteger(num) && num >= 0;
}

export function validateMeterReadings(previousReading, currentReading) {
  if (!isValidNonNegativeInteger(previousReading) || !isValidNonNegativeInteger(currentReading)) {
    return {
      isValid: false,
      message: "กรุณากรอกตัวเลขมิเตอร์เป็นจำนวนเต็มบวกหรือศูนย์ให้ถูกต้อง"
    };
  }

  const prev = Math.floor(Number(previousReading));
  const curr = Math.floor(Number(currentReading));

  if (curr < prev) {
    return {
      isValid: false,
      message: "เลขมิเตอร์ใหม่มีค่าน้อยกว่าเดือนก่อน\nกรุณาตรวจสอบรูปภาพหรือข้อมูลที่กรอก"
    };
  }

  return {
    isValid: true,
    message: ""
  };
}

export function calculateMonthlyStatement(params) {
  if (!isValidNonNegativeNumber(params.baseRentAmount)) {
    throw new Error("ค่าเช่าพื้นฐานต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
  }
  if (!isValidNonNegativeNumber(params.rentDiscount)) {
    throw new Error("ส่วนลดค่าเช่าต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
  }
  if (!isValidNonNegativeNumber(params.waterAmount)) {
    throw new Error("ค่าน้ำต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
  }
  if (!isValidNonNegativeNumber(params.electricSellRate)) {
    throw new Error("ราคาขายไฟต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0");
  }
  if (!isValidPositiveNumber(params.utilityBillUnit)) {
    throw new Error("จำนวนหน่วยในบิลไฟหลวงต้องเป็นตัวเลขที่มากกว่า 0");
  }
  if (!isValidPositiveNumber(params.utilityBillAmount)) {
    throw new Error("ยอดเงินบิลไฟหลวงต้องเป็นตัวเลขที่มากกว่า 0");
  }

  const meterCheck = validateMeterReadings(params.previousReading, params.currentReading);
  if (!meterCheck.isValid) {
    throw new Error(meterCheck.message);
  }

  const baseRentAmount = Number(params.baseRentAmount);
  const rentDiscount = Number(params.rentDiscount);
  const waterAmount = Number(params.waterAmount);
  const electricSellRate = Number(params.electricSellRate);
  const utilityBillUnit = Number(params.utilityBillUnit);
  const utilityBillAmount = Number(params.utilityBillAmount);
  const previousReading = Math.floor(Number(params.previousReading));
  const currentReading = Math.floor(Number(params.currentReading));

  // Business Logic Calculations (คำนวณด้วยค่าจริง ไม่ปัดเศษระหว่างทาง)
  const netRentAmount = baseRentAmount - rentDiscount;
  const usedUnit = currentReading - previousReading;
  const costPerUnit = utilityBillAmount / utilityBillUnit;
  const electricCharge = usedUnit * electricSellRate;
  const actualElectricCost = usedUnit * costPerUnit;
  const electricProfit = electricCharge - actualElectricCost;
  const ownerShare = (netRentAmount / 2) + (electricProfit / 2);
  const totalBill = netRentAmount + waterAmount + electricCharge;

  return {
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
    totalBill
  };
}