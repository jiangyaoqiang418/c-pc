interface QRCode {
  addData(data: string): void;
  make(): void;
  createSvgTag(options: { cellSize: number; margin: number; scalable: boolean }): string;
}
export default function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QRCode;
