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

        if (password.length < 4) {
          return new Response(JSON.stringify({ error: "รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร" }), {
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

        if (username !== adminAccount.username) {
          return new Response(JSON.stringify({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }), {
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

        const statement = {
          month,
          ...statementCalc,
          paymentMethod: settings.paymentMethod || "bank",
          bankAccount: settings.bankAccount || "",
          paymentStatus,
          paidAt,
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

      return new Response(JSON.stringify({ error: "API Endpoint Not Found" }), {
        status: 404,
        headers: JSON_HEADERS
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "เกิดข้อผิดพลาดภายในระบบ: " + err.message }), {
        status: 500,
        headers: JSON_HEADERS
      });
    }
  }
};