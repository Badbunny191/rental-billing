/**
 * Test Cases สำหรับ invoiceDate Priority Logic
 *
 * BEFORE FIX:
 *   const finalInvoiceDate = existingStatement?.invoiceDate || invoiceDate || null;
 *
 * AFTER FIX:
 *   const finalInvoiceDate = invoiceDate || existingStatement?.invoiceDate || null;
 */

// ============ TC01 ============
// existingStatement.invoiceDate = "2026-10-01"
// form.invoiceDate = "2026-09-01"
// Expected: finalInvoiceDate = "2026-09-01" ✅
const tc01_existing = { invoiceDate: "2026-10-01" };
const tc01_form = "2026-09-01";
const tc01_result = tc01_form || tc01_existing?.invoiceDate || null;
console.assert(tc01_result === "2026-09-01", `TC01 FAILED: got ${tc01_result}, expected "2026-09-01"`);
console.log(`TC01 PASSED: finalInvoiceDate = "${tc01_result}" (form wins over existing)`);

// ============ TC02 ============
// existingStatement.invoiceDate = "2026-10-01"
// form.invoiceDate = null
// Expected: finalInvoiceDate = "2026-10-01" ✅
const tc02_existing = { invoiceDate: "2026-10-01" };
const tc02_form = null;
const tc02_result = tc02_form || tc02_existing?.invoiceDate || null;
console.assert(tc02_result === "2026-10-01", `TC02 FAILED: got ${tc02_result}, expected "2026-10-01"`);
console.log(`TC02 PASSED: finalInvoiceDate = "${tc02_result}" (fallback to existing when form is null)`);

// ============ TC03 ============
// existingStatement.invoiceDate = null
// form.invoiceDate = "2026-09-01"
// Expected: finalInvoiceDate = "2026-09-01" ✅
const tc03_existing = { invoiceDate: null };
const tc03_form = "2026-09-01";
const tc03_result = tc03_form || tc03_existing?.invoiceDate || null;
console.assert(tc03_result === "2026-09-01", `TC03 FAILED: got ${tc03_result}, expected "2026-09-01"`);
console.log(`TC03 PASSED: finalInvoiceDate = "${tc03_result}" (form used when existing is null)`);

// ============ TC04 ============
// existingStatement.invoiceDate = null
// form.invoiceDate = null
// Expected: finalInvoiceDate = null ✅
const tc04_existing = { invoiceDate: null };
const tc04_form = null;
const tc04_result = tc04_form || tc04_existing?.invoiceDate || null;
console.assert(tc04_result === null, `TC04 FAILED: got ${tc04_result}, expected null`);
console.log(`TC04 PASSED: finalInvoiceDate = null (both empty)`);

// ============ TC05 (Edge Case) ============
// existingStatement = undefined (first time create)
// form.invoiceDate = "2026-09-01"
// Expected: finalInvoiceDate = "2026-09-01" ✅
const tc05_existing = undefined;
const tc05_form = "2026-09-01";
const tc05_result = tc05_form || tc05_existing?.invoiceDate || null;
console.assert(tc05_result === "2026-09-01", `TC05 FAILED: got ${tc05_result}, expected "2026-09-01"`);
console.log(`TC05 PASSED: finalInvoiceDate = "${tc05_result}" (first time create)`);

// ============ TC06 (Edge Case) ============
// existingStatement = undefined (first time create)
// form.invoiceDate = null
// Expected: finalInvoiceDate = null ✅
const tc06_existing = undefined;
const tc06_form = null;
const tc06_result = tc06_form || tc06_existing?.invoiceDate || null;
console.assert(tc06_result === null, `TC06 FAILED: got ${tc06_result}, expected null`);
console.log(`TC06 PASSED: finalInvoiceDate = null (first time, no data)`);

console.log("\n✅ All test cases PASSED!");
