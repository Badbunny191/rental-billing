/**
 * OCR Abstraction Layer
 * รองรับการเปลี่ยนผ่าน Provider ในอนาคตโดยไม่กระทบ Business Logic
 */

export class BaseOCRProvider {
  async parseUtilityBill(imageData) {
    throw new Error("Method 'parseUtilityBill' must be implemented.");
  }

  async parseMeterReading(imageData) {
    throw new Error("Method 'parseMeterReading' must be implemented.");
  }
}

export class StandardOCRProvider extends BaseOCRProvider {
  constructor(apiKey = "") {
    super();
    this.apiKey = apiKey;
  }

  async parseUtilityBill(imageData) {
    return {
      provider: "StandardOCR",
      unit: null,
      amount: null,
      confidence: 0,
      requiresConfirmation: true,
      rawText: ""
    };
  }

  async parseMeterReading(imageData) {
    return {
      provider: "StandardOCR",
      reading: null,
      confidence: 0,
      requiresConfirmation: true,
      rawText: ""
    };
  }
}

export class OCRService {
  constructor(provider) {
    this.provider = provider;
  }

  setProvider(provider) {
    this.provider = provider;
  }

  async readUtilityBill(imageData) {
    return await this.provider.parseUtilityBill(imageData);
  }

  async readMeter(imageData) {
    const result = await this.provider.parseMeterReading(imageData);
    if (result.reading !== null && result.reading !== undefined) {
      result.reading = Math.floor(Number(result.reading));
    }
    return result;
  }
}