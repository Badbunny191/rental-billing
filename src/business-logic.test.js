/**
 * Unit Tests for Business Logic
 * ทดสอบ validation และ calculation functions
 */

import {
  isValidNonNegativeNumber,
  isValidPositiveNumber,
  isValidNonNegativeInteger,
  validateMeterReadings,
  calculateMonthlyStatement
} from "./business-logic.js";

// ============================================================
// Test Helpers
// ============================================================

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`❌ ${message}\n   Expected: ${expected}\n   Actual: ${actual}`);
  }
  console.log(`✅ ${message}`);
}

function assertApproxEqual(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`❌ ${message}\n   Expected: ~${expected}\n   Actual: ${actual}`);
  }
  console.log(`✅ ${message}`);
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`❌ ${message} - Expected function to throw but it didn't`);
  }
  console.log(`✅ ${message}`);
}

// ============================================================
// Tests: Validation Functions
// ============================================================

function test_isValidNonNegativeNumber() {
  console.log("\n📋 Test: isValidNonNegativeNumber");

  // Valid cases
  assert(isValidNonNegativeNumber(0), "0 is valid");
  assert(isValidNonNegativeNumber(100), "100 is valid");
  assert(isValidNonNegativeNumber(0.5), "0.5 is valid");
  assert(isValidNonNegativeNumber(999.99), "999.99 is valid");
  assert(isValidNonNegativeNumber("100"), "String '100' is valid");
  assert(isValidNonNegativeNumber("0"), "String '0' is valid");

  // Invalid cases
  assert(!isValidNonNegativeNumber(null), "null is invalid");
  assert(!isValidNonNegativeNumber(undefined), "undefined is invalid");
  assert(!isValidNonNegativeNumber(""), "Empty string is invalid");
  assert(!isValidNonNegativeNumber(NaN), "NaN is invalid");
  assert(!isValidNonNegativeNumber(-1), "-1 is invalid");
  assert(!isValidNonNegativeNumber(-0.5), "-0.5 is invalid");
}

function test_isValidPositiveNumber() {
  console.log("\n📋 Test: isValidPositiveNumber");

  // Valid cases
  assert(isValidPositiveNumber(0.01), "0.01 is valid");
  assert(isValidPositiveNumber(1), "1 is valid");
  assert(isValidPositiveNumber(100), "100 is valid");
  assert(isValidPositiveNumber("50"), "String '50' is valid");

  // Invalid cases
  assert(!isValidPositiveNumber(0), "0 is invalid");
  assert(!isValidPositiveNumber(-1), "-1 is invalid");
  assert(!isValidPositiveNumber(null), "null is invalid");
  assert(!isValidPositiveNumber(undefined), "undefined is invalid");
  assert(!isValidPositiveNumber(""), "Empty string is invalid");
}

function test_isValidNonNegativeInteger() {
  console.log("\n📋 Test: isValidNonNegativeInteger");

  // Valid cases
  assert(isValidNonNegativeInteger(0), "0 is valid");
  assert(isValidNonNegativeInteger(1), "1 is valid");
  assert(isValidNonNegativeInteger(100), "100 is valid");
  assert(isValidNonNegativeInteger(999999), "999999 is valid");

  // Invalid cases (decimal values)
  assert(!isValidNonNegativeInteger(0.5), "0.5 is invalid");
  assert(!isValidNonNegativeInteger(1.1), "1.1 is invalid");
  assert(!isValidNonNegativeInteger(-1), "-1 is invalid");
  assert(!isValidNonNegativeInteger(null), "null is invalid");
  assert(!isValidNonNegativeInteger(undefined), "undefined is invalid");
}

function test_validateMeterReadings() {
  console.log("\n📋 Test: validateMeterReadings");

  // Valid cases
  let result = validateMeterReadings(100, 200);
  assert(result.isValid === true, "Current > Previous is valid");
  assert(result.message === "", "No error message for valid readings");

  result = validateMeterReadings(0, 0);
  assert(result.isValid === true, "Both zero is valid");

  result = validateMeterReadings(9999, 10000);
  assert(result.isValid === true, "Large numbers are valid");

  // Invalid cases
  result = validateMeterReadings(200, 100);
  assert(result.isValid === false, "Current < Previous is invalid");
  assert(result.message.includes("น้อยกว่า"), "Error message mentions meter reading issue");

  result = validateMeterReadings(-1, 100);
  assert(result.isValid === false, "Negative previous reading is invalid");

  result = validateMeterReadings(100, -1);
  assert(result.isValid === false, "Negative current reading is invalid");

  result = validateMeterReadings(null, 100);
  assert(result.isValid === false, "Null previous reading is invalid");

  result = validateMeterReadings(100, null);
  assert(result.isValid === false, "Null current reading is invalid");
}

// ============================================================
// Tests: calculateMonthlyStatement
// ============================================================

function test_calculateMonthlyStatement_standard() {
  console.log("\n📋 Test: calculateMonthlyStatement - Standard Case");

  const result = calculateMonthlyStatement({
    baseRentAmount: 5500,
    rentDiscount: 500,
    waterAmount: 100,
    electricSellRate: 7,
    utilityBillUnit: 924,
    utilityBillAmount: 4325.95,
    previousReading: 20365,
    currentReading: 20782
  });

  // Basic inputs echoed back
  assertEqual(result.baseRentAmount, 5500, "baseRentAmount echoed");
  assertEqual(result.rentDiscount, 500, "rentDiscount echoed");
  assertEqual(result.netRentAmount, 5000, "netRentAmount = base - discount");
  assertEqual(result.waterAmount, 100, "waterAmount echoed");
  assertEqual(result.electricSellRate, 7, "electricSellRate echoed");
  assertEqual(result.utilityBillUnit, 924, "utilityBillUnit echoed");
  assertEqual(result.utilityBillAmount, 4325.95, "utilityBillAmount echoed");
  assertEqual(result.previousReading, 20365, "previousReading echoed");
  assertEqual(result.currentReading, 20782, "currentReading echoed");

  // Calculated values
  assertEqual(result.usedUnit, 417, "usedUnit = current - previous");
  assertApproxEqual(result.costPerUnit, 4.682, 0.001, "costPerUnit = amount / unit");
  assertEqual(result.electricCharge, 2919, "electricCharge = usedUnit * sellRate");
  assertApproxEqual(result.actualElectricCost, 1952.30, 0.01, "actualElectricCost = usedUnit * costPerUnit");
  assertApproxEqual(result.electricProfit, 966.70, 0.01, "electricProfit = charge - actualCost");
  assertApproxEqual(result.ownerShare, 2983.35, 0.01, "ownerShare = (netRent/2) + (profit/2)");
  assertEqual(result.totalBill, 8019, "totalBill = netRent + water + electricCharge");
}

function test_calculateMonthlyStatement_zeroDiscount() {
  console.log("\n📋 Test: calculateMonthlyStatement - Zero Discount");

  const result = calculateMonthlyStatement({
    baseRentAmount: 5500,
    rentDiscount: 0,
    waterAmount: 100,
    electricSellRate: 7,
    utilityBillUnit: 500,
    utilityBillAmount: 2500,
    previousReading: 1000,
    currentReading: 1500
  });

  assertEqual(result.netRentAmount, 5500, "netRentAmount = base when no discount");
  assertEqual(result.usedUnit, 500, "usedUnit calculated correctly");
  assertEqual(result.electricCharge, 3500, "electricCharge = 500 * 7");
  assertEqual(result.totalBill, 9100, "totalBill = 5500 + 100 + 3500");
}

function test_calculateMonthlyStatement_edgeCases() {
  console.log("\n📋 Test: calculateMonthlyStatement - Edge Cases");

  // Minimum usage (1 unit)
  let result = calculateMonthlyStatement({
    baseRentAmount: 5000,
    rentDiscount: 0,
    waterAmount: 50,
    electricSellRate: 5,
    utilityBillUnit: 100,
    utilityBillAmount: 500,
    previousReading: 0,
    currentReading: 1
  });
  assertEqual(result.usedUnit, 1, "Minimum 1 unit usage");
  assertEqual(result.electricCharge, 5, "Minimum electric charge");
  assertEqual(result.totalBill, 5055, "Total with minimum usage");

  // Zero water
  result = calculateMonthlyStatement({
    baseRentAmount: 5000,
    rentDiscount: 0,
    waterAmount: 0,
    electricSellRate: 5,
    utilityBillUnit: 100,
    utilityBillAmount: 500,
    previousReading: 0,
    currentReading: 100
  });
  assertEqual(result.totalBill, 5500, "Total without water charge");
}

function test_calculateMonthlyStatement_validationErrors() {
  console.log("\n📋 Test: calculateMonthlyStatement - Validation Errors");

  const baseParams = {
    baseRentAmount: 5500,
    rentDiscount: 500,
    waterAmount: 100,
    electricSellRate: 7,
    utilityBillUnit: 924,
    utilityBillAmount: 4325.95,
    previousReading: 20365,
    currentReading: 20782
  };

  // Negative baseRentAmount
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, baseRentAmount: -100 }),
    "Throws for negative baseRentAmount"
  );

  // Negative rentDiscount
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, rentDiscount: -50 }),
    "Throws for negative rentDiscount"
  );

  // Negative waterAmount
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, waterAmount: -10 }),
    "Throws for negative waterAmount"
  );

  // Zero or negative utilityBillUnit
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, utilityBillUnit: 0 }),
    "Throws for zero utilityBillUnit"
  );
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, utilityBillUnit: -1 }),
    "Throws for negative utilityBillUnit"
  );

  // Zero or negative utilityBillAmount
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, utilityBillAmount: 0 }),
    "Throws for zero utilityBillAmount"
  );
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, utilityBillAmount: -100 }),
    "Throws for negative utilityBillAmount"
  );

  // Invalid meter readings (current < previous)
  assertThrows(
    () => calculateMonthlyStatement({ ...baseParams, previousReading: 30000, currentReading: 20000 }),
    "Throws when current reading < previous reading"
  );
}

function test_calculateMonthlyStatement_ownerSplit() {
  console.log("\n📋 Test: calculateMonthlyStatement - Owner Split Logic");

  // With ownerSplit logic (owner1 gets water, owner2 gets electric cost)
  // This test verifies the ownerShare calculation
  const result = calculateMonthlyStatement({
    baseRentAmount: 6000,
    rentDiscount: 1000,
    waterAmount: 200,
    electricSellRate: 8,
    utilityBillUnit: 1000,
    utilityBillAmount: 5000,
    previousReading: 1000,
    currentReading: 2000
  });

  // Net rent = 6000 - 1000 = 5000
  assertEqual(result.netRentAmount, 5000, "Net rent calculated correctly");

  // Used units = 2000 - 1000 = 1000
  assertEqual(result.usedUnit, 1000, "Used units = 1000");

  // Electric charge = 1000 * 8 = 8000
  assertEqual(result.electricCharge, 8000, "Electric charge = 8000");

  // Cost per unit = 5000 / 1000 = 5
  assertEqual(result.costPerUnit, 5, "Cost per unit = 5");

  // Actual electric cost = 1000 * 5 = 5000
  assertEqual(result.actualElectricCost, 5000, "Actual electric cost = 5000");

  // Electric profit = 8000 - 5000 = 3000
  assertEqual(result.electricProfit, 3000, "Electric profit = 3000");

  // Owner share = (5000/2) + (3000/2) = 2500 + 1500 = 4000
  assertEqual(result.ownerShare, 4000, "Owner share = 4000");

  // Total bill = 5000 + 200 + 8000 = 13200
  assertEqual(result.totalBill, 13200, "Total bill = 13200");
}

// ============================================================
// Run All Tests
// ============================================================

function runAllTests() {
  console.log("=".repeat(60));
  console.log("🧪 Running Business Logic Unit Tests");
  console.log("=".repeat(60));

  let passed = 0;
  let failed = 0;

  const testFunctions = [
    test_isValidNonNegativeNumber,
    test_isValidPositiveNumber,
    test_isValidNonNegativeInteger,
    test_validateMeterReadings,
    test_calculateMonthlyStatement_standard,
    test_calculateMonthlyStatement_zeroDiscount,
    test_calculateMonthlyStatement_edgeCases,
    test_calculateMonthlyStatement_validationErrors,
    test_calculateMonthlyStatement_ownerSplit
  ];

  for (const testFn of testFunctions) {
    try {
      testFn();
      passed++;
    } catch (error) {
      console.error(`\n❌ Test suite "${testFn.name}" FAILED:`);
      console.error(`   ${error.message}\n`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

// Export for Node.js testing
if (typeof window === 'undefined') {
  runAllTests();
}
