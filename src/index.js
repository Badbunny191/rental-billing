/**
 * Cloudflare Worker Backend
 * จัดการ Routing, Protected API, Authentication และ Static Assets
 */

import {
  isValidNonNegativeNumber,
  isValidPositiveNumber,
  isValidNonNegativeInteger,
  validateMeterReadings,
  calculateMonthlyStatement
} from "./business-logic.js";
import { OCRService, StandardOCRProvider } from "./ocr-interface.js";
import { hashPassword, verifyPassword, createSession, validateSession, destroySession } from "./auth.js";

const DEFAULT_SETTINGS = {
  baseRentAmount: 5500,
  rentDiscount: 500,
  waterAmount: 100,
  electricSellRate: 7,
  paymentMethod: "bank",
  bankAccount: "",
  owner1Name: "ป๊า",
  owner2Name: "อากู้",
  waterReceiver: "owner2"
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8"
};

function isValidMonthFormat(monthStr) {
  return typeof monthStr === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // Static Assets Handler: ส่งต่อ Request ที่ไม่ใช่ API ไปยัง Public Assets
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
      return new Response("Asset Not Found", { status: 404 });
    }

    try {
      // -------------------------------------------------------------
      // 1. AUTHENTICATION & FIRST RUN ROUTES
      // -------------------------------------------------------------

      if (url.pathname === "/api/me" && method === "GET") {
        const adminAccount = await env.HOUSE_RENT_KV.get("auth:admin", { type: "json" });
        const setupRequired = !adminAccount;

        if (setupRequired) {
          return new Response(JSON.stringify({ authenticated: false, setupRequired: true }), {
            headers: JSON_HEADERS
          });
        }

        const session = await validateSession(request, env);
        if (!session) {
          return new Response(JSON.stringify({ authenticated: false, setupRequired: false }), {
            headers: JSON_HEADERS
          });
        }

        return new Response(JSON.stringify({
          authenticated: true,
          setupRequired: false,
          username: session.username
        }), {
          headers: JSON_HEADERS
        });
      }

      if (url.pathname === "/api/setup" && method === "POST") {
        const existingAdmin = await env.HOUSE_RENT_KV.get("auth:admin", { type: "json" });
        if (existingAdmin) {
          return new Response(JSON.stringify({ error: "ระบบได้รับการตั้งค่าผู้ดูแลระบบเรียบร้อยแล้ว" }), {
            status: 403,
            headers: JSON_HEADERS
          });
        }

        const payload = await request.json();
        const username = String(payload.username || "").trim();
        const password = String(payload.password || "");

        if (!username || !password) {
          return new Response(JSON.stringify({ error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        if (password.length < 8) {
          return new Response(JSON.stringify({ error: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const passwordHash = await hashPassword(password);
        const adminData = {
          username,
          passwordHash,
          updatedAt: new Date().toISOString()
        };

        await env.HOUSE_RENT_KV.put("auth:admin", JSON.stringify(adminData));
        const cookie = await createSession(env, username);

        return new Response(JSON.stringify({ success: true, authenticated: true, username }), {
          headers: {
            ...JSON_HEADERS,
            "Set-Cookie": cookie
          }
        });
      }

      if (url.pathname === "/api/login" && method === "POST") {
        const payload = await request.json();
        const username = String(payload.username || "").trim();
        const password = String(payload.password || "");

        const adminAccount = await env.HOUSE_RENT_KV.get("auth:admin", { type: "json" });
        if (!adminAccount) {
          return new Response(JSON.stringify({ error: "ระบบยังไม่ได้รับการตั้งค่าผู้ดูแลระบบ" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        if (
  username.toLowerCase() !==
  adminAccount.username.toLowerCase()
) {
  return new Response(JSON.stringify({
    error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
  }), {
    status: 401,
    headers: JSON_HEADERS
  });
}

        const isPasswordCorrect = await verifyPassword(password, adminAccount.passwordHash);
        if (!isPasswordCorrect) {
          return new Response(JSON.stringify({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }), {
            status: 401,
            headers: JSON_HEADERS
          });
        }

        // Artificial delay to prevent timing attacks (normalize timing between wrong password and correct password)
        await new Promise(resolve => setTimeout(resolve, 200));

        const cookie = await createSession(env, username);
        return new Response(JSON.stringify({ authenticated: true, username }), {
          headers: {
            ...JSON_HEADERS,
            "Set-Cookie": cookie
          }
        });
      }

      if (url.pathname === "/api/logout" && method === "POST") {
        const clearCookie = await destroySession(request, env);
        return new Response(JSON.stringify({ authenticated: false }), {
          headers: {
            ...JSON_HEADERS,
            "Set-Cookie": clearCookie
          }
        });
      }

      // -------------------------------------------------------------
      // 2. PAGE PROTECTION (SAME-ORIGIN ENFORCED)
      // -------------------------------------------------------------
      const session = await validateSession(request, env);
      if (!session) {
        return new Response(JSON.stringify({ error: "Unauthorized: กรุณาเข้าสู่ระบบก่อนใช้งาน" }), {
          status: 401,
          headers: JSON_HEADERS
        });
      }

      // -------------------------------------------------------------
      // 3. SETTINGS ROUTES
      // -------------------------------------------------------------
      if (url.pathname === "/api/settings" && method === "GET") {
        const stored = await env.HOUSE_RENT_KV.get("settings", { type: "json" });
        const settings = stored || DEFAULT_SETTINGS;
        return new Response(JSON.stringify(settings), { headers: JSON_HEADERS });
      }

      if (url.pathname === "/api/settings" && method === "POST") {
        const payload = await request.json();

        if (!isValidNonNegativeNumber(payload.baseRentAmount) ||
            !isValidNonNegativeNumber(payload.rentDiscount) ||
            !isValidNonNegativeNumber(payload.waterAmount) ||
            !isValidNonNegativeNumber(payload.electricSellRate)) {
          return new Response(JSON.stringify({ error: "ข้อมูลการตั้งค่าไม่ถูกต้อง ตัวเลขต้องเป็นค่าที่ไม่ติดลบ" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const settings = {
          baseRentAmount: Number(payload.baseRentAmount),
          rentDiscount: Number(payload.rentDiscount),
          waterAmount: Number(payload.waterAmount),
          electricSellRate: Number(payload.electricSellRate),
          paymentMethod: payload.paymentMethod === "cash" ? "cash" : "bank",
          bankAccount: String(payload.bankAccount || "").trim(),
          owner1Name: String(payload.owner1Name || "ป๊า").trim(),
          owner2Name: String(payload.owner2Name || "อากู้").trim(),
          waterReceiver: payload.waterReceiver === "owner1" ? "owner1" : "owner2"
        };

        await env.HOUSE_RENT_KV.put("settings", JSON.stringify(settings));
        return new Response(JSON.stringify({ success: true, settings }), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 4. UTILITY BILL ROUTES
      // -------------------------------------------------------------
      if (url.pathname.startsWith("/api/utility-bill/") && method === "GET") {
        const month = url.pathname.split("/")[3];
        if (!isValidMonthFormat(month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }
        const data = await env.HOUSE_RENT_KV.get(`utility_bill:${month}`, { type: "json" });
        return new Response(JSON.stringify(data || null), { headers: JSON_HEADERS });
      }

      if (url.pathname === "/api/utility-bill" && method === "POST") {
        const payload = await request.json();

        if (!isValidMonthFormat(payload.month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }
        if (!isValidPositiveNumber(payload.unit) || !isValidPositiveNumber(payload.amount)) {
          return new Response(JSON.stringify({ error: "จำนวนหน่วยและยอดเงินบิลไฟหลวงต้องเป็นตัวเลขที่มากกว่า 0" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const billData = {
          month: payload.month,
          unit: Number(payload.unit),
          amount: Number(payload.amount),
          updatedAt: new Date().toISOString()
        };

        await env.HOUSE_RENT_KV.put(`utility_bill:${payload.month}`, JSON.stringify(billData));
        return new Response(JSON.stringify({ success: true, data: billData }), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 5. METER READING ROUTES
      // -------------------------------------------------------------
      if (url.pathname.startsWith("/api/meter-reading/") && method === "GET") {
        const month = url.pathname.split("/")[3];
        if (!isValidMonthFormat(month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }
        const data = await env.HOUSE_RENT_KV.get(`meter_reading:${month}`, { type: "json" });
        return new Response(JSON.stringify(data || null), { headers: JSON_HEADERS });
      }

      if (url.pathname === "/api/meter-reading" && method === "POST") {
        const payload = await request.json();

        if (!isValidMonthFormat(payload.month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const validation = validateMeterReadings(payload.previousReading, payload.currentReading);
        if (!validation.isValid) {
          return new Response(JSON.stringify({ error: validation.message }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const meterData = {
          month: payload.month,
          previousReading: Math.floor(Number(payload.previousReading)),
          currentReading: Math.floor(Number(payload.currentReading)),
          updatedAt: new Date().toISOString()
        };

        await env.HOUSE_RENT_KV.put(`meter_reading:${payload.month}`, JSON.stringify(meterData));
        return new Response(JSON.stringify({ success: true, data: meterData }), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 6. CALCULATION & STATEMENT
      // -------------------------------------------------------------
      if (url.pathname === "/api/calculate" && method === "POST") {
        const data = await request.json();
        const month = data.month;
        const invoiceDate = data.invoiceDate; // วันที่ออกบิลจากฟอร์ม

        if (!isValidMonthFormat(month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const storedSettings = await env.HOUSE_RENT_KV.get("settings", { type: "json" });
        const settings = storedSettings || DEFAULT_SETTINGS;

        let rentDiscount = settings.rentDiscount;
        if (data.rentDiscount !== undefined && data.rentDiscount !== null && data.rentDiscount !== "") {
          if (!isValidNonNegativeNumber(data.rentDiscount)) {
            return new Response(JSON.stringify({ error: "ส่วนลดค่าเช่าต้องเป็นตัวเลขที่มากกว่าหรือเท่ากับ 0" }), {
              status: 400,
              headers: JSON_HEADERS
            });
          }
          rentDiscount = Number(data.rentDiscount);
        }

        const [billData, meterData] = await Promise.all([
          env.HOUSE_RENT_KV.get(`utility_bill:${month}`, { type: "json" }),
          env.HOUSE_RENT_KV.get(`meter_reading:${month}`, { type: "json" })
        ]);

        if (!billData) {
          return new Response(JSON.stringify({ error: `ไม่พบข้อมูลบิลไฟหลวงของเดือน ${month} กรุณาบันทึกข้อมูลก่อนคำนวณ` }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        if (!meterData) {
          return new Response(JSON.stringify({ error: `ไม่พบข้อมูลมิเตอร์ของเดือน ${month} กรุณาบันทึกข้อมูลก่อนคำนวณ` }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        let statementCalc;
        try {
          statementCalc = calculateMonthlyStatement({
            baseRentAmount: settings.baseRentAmount,
            rentDiscount: rentDiscount,
            waterAmount: settings.waterAmount,
            electricSellRate: settings.electricSellRate,
            utilityBillUnit: billData.unit,
            utilityBillAmount: billData.amount,
            previousReading: meterData.previousReading,
            currentReading: meterData.currentReading
          });
        } catch (calcError) {
          return new Response(JSON.stringify({ error: calcError.message }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const existingStatement = await env.HOUSE_RENT_KV.get(`monthly_statement:${month}`, { type: "json" });
        const paymentStatus = existingStatement?.paymentStatus === "paid" ? "paid" : "unpaid";
        const paidAt = paymentStatus === "paid" ? (existingStatement.paidAt || new Date().toISOString()) : null;

        // invoiceDate Priority (ใหม่ - แก้ไขได้ผ่านฟอร์ม):
        // 1. ค่าจากฟอร์ม (Priority สูงสุด - ผู้ใช้แก้ไขได้)
        // 2. ค่าเดิมใน KV (fallback ถ้าฟอร์มว่าง)
        // 3. null (ถ้าไม่มีทั้งสอง)
        const finalInvoiceDate = invoiceDate || existingStatement?.invoiceDate || null;

        const statement = {
          month,
          ...statementCalc,
          paymentMethod: settings.paymentMethod || "bank",
          bankAccount: settings.bankAccount || "",
          waterReceiver: settings.waterReceiver || "owner2",
          paymentStatus,
          paidAt,
          invoiceDate: finalInvoiceDate,
          updatedAt: new Date().toISOString()
        };

        await env.HOUSE_RENT_KV.put(`monthly_statement:${month}`, JSON.stringify(statement));

        return new Response(JSON.stringify({
          success: true,
          statement,
          utilityBill: billData,
          meterReading: meterData
        }), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 7. PAYMENT STATUS ROUTE
      // -------------------------------------------------------------
      if (url.pathname === "/api/payment-status" && method === "POST") {
        const payload = await request.json();
        const month = payload.month;
        const paymentStatus = payload.paymentStatus;

        if (!isValidMonthFormat(month)) {
          return new Response(JSON.stringify({ error: "รูปแบบเดือนไม่ถูกต้อง" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        if (paymentStatus !== "unpaid" && paymentStatus !== "paid") {
          return new Response(JSON.stringify({ error: "สถานะการชำระเงินไม่ถูกต้อง อนุญาตเฉพาะ 'unpaid' หรือ 'paid' เท่านั้น" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }

        const statement = await env.HOUSE_RENT_KV.get(`monthly_statement:${month}`, { type: "json" });
        if (!statement) {
          return new Response(JSON.stringify({ error: `ไม่พบข้อมูลการคำนวณของเดือน ${month}` }), {
            status: 404,
            headers: JSON_HEADERS
          });
        }

        statement.paymentStatus = paymentStatus;
        statement.paidAt = paymentStatus === "paid" ? new Date().toISOString() : null;
        statement.updatedAt = new Date().toISOString();

        await env.HOUSE_RENT_KV.put(`monthly_statement:${month}`, JSON.stringify(statement));
        return new Response(JSON.stringify({ success: true, statement }), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 8. RECORDS HISTORY (ALL MONTHS)
      // -------------------------------------------------------------
      if (url.pathname === "/api/records" && method === "GET") {
        const statementList = await env.HOUSE_RENT_KV.list({ prefix: "monthly_statement:" });
        
        // เรียงลำดับจากเดือนล่าสุดไปหาอดีต โดยนำข้อจำกัด 12 เดือนออก
        const sortedKeys = statementList.keys
          .sort((a, b) => b.name.localeCompare(a.name));

        const statements = await Promise.all(
          sortedKeys.map((k) => env.HOUSE_RENT_KV.get(k.name, { type: "json" }))
        );

        const records = statements.filter((s) => s !== null);
        return new Response(JSON.stringify(records), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 9. OCR ROUTES
      // -------------------------------------------------------------
      if (url.pathname === "/api/ocr/bill" && method === "POST") {
        const body = await request.json();
        const ocrService = new OCRService(new StandardOCRProvider());
        const result = await ocrService.readUtilityBill(body.image);
        return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
      }

      if (url.pathname === "/api/ocr/meter" && method === "POST") {
        const body = await request.json();
        const ocrService = new OCRService(new StandardOCRProvider());
        const result = await ocrService.readMeter(body.image);
        return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 10. ANALYTICS ROUTES
      // -------------------------------------------------------------
      if (url.pathname === "/api/analytics" && method === "GET") {
        // Get settings for owner names
        const settings = await env.HOUSE_RENT_KV.get("settings", { type: "json" }) || DEFAULT_SETTINGS;

        // Get all statements
        const statementList = await env.HOUSE_RENT_KV.list({ prefix: "monthly_statement:" });
        const statements = await Promise.all(
          statementList.keys.map((k) => env.HOUSE_RENT_KV.get(k.name, { type: "json" }))
        );
        const validStatements = statements.filter((s) => s !== null);

        // Get all meter readings for usage analytics
        const meterList = await env.HOUSE_RENT_KV.list({ prefix: "meter_reading:" });
        const meterReadings = {};
        await Promise.all(meterList.keys.map(async (k) => {
          const month = k.name.replace("meter_reading:", "");
          const data = await env.HOUSE_RENT_KV.get(k.name, { type: "json" });
          if (data) meterReadings[month] = data;
        }));

        // Calculate owner shares
        const owner1Name = settings.owner1Name || "ป๊า";
        const owner2Name = settings.owner2Name || "อากู้";
        const waterReceiver = settings.waterReceiver || "owner2";

        // Initialize analytics
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        let totalRevenue = 0;
        let totalRevenueThisYear = 0;
        let totalRevenueThisMonth = 0;

        let totalOwner1Income = 0;
        let totalOwner1IncomeThisYear = 0;
        let totalOwner1IncomeThisMonth = 0;

        let totalOwner2Income = 0;
        let totalOwner2IncomeThisYear = 0;
        let totalOwner2IncomeThisMonth = 0;

        let totalElectricityUsage = 0;
        const monthlyUsage = [];
        const monthlyBreakdown = [];

        // Process each statement
        for (const stmt of validStatements) {
          const month = stmt.month;
          const [year, monthNum] = month.split("-").map(Number);
          const isThisYear = year === currentYear;
          const isThisMonth = month === currentMonth;

          // Revenue
          totalRevenue += stmt.totalBill || 0;
          if (isThisYear) totalRevenueThisYear += stmt.totalBill || 0;
          if (isThisMonth) totalRevenueThisMonth += stmt.totalBill || 0;

          // Calculate owner shares
          const netRentAmount = stmt.netRentAmount || 0;
          const electricProfit = stmt.electricProfit || 0;
          const actualElectricCost = stmt.actualElectricCost || 0;
          const waterAmount = stmt.waterAmount || 0;

          const rentHalf = netRentAmount / 2;
          const profitHalf = electricProfit / 2;

          let owner1Share = rentHalf + profitHalf;
          let owner2Share = rentHalf + profitHalf + actualElectricCost;

          // Add water to the designated receiver
          if (waterReceiver === "owner1") {
            owner1Share += waterAmount;
          } else {
            owner2Share += waterAmount;
          }

          // Owner 1 income
          totalOwner1Income += owner1Share;
          if (isThisYear) totalOwner1IncomeThisYear += owner1Share;
          if (isThisMonth) totalOwner1IncomeThisMonth += owner1Share;

          // Owner 2 income
          totalOwner2Income += owner2Share;
          if (isThisYear) totalOwner2IncomeThisYear += owner2Share;
          if (isThisMonth) totalOwner2IncomeThisMonth += owner2Share;

          // Electricity usage
          const usedUnit = stmt.usedUnit || 0;
          totalElectricityUsage += usedUnit;
          monthlyUsage.push({ month, usedUnit });

          // Monthly breakdown
          monthlyBreakdown.push({
            month,
            tenantBill: stmt.totalBill || 0,
            owner1Share: Math.round(owner1Share * 100) / 100,
            owner2Share: Math.round(owner2Share * 100) / 100,
            owner1Name,
            owner2Name,
            paymentStatus: stmt.paymentStatus || "unpaid",
            electricUsage: usedUnit,
            electricCharge: stmt.electricCharge || 0,
            isPaid: stmt.paymentStatus === "paid"
          });
        }

        // Sort monthly breakdown by month (descending)
        monthlyBreakdown.sort((a, b) => b.month.localeCompare(a.month));

        // Calculate statistics
        const paidStatements = validStatements.filter((s) => s.paymentStatus === "paid");
        const paidRevenue = paidStatements.reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const unpaidRevenue = totalRevenue - paidRevenue;

        // Owner percentage shares (all time)
        const totalOwnerIncome = totalOwner1Income + totalOwner2Income;
        const owner1Percentage = totalOwnerIncome > 0 ? (totalOwner1Income / totalOwnerIncome) * 100 : 50;
        const owner2Percentage = totalOwnerIncome > 0 ? (totalOwner2Income / totalOwnerIncome) * 100 : 50;

        // Electricity statistics
        const avgMonthlyUsage = monthlyUsage.length > 0
          ? totalElectricityUsage / monthlyUsage.length
          : 0;

        let highestUsageMonth = null;
        let lowestUsageMonth = null;
        let highestUsage = 0;
        let lowestUsage = Infinity;

        for (const item of monthlyUsage) {
          if (item.usedUnit >= highestUsage) {
            highestUsage = item.usedUnit;
            highestUsageMonth = item.month;
          }
          if (item.usedUnit <= lowestUsage) {
            lowestUsage = item.usedUnit;
            lowestUsageMonth = item.month;
          }
        }

        if (lowestUsage === Infinity) lowestUsage = 0;
        if (!highestUsageMonth) highestUsageMonth = monthlyUsage[0]?.month || null;
        if (!lowestUsageMonth) lowestUsageMonth = monthlyUsage[0]?.month || null;

        // Last 12 months for table
        const last12Months = monthlyBreakdown.slice(0, 12);

        // Calculate totals for last 12 months
        const totals12Months = last12Months.reduce((acc, m) => ({
          tenantBill: acc.tenantBill + m.tenantBill,
          owner1Share: acc.owner1Share + m.owner1Share,
          owner2Share: acc.owner2Share + m.owner2Share,
          paidCount: acc.paidCount + (m.isPaid ? 1 : 0),
          totalCount: acc.totalCount + 1
        }), { tenantBill: 0, owner1Share: 0, owner2Share: 0, paidCount: 0, totalCount: 0 });

        // Chart data: last 12 months for trend
        const chartData = monthlyBreakdown.slice(0, 12).reverse();

        const analyticsResponse = {
          revenue: {
            total: Math.round(totalRevenue * 100) / 100,
            totalThisYear: Math.round(totalRevenueThisYear * 100) / 100,
            totalThisMonth: Math.round(totalRevenueThisMonth * 100) / 100,
            paidRevenue: Math.round(paidRevenue * 100) / 100,
            unpaidRevenue: Math.round(unpaidRevenue * 100) / 100
          },
          owners: {
            owner1: {
              name: owner1Name,
              totalIncome: Math.round(totalOwner1Income * 100) / 100,
              incomeThisYear: Math.round(totalOwner1IncomeThisYear * 100) / 100,
              incomeThisMonth: Math.round(totalOwner1IncomeThisMonth * 100) / 100,
              percentage: Math.round(owner1Percentage * 10) / 10
            },
            owner2: {
              name: owner2Name,
              totalIncome: Math.round(totalOwner2Income * 100) / 100,
              incomeThisYear: Math.round(totalOwner2IncomeThisYear * 100) / 100,
              incomeThisMonth: Math.round(totalOwner2IncomeThisMonth * 100) / 100,
              percentage: Math.round(owner2Percentage * 10) / 10
            }
          },
          electricity: {
            totalUsage: totalElectricityUsage,
            averageMonthlyUsage: Math.round(avgMonthlyUsage * 10) / 10,
            highestUsageMonth,
            highestUsage,
            lowestUsageMonth,
            lowestUsage,
            totalStatements: validStatements.length
          },
          monthly: {
            breakdown: last12Months,
            totals: {
              tenantBill: Math.round(totals12Months.tenantBill * 100) / 100,
              owner1Share: Math.round(totals12Months.owner1Share * 100) / 100,
              owner2Share: Math.round(totals12Months.owner2Share * 100) / 100,
              paidCount: totals12Months.paidCount,
              totalCount: totals12Months.totalCount
            }
          },
          chart: {
            labels: chartData.map((m) => m.month),
            revenueData: chartData.map((m) => m.tenantBill),
            owner1Data: chartData.map((m) => m.owner1Share),
            owner2Data: chartData.map((m) => m.owner2Share),
            usageData: chartData.map((m) => m.electricUsage)
          },
          summary: {
            totalStatements: validStatements.length,
            paidStatements: paidStatements.length,
            unpaidStatements: validStatements.length - paidStatements.length,
            hasData: validStatements.length > 0
          }
        };

        return new Response(JSON.stringify(analyticsResponse), { headers: JSON_HEADERS });
      }

      // -------------------------------------------------------------
      // 11. BACKUP & RESTORE ROUTES
      // -------------------------------------------------------------
      
      // Export all data as JSON
      if (url.pathname === "/api/backup" && method === "GET") {
        // Get all data in parallel
        const [
          settings,
          adminAccount,
          utilityBillsResult,
          meterReadingsResult,
          statementsResult
        ] = await Promise.all([
          env.HOUSE_RENT_KV.get("settings", { type: "json" }),
          env.HOUSE_RENT_KV.get("auth:admin", { type: "json" }),
          env.HOUSE_RENT_KV.list({ prefix: "utility_bill:" }),
          env.HOUSE_RENT_KV.list({ prefix: "meter_reading:" }),
          env.HOUSE_RENT_KV.list({ prefix: "monthly_statement:" })
        ]);

        // Fetch all utility bills
        const utilityBills = {};
        await Promise.all(utilityBillsResult.keys.map(async (k) => {
          const month = k.name.replace("utility_bill:", "");
          const data = await env.HOUSE_RENT_KV.get(k.name, { type: "json" });
          if (data) utilityBills[month] = data;
        }));

        // Fetch all meter readings
        const meterReadings = {};
        await Promise.all(meterReadingsResult.keys.map(async (k) => {
          const month = k.name.replace("meter_reading:", "");
          const data = await env.HOUSE_RENT_KV.get(k.name, { type: "json" });
          if (data) meterReadings[month] = data;
        }));

        // Fetch all monthly statements
        const monthlyStatements = {};
        await Promise.all(statementsResult.keys.map(async (k) => {
          const month = k.name.replace("monthly_statement:", "");
          const data = await env.HOUSE_RENT_KV.get(k.name, { type: "json" });
          if (data) monthlyStatements[month] = data;
        }));

        const backupData = {
          version: "1.0",
          exportedAt: new Date().toISOString(),
          appName: "rental-billing",
          data: {
            settings: settings || null,
            utilityBills,
            meterReadings,
            monthlyStatements
          }
        };

        return new Response(JSON.stringify(backupData, null, 2), {
          headers: {
            ...JSON_HEADERS,
            "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`
          }
        });
      }

      // Validate backup data schema
      function validateBackupData(data) {
        const errors = [];

        if (!data || typeof data !== "object") {
          errors.push("Invalid backup format: not a valid JSON object");
          return { isValid: false, errors };
        }

        if (!data.data || typeof data.data !== "object") {
          errors.push("Invalid backup format: missing 'data' object");
          return { isValid: false, errors };
        }

        // Validate settings if present
        if (data.data.settings !== null && data.data.settings !== undefined) {
          if (typeof data.data.settings !== "object") {
            errors.push("Settings must be an object or null");
          } else {
            const requiredSettings = ["baseRentAmount", "rentDiscount", "waterAmount", "electricSellRate"];
            for (const key of requiredSettings) {
              if (typeof data.data.settings[key] !== "number") {
                errors.push(`Settings.${key} must be a number`);
              }
            }
          }
        }

        // Validate utility bills
        if (data.data.utilityBills) {
          if (typeof data.data.utilityBills !== "object") {
            errors.push("utilityBills must be an object");
          } else {
            for (const [month, bill] of Object.entries(data.data.utilityBills)) {
              if (!isValidMonthFormat(month)) {
                errors.push(`Invalid month format in utilityBills: ${month}`);
              }
              if (typeof bill !== "object" || typeof bill.unit !== "number" || typeof bill.amount !== "number") {
                errors.push(`Invalid utility bill data for month ${month}`);
              }
            }
          }
        }

        // Validate meter readings
        if (data.data.meterReadings) {
          if (typeof data.data.meterReadings !== "object") {
            errors.push("meterReadings must be an object");
          } else {
            for (const [month, reading] of Object.entries(data.data.meterReadings)) {
              if (!isValidMonthFormat(month)) {
                errors.push(`Invalid month format in meterReadings: ${month}`);
              }
              if (typeof reading !== "object" || 
                  typeof reading.previousReading !== "number" || 
                  typeof reading.currentReading !== "number") {
                errors.push(`Invalid meter reading data for month ${month}`);
              }
            }
          }
        }

        // Validate monthly statements
        if (data.data.monthlyStatements) {
          if (typeof data.data.monthlyStatements !== "object") {
            errors.push("monthlyStatements must be an object");
          } else {
            for (const [month, statement] of Object.entries(data.data.monthlyStatements)) {
              if (!isValidMonthFormat(month)) {
                errors.push(`Invalid month format in monthlyStatements: ${month}`);
              }
              if (typeof statement !== "object" || 
                  typeof statement.totalBill !== "number") {
                errors.push(`Invalid statement data for month ${month}`);
              }
            }
          }
        }

        return {
          isValid: errors.length === 0,
          errors
        };
      }

      // Preview restore (validate without importing)
      if (url.pathname === "/api/restore/preview" && method === "POST") {
        try {
          const payload = await request.json();
          
          if (!payload.backupData) {
            return new Response(JSON.stringify({ error: "Missing backupData in request" }), {
              status: 400,
              headers: JSON_HEADERS
            });
          }

          const validation = validateBackupData(payload.backupData);
          
          if (!validation.isValid) {
            return new Response(JSON.stringify({
              valid: false,
              errors: validation.errors
            }), { headers: JSON_HEADERS });
          }

          const { settings, utilityBills, meterReadings, monthlyStatements } = payload.backupData.data;

          // Count items
          const summary = {
            hasSettings: settings !== null && settings !== undefined,
            utilityBillsCount: Object.keys(utilityBills || {}).length,
            meterReadingsCount: Object.keys(meterReadings || {}).length,
            monthlyStatementsCount: Object.keys(monthlyStatements || {}).length,
            months: Object.keys(monthlyStatements || {}).sort()
          };

          // Check for conflicts with existing data
          const conflicts = { settings: false, months: [] };
          
          if (settings) {
            const existingSettings = await env.HOUSE_RENT_KV.get("settings", { type: "json" });
            if (existingSettings) conflicts.settings = true;
          }

          const existingMonths = [];
          for (const month of Object.keys(monthlyStatements || {})) {
            const existing = await env.HOUSE_RENT_KV.get(`monthly_statement:${month}`, { type: "json" });
            if (existing) conflicts.months.push(month);
          }

          return new Response(JSON.stringify({
            valid: true,
            summary,
            conflicts,
            willOverwrite: conflicts.settings || conflicts.months.length > 0
          }), { headers: JSON_HEADERS });

        } catch (err) {
          console.error("Restore preview error:", err);
          return new Response(JSON.stringify({ error: "Invalid backup file format" }), {
            status: 400,
            headers: JSON_HEADERS
          });
        }
      }

      // Execute restore
      if (url.pathname === "/api/restore" && method === "POST") {
        try {
          const payload = await request.json();
          
          if (!payload.backupData) {
            return new Response(JSON.stringify({ error: "Missing backupData in request" }), {
              status: 400,
              headers: JSON_HEADERS
            });
          }

          // Validate first
          const validation = validateBackupData(payload.backupData);
          if (!validation.isValid) {
            return new Response(JSON.stringify({
              error: "Backup data validation failed",
              errors: validation.errors
            }), { status: 400, headers: JSON_HEADERS });
          }

          const { settings, utilityBills, meterReadings, monthlyStatements } = payload.backupData.data;
          const importedAt = new Date().toISOString();
          const importedMonths = [];

          // Create backup of current data before overwriting
          const currentBackup = {
            version: "1.0",
            exportedAt: importedAt,
            appName: "rental-billing",
            backupType: "auto-before-restore",
            data: { settings: null, utilityBills: {}, meterReadings: {}, monthlyStatements: {} }
          };

          // Backup current settings if exists
          const currentSettings = await env.HOUSE_RENT_KV.get("settings", { type: "json" });
          if (currentSettings) currentBackup.data.settings = currentSettings;

          // Backup current data by months
          for (const month of Object.keys(monthlyStatements || {})) {
            const existingStatement = await env.HOUSE_RENT_KV.get(`monthly_statement:${month}`, { type: "json" });
            if (existingStatement) {
              currentBackup.data.monthlyStatements[month] = existingStatement;
            }
            const existingBill = await env.HOUSE_RENT_KV.get(`utility_bill:${month}`, { type: "json" });
            if (existingBill) {
              currentBackup.data.utilityBills[month] = existingBill;
            }
            const existingReading = await env.HOUSE_RENT_KV.get(`meter_reading:${month}`, { type: "json" });
            if (existingReading) {
              currentBackup.data.meterReadings[month] = existingReading;
            }
          }

          // Save auto-backup with timestamp
          await env.HOUSE_RENT_KV.put(
            `auto_backup:${importedAt.slice(0, 10)}-${Date.now()}`,
            JSON.stringify(currentBackup)
          );

          // Import settings
          if (settings) {
            await env.HOUSE_RENT_KV.put("settings", JSON.stringify({
              ...settings,
              restoredAt: importedAt
            }));
          }

          // Import utility bills
          if (utilityBills) {
            for (const [month, bill] of Object.entries(utilityBills)) {
              await env.HOUSE_RENT_KV.put(`utility_bill:${month}`, JSON.stringify({
                ...bill,
                restoredAt: importedAt
              }));
              importedMonths.push(month);
            }
          }

          // Import meter readings
          if (meterReadings) {
            for (const [month, reading] of Object.entries(meterReadings)) {
              await env.HOUSE_RENT_KV.put(`meter_reading:${month}`, JSON.stringify({
                ...reading,
                restoredAt: importedAt
              }));
            }
          }

          // Import monthly statements
          if (monthlyStatements) {
            for (const [month, statement] of Object.entries(monthlyStatements)) {
              await env.HOUSE_RENT_KV.put(`monthly_statement:${month}`, JSON.stringify({
                ...statement,
                restoredAt: importedAt
              }));
            }
          }

          const uniqueMonths = [...new Set(importedMonths)];
          
          return new Response(JSON.stringify({
            success: true,
            importedAt,
            importedMonths: uniqueMonths.sort(),
            totalImported: {
              settings: settings ? 1 : 0,
              utilityBills: Object.keys(utilityBills || {}).length,
              meterReadings: Object.keys(meterReadings || {}).length,
              monthlyStatements: Object.keys(monthlyStatements || {}).length
            }
          }), { headers: JSON_HEADERS });

        } catch (err) {
          console.error("Restore error:", err);
          return new Response(JSON.stringify({ error: "Failed to restore data: " + err.message }), {
            status: 500,
            headers: JSON_HEADERS
          });
        }
      }

      return new Response(JSON.stringify({ error: "API Endpoint Not Found" }), {
        status: 404,
        headers: JSON_HEADERS
      });
    } catch (err) {
      // Log full error internally for debugging
      console.error("Internal Server Error:", err);
      // Return sanitized error message to client (don't leak internal details)
      return new Response(JSON.stringify({ error: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง" }), {
        status: 500,
        headers: JSON_HEADERS
      });
    }
  }
};